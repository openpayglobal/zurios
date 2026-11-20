import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {runIdempotentMutation,IdempotencyConflictError} from "./idempotency-service.js";
import {appendOutboxEvent,dispatchOutboxBatch,replayDeadLetterEvent,consumeEventOnce,createMongoEventBusPublisher,runOutboxWorker} from "./outbox-service.js";
import {registerWebhookSubscription,queueWebhookDeliveries,dispatchWebhookBatch,replayDeadLetterWebhookDelivery} from "./webhook-delivery-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("idempotency, audit-compatible outbox and delivery lifecycle are transactional",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_reliability_${randomUUID().replaceAll("-","")}`);
 try{
  await db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true});
  await db.collection("idempotency_records").createIndex({expiresAt:1},{expireAfterSeconds:0});
  await db.collection("outbox_events").createIndex({eventId:1},{unique:true});
  await db.collection("event_consumer_receipts").createIndex({consumerId:1,eventId:1},{unique:true});
  await db.collection("platform_events").createIndex({eventId:1},{unique:true});
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
  assert.equal(await db.collection("outbox_events").countDocuments({}),2);
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
  const mongoPublisher=createMongoEventBusPublisher(db);
  const dispatch=await dispatchOutboxBatch(db,async event=>{delivered++;assert.ok(["resource.created","resource.concurrent"].includes(event.eventType));await mongoPublisher(event);},{workerId:"worker-a",batchSize:10});
  assert.equal(dispatch.claimed,2);
  assert.equal(dispatch.published,2);
  assert.equal(delivered,2);
  assert.equal(await db.collection("outbox_events").countDocuments({status:"published"}),2);
  assert.equal(await db.collection("platform_events").countDocuments({}),2);

  const sourceEvent=await db.collection("platform_events").findOne({eventType:"resource.created"});
  assert.ok(sourceEvent);
  let consumerEffects=0;
  const consume=()=>consumeEventOnce(db,"analytics-projection-v1",sourceEvent as any,async session=>{
   consumerEffects++;
   await db.collection("consumer_effects").insertOne({consumerId:"analytics-projection-v1",eventId:sourceEvent!.eventId},{session});
  });
  const consumed=await consume(),consumerReplay=await consume();
  assert.equal(consumed.replayed,false);
  assert.equal(consumerReplay.replayed,true);
  assert.equal(consumerEffects,1);
  assert.equal(await db.collection("consumer_effects").countDocuments({}),1);

  await assert.rejects(()=>registerWebhookSubscription(db,{tenantId:"tenant-a",endpointId:"unsafe-hook",url:"http://127.0.0.1/hook",secretRef:"vault/unsafe",eventTypes:["resource.created"]},"admin-a",["127.0.0.1"]),/WEBHOOK_DESTINATION_NOT_ALLOWED/);
  await registerWebhookSubscription(db,{tenantId:"tenant-a",endpointId:"hook-a",url:"https://hooks.example.test/events",secretRef:"vault/tenant-a/hook-a",eventTypes:["resource.created"]},"admin-a",["hooks.example.test"]);
  assert.equal(await queueWebhookDeliveries(db,sourceEvent as any),1);
  let receivedSignature="",receivedEventId="";
  const delivery=await dispatchWebhookBatch(db,{resolveSecret:async()=> "s".repeat(32),fetch:async(_url,init)=>{
   const headers=new Headers(init.headers);
   receivedSignature=headers.get("x-zuri-signature")??"";
   receivedEventId=headers.get("x-zuri-event-id")??"";
   return new Response(null,{status:204});
  }},{workerId:"webhook-worker-a",batchSize:5});
  assert.equal(delivery.delivered,1);
  assert.equal(receivedEventId,sourceEvent!.eventId);
  assert.match(receivedSignature,/^sha256=[a-f0-9]{64}$/);
  assert.equal(await db.collection("webhook_deliveries").countDocuments({endpointId:"hook-a",status:"delivered"}),1);
  await registerWebhookSubscription(db,{tenantId:"tenant-a",endpointId:"hook-b",url:"https://hooks.example.test/retry",secretRef:"vault/tenant-a/hook-b",eventTypes:["resource.created"]},"admin-a",["hooks.example.test"]);
  assert.equal(await queueWebhookDeliveries(db,sourceEvent as any),1);
  const failedDelivery=await dispatchWebhookBatch(db,{resolveSecret:async()=>"r".repeat(32),fetch:async()=>new Response(null,{status:503})},{workerId:"webhook-worker-b",maxAttempts:1});
  assert.equal(failedDelivery.deadLettered,1);
  const deadDelivery=await db.collection<any>("webhook_deliveries").findOne({endpointId:"hook-b",eventId:sourceEvent!.eventId});
  assert.equal(deadDelivery.status,"dead_letter");
  assert.equal(await replayDeadLetterWebhookDelivery(db,deadDelivery.deliveryId),true);
  const replayDelivery=await dispatchWebhookBatch(db,{resolveSecret:async()=>"r".repeat(32),fetch:async()=>new Response(null,{status:204})},{workerId:"webhook-worker-c"});
  assert.equal(replayDelivery.delivered,1);

  await db.collection("outbox_events").insertOne({
   eventId:"dead-letter-event",tenantId:"tenant-a",eventType:"resource.dead",aggregateType:"resource",
   payload:{},occurredAt:new Date(),status:"pending",attempts:0,availableAt:new Date(0),createdAt:new Date(),updatedAt:new Date()
  });
  const dead=await dispatchOutboxBatch(db,async()=>{throw new Error("provider unavailable");},{workerId:"worker-b",batchSize:1,maxAttempts:1});
  assert.equal(dead.deadLettered,1);
  assert.equal(await replayDeadLetterEvent(db,"dead-letter-event"),true);
  const replayed=await dispatchOutboxBatch(db,async()=>{}, {workerId:"worker-c",batchSize:1});
  assert.equal(replayed.published,1);

  await db.collection("outbox_events").insertOne({
   eventId:"worker-recovery-event",tenantId:"tenant-a",eventType:"resource.worker.recovery",aggregateType:"resource",
   payload:{},occurredAt:new Date(),status:"pending",attempts:0,availableAt:new Date(),createdAt:new Date(),updatedAt:new Date()
  });
  const originalCollection=db.collection.bind(db);
  let failFirstPoll=true,workerErrors=0,workerDelivered=0;
  const transientDb=new Proxy(db,{get(target,property){
   if(property==="collection")return (...args:unknown[])=>{
    if(failFirstPoll){failFirstPoll=false;throw new Error("simulated transient Mongo poll failure");}
    return (originalCollection as (...values:unknown[])=>unknown)(...args);
   };
   return Reflect.get(target,property,target);
  }}) as any;
  const controller=new AbortController();
  await runOutboxWorker(transientDb,async event=>{
   workerDelivered++;
   await mongoPublisher(event);
   controller.abort();
  },controller.signal,{pollIntervalMs:250,onError:()=>{workerErrors++;}});
  assert.equal(workerErrors,1);
  assert.equal(workerDelivered,1);
  assert.equal(await db.collection("outbox_events").countDocuments({eventId:"worker-recovery-event",status:"published"}),1);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
