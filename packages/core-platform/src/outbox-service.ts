import {randomUUID} from "node:crypto";
import type {ClientSession,Db} from "mongodb";
import {z} from "zod";

export type OutboxEventDocument={
 eventId:string;tenantId:string;eventType:string;schemaVersion:1;aggregateType:string;aggregateId?:string;
 payload:Record<string,unknown>;occurredAt:Date;correlationId?:string;
 status:"pending"|"processing"|"published"|"dead_letter";attempts:number;
 availableAt:Date;leaseOwner?:string;leaseUntil?:Date;publishedAt?:Date;lastError?:string;
 createdAt:Date;updatedAt:Date;
};
const schema=z.object({
 tenantId:z.string().min(1),eventType:z.string().min(3).max(180),
 aggregateType:z.string().min(2).max(100),aggregateId:z.string().max(200).optional(),
 payload:z.record(z.unknown()).default({}),correlationId:z.string().max(200).optional()
});
export async function appendOutboxEvent(db:Db,session:ClientSession,input:unknown){
 const d=schema.parse(input),now=new Date();
 const doc:OutboxEventDocument={
  eventId:randomUUID(),tenantId:d.tenantId,eventType:d.eventType,schemaVersion:1,aggregateType:d.aggregateType,...(d.aggregateId?{aggregateId:d.aggregateId}:{}),payload:d.payload,...(d.correlationId?{correlationId:d.correlationId}:{}),occurredAt:now,status:"pending",attempts:0,
  availableAt:now,createdAt:now,updatedAt:now
 };
 await db.collection<OutboxEventDocument>("outbox_events").insertOne(doc,{session});
 return {eventId:doc.eventId,occurredAt:doc.occurredAt};
}
export type OutboxPublisher=(event:OutboxEventDocument)=>Promise<void>;
export async function dispatchOutboxBatch(db:Db,publisher:OutboxPublisher,options?:{
 workerId?:string;batchSize?:number;leaseMs?:number;maxAttempts?:number;now?:Date
}):Promise<{claimed:number;published:number;retried:number;deadLettered:number}>{
 const workerId=options?.workerId??`outbox-${randomUUID()}`,batchSize=Math.max(1,Math.min(100,options?.batchSize??20));
 const leaseMs=Math.max(5_000,options?.leaseMs??30_000),maxAttempts=Math.max(1,options?.maxAttempts??12);
 const now=options?.now??new Date(),collection=db.collection<OutboxEventDocument>("outbox_events");
 let claimed=0,published=0,retried=0,deadLettered=0;
 for(let i=0;i<batchSize;i++){
  const event=await collection.findOneAndUpdate(
   {$or:[
    {status:"pending",availableAt:{$lte:now}},
    {status:"processing",leaseUntil:{$lte:now}}
   ]},
   {$set:{status:"processing",leaseOwner:workerId,leaseUntil:new Date(now.getTime()+leaseMs),updatedAt:now},$inc:{attempts:1}},
   {sort:{availableAt:1,occurredAt:1},returnDocument:"after"}
  );
  if(!event)break;
  claimed++;
  try{
   await publisher(event);
   const result=await collection.updateOne(
    {eventId:event.eventId,status:"processing",leaseOwner:workerId},
    {$set:{status:"published",publishedAt:new Date(),updatedAt:new Date()},$unset:{leaseOwner:"",leaseUntil:"",lastError:""}}
   );
   if(result.matchedCount)published++;
  }catch(error){
   const attempts=event.attempts,dead=attempts>=maxAttempts,delay=Math.min(3_600_000,1_000*2**Math.min(attempts-1,12)),updatedAt=new Date();
   await collection.updateOne(
    {eventId:event.eventId,status:"processing",leaseOwner:workerId},
    {$set:{status:dead?"dead_letter":"pending",availableAt:new Date(updatedAt.getTime()+delay),updatedAt,lastError:(error instanceof Error?error.message:"PUBLISH_FAILED").slice(0,1000)},$unset:{leaseOwner:"",leaseUntil:""}}
   );
   if(dead)deadLettered++;else retried++;
  }
 }
 return {claimed,published,retried,deadLettered};
}
export async function replayDeadLetterEvent(db:Db,eventId:string):Promise<boolean>{
 const now=new Date(),result=await db.collection<OutboxEventDocument>("outbox_events").updateOne(
  {eventId,status:"dead_letter"},
  {$set:{status:"pending",attempts:0,availableAt:now,updatedAt:now},$unset:{lastError:"",leaseOwner:"",leaseUntil:""}}
 );
 return result.modifiedCount===1;
}

function waitForNextPoll(milliseconds:number,signal:AbortSignal):Promise<void>{
 return new Promise(resolve=>{
  if(signal.aborted){resolve();return;}
  const finish=()=>{clearTimeout(timer);signal.removeEventListener("abort",finish);resolve();};
  const timer=setTimeout(finish,milliseconds);
  signal.addEventListener("abort",finish,{once:true});
 });
}
export async function runOutboxWorker(
 db:Db,publisher:OutboxPublisher,signal:AbortSignal,options?:{
  workerId?:string;batchSize?:number;leaseMs?:number;maxAttempts?:number;pollIntervalMs?:number
 }
):Promise<void>{
 const workerId=options?.workerId??`outbox-worker-${randomUUID()}`;
 const pollIntervalMs=Math.max(250,options?.pollIntervalMs??2_000);
 while(!signal.aborted){
  const result=await dispatchOutboxBatch(db,publisher,{...options,workerId});
  if(result.claimed===0)await waitForNextPoll(pollIntervalMs,signal);
 }
}

export type EventConsumerReceiptDocument={consumerId:string;eventId:string;tenantId:string;processedAt:Date};
export async function consumeEventOnce(
 db:Db,consumerId:string,event:OutboxEventDocument,
 handler:(session:ClientSession,event:OutboxEventDocument)=>Promise<void>
):Promise<{replayed:boolean}>{
 if(!consumerId.trim()||consumerId.length>160)throw new Error("INVALID_EVENT_CONSUMER_ID");
 const receipts=db.collection<EventConsumerReceiptDocument>("event_consumer_receipts");
 const session=db.client.startSession();
 try{
  let replayed=false;
  await session.withTransaction(async()=>{
   const existing=await receipts.findOne({consumerId,eventId:event.eventId},{session});
   if(existing){replayed=true;return;}
   await receipts.insertOne({consumerId,eventId:event.eventId,tenantId:event.tenantId,processedAt:new Date()},{session});
   await handler(session,event);
  },{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary"});
  return {replayed};
 }catch(error){
  if(error&&typeof error==="object"&&"code" in error&&(error as {code?:number}).code===11000){
   const existing=await receipts.findOne({consumerId,eventId:event.eventId});
   if(existing)return {replayed:true};
  }
  throw error;
 }finally{await session.endSession();}
}
