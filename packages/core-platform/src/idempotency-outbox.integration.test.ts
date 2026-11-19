import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {runIdempotentMutation,IdempotencyConflictError} from "./idempotency-service.js";
import {appendOutboxEvent,dispatchOutboxBatch,replayDeadLetterEvent} from "./outbox-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("idempotency, audit-compatible outbox and delivery lifecycle are transactional",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_reliability_${randomUUID().replaceAll("-","")}`);
 try{
  await db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true});
  await db.collection("idempotency_records").createIndex({expiresAt:1},{expireAfterSeconds:0});
  await db.collection("outbox_events").createIndex({eventId:1},{unique:true});
  await db.collection("outbox_events").createIndex({status:1,availableAt:1,occurredAt:1});
  const input={tenantId:"tenant-a",actorId:"user-a",operation:"tenant.resource.create",key:"idem-test-0001",request:{name:"Example",nested:{b:2,a:1}}};
  let executions=0;
  const work=async(session:any)=>{
   executions++;
   await db.collection("test_resources").insertOne({tenantId:"tenant-a",name:"Example"},{session});
   await appendOutboxEvent(db,session,{tenantId:"tenant-a",eventType:"resource.created",aggregateType:"resource",aggregateId:"resource-a",payload:{name:"Example"},correlationId:"request-a"});
   return {statusCode:201,body:{data:{resourceId:"resource-a"}}};
  };
  const first=await runIdempotentMutation(db,input,work);
  const replay=await runIdempotentMutation(db,input,work);
  assert.equal(first.replayed,false);
  assert.equal(replay.replayed,true);
  assert.deepEqual(replay.body,first.body);
  assert.equal(executions,1);

  const concurrentInput={...input,key:"idem-concurrent-001",operation:"tenant.resource.concurrent"};
  let concurrentExecutions=0;
  const concurrentWork=async(session:any)=>{
   concurrentExecutions++;
   await new Promise(resolve=>setTimeout(resolve,25));
   await db.collection("test_resources").insertOne({tenantId:"tenant-a",name:"Concurrent"},{session});
   await appendOutboxEvent(db,session,{tenantId:"tenant-a",eventType:"resource.concurrent",aggregateType:"resource",aggregateId:"resource-concurrent",payload:{}});
   return {statusCode:201,body:{data:{resourceId:"resource-concurrent"}}};
  };
  const concurrent=await Promise.all(Array.from({length:5},()=>runIdempotentMutation(db,concurrentInput,concurrentWork)));
  assert.equal(concurrentExecutions,1);
  assert.equal(concurrent.filter(result=>result.replayed).length,4);
  assert.equal(await db.collection("test_resources").countDocuments({name:"Concurrent"}),1);
  assert.equal(await db.collection("outbox_events").countDocuments({eventType:"resource.concurrent"}),1);

  assert.equal(await db.collection("test_resources").countDocuments({}),2);
  assert.equal(await db.collection("outbox_events").countDocuments({}),1);
  await assert.rejects(
   ()=>runIdempotentMutation(db,{...input,request:{name:"Different"}},work),
   (error:unknown)=>error instanceof IdempotencyConflictError&&error.message==="IDEMPOTENCY_KEY_REUSED"
  );

  const failedInput={...input,key:"idem-rollback-001",operation:"tenant.resource.rollback"};
  await assert.rejects(()=>runIdempotentMutation(db,failedInput,async session=>{
   await db.collection("test_resources").insertOne({tenantId:"tenant-a",name:"Must rollback"},{session});
   await appendOutboxEvent(db,session,{tenantId:"tenant-a",eventType:"resource.must-not-publish",aggregateType:"resource",payload:{}});
   throw new Error("simulated failure");
  }),/simulated failure/);
  assert.equal(await db.collection("test_resources").countDocuments({name:"Must rollback"}),0);
  assert.equal(await db.collection("outbox_events").countDocuments({eventType:"resource.must-not-publish"}),0);
  assert.equal(await db.collection("idempotency_records").countDocuments({key:failedInput.key}),0);

  let delivered=0;
  const dispatch=await dispatchOutboxBatch(db,async event=>{delivered++;assert.equal(event.eventType,"resource.created");},{workerId:"worker-a",batchSize:10});
  assert.equal(dispatch.claimed,1);
  assert.equal(dispatch.published,1);
  assert.equal(delivered,1);
  assert.equal(await db.collection("outbox_events").countDocuments({status:"published"}),1);

  await db.collection("outbox_events").insertOne({
   eventId:"dead-letter-event",tenantId:"tenant-a",eventType:"resource.dead",aggregateType:"resource",
   payload:{},occurredAt:new Date(),status:"pending",attempts:0,availableAt:new Date(0),createdAt:new Date(),updatedAt:new Date()
  });
  const dead=await dispatchOutboxBatch(db,async()=>{throw new Error("provider unavailable");},{workerId:"worker-b",batchSize:1,maxAttempts:1});
  assert.equal(dead.deadLettered,1);
  assert.equal(await replayDeadLetterEvent(db,"dead-letter-event"),true);
  const replayed=await dispatchOutboxBatch(db,async()=>{}, {workerId:"worker-c",batchSize:1});
  assert.equal(replayed.published,1);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
