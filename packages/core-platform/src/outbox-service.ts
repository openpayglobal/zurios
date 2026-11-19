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
  eventId:randomUUID(),...d,schemaVersion:1,occurredAt:now,status:"pending",attempts:0,
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
