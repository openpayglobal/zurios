import {createHmac,randomUUID} from "node:crypto";
import {isIP} from "node:net";
import type {Db} from "mongodb";
import {z} from "zod";
import {runIdempotentMutation} from "./idempotency-service.js";

type WebhookEvent={eventId:string;tenantId:string;eventType:string;schemaVersion:number;occurredAt:Date;correlationId?:string;aggregateType:string;aggregateId?:string;payload:Record<string,unknown>};
type Subscription={tenantId:string;endpointId:string;url:string;secretRef:string;eventTypes:string[];status:"active"|"inactive";createdAt:Date;updatedAt:Date;createdBy:string};
type Delivery={deliveryId:string;tenantId:string;endpointId:string;eventId:string;eventType:string;url:string;secretRef:string;body:string;status:"pending"|"processing"|"delivered"|"dead_letter";attempts:number;availableAt:Date;leaseOwner?:string;leaseUntil?:Date;deliveredAt?:Date;lastError?:string;createdAt:Date;updatedAt:Date};
const subscriptionSchema=z.object({
 tenantId:z.string().min(1),endpointId:z.string().min(1).max(128),url:z.string().url().max(2048),
 secretRef:z.string().min(1).max(256),eventTypes:z.array(z.string().min(3).max(180)).min(1).max(100)
});
function validateDestination(value:string,allowedHosts:string[]){
 const url=new URL(value),host=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||isIP(host)!==0||host==="localhost"||host.endsWith(".localhost"))throw new Error("WEBHOOK_DESTINATION_NOT_ALLOWED");
 if(!allowedHosts.map(item=>item.toLowerCase()).includes(host))throw new Error("WEBHOOK_HOST_NOT_ALLOWLISTED");
 return url.toString();
}
export async function registerWebhookSubscription(db:Db,input:unknown,actorId:string,allowedHosts:string[]){
 const parsed=subscriptionSchema.parse(input),url=validateDestination(parsed.url,allowedHosts);
 const subscription={...parsed,url,status:"active" as const};
 return runIdempotentMutation(db,{tenantId:parsed.tenantId,actorId,operation:"platform.webhook.register",key:"webhook-"+parsed.endpointId,request:subscription},async session=>{
  const now=new Date();
  await db.collection<Subscription>("webhook_subscriptions").insertOne({...subscription,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  return {statusCode:201,body:{endpointId:parsed.endpointId}};
 });
}
export async function deactivateWebhookSubscription(db:Db,tenantId:string,endpointId:string,actorId:string){
 const result=await db.collection<Subscription>("webhook_subscriptions").updateOne({tenantId,endpointId,status:"active"},{$set:{status:"inactive",updatedAt:new Date(),updatedBy:actorId}});
 if(result.matchedCount!==1)throw new Error("ACTIVE_WEBHOOK_SUBSCRIPTION_NOT_FOUND");
}
export async function queueWebhookDeliveries(db:Db,event:WebhookEvent){
 const subscriptions=await db.collection<Subscription>("webhook_subscriptions").find({tenantId:event.tenantId,status:"active",eventTypes:event.eventType}).toArray();
 if(!subscriptions.length)return 0;
 const body=JSON.stringify(event),now=new Date();let queued=0;
 for(const subscription of subscriptions){
  const result=await db.collection<Delivery>("webhook_deliveries").updateOne(
   {tenantId:event.tenantId,endpointId:subscription.endpointId,eventId:event.eventId},
   {$setOnInsert:{deliveryId:randomUUID(),tenantId:event.tenantId,endpointId:subscription.endpointId,eventId:event.eventId,eventType:event.eventType,url:subscription.url,secretRef:subscription.secretRef,body,status:"pending",attempts:0,availableAt:now,createdAt:now,updatedAt:now}},
   {upsert:true}
  );
  if(result.upsertedCount)queued++;
 }
 return queued;
}
export type WebhookSecretResolver=(secretRef:string)=>Promise<string>;
export type WebhookFetch=(url:string,init:RequestInit)=>Promise<Response>;
export async function dispatchWebhookBatch(db:Db,dependencies:{resolveSecret:WebhookSecretResolver;fetch?:WebhookFetch},options?:{workerId?:string;batchSize?:number;leaseMs?:number;maxAttempts?:number;timeoutMs?:number;now?:Date}){
 const workerId=options?.workerId??"webhook-worker-"+randomUUID(),batchSize=Math.max(1,Math.min(100,options?.batchSize??20));
 const leaseMs=Math.max(5000,options?.leaseMs??30000),maxAttempts=Math.max(1,options?.maxAttempts??12),now=options?.now??new Date();
 const c=db.collection<Delivery>("webhook_deliveries");let claimed=0,delivered=0,retried=0,deadLettered=0;
 for(let i=0;i<batchSize;i++){
  const delivery=await c.findOneAndUpdate({$or:[{status:"pending",availableAt:{$lte:now}},{status:"processing",leaseUntil:{$lte:now}}]},{$set:{status:"processing",leaseOwner:workerId,leaseUntil:new Date(now.getTime()+leaseMs),updatedAt:now},$inc:{attempts:1}},{sort:{availableAt:1,createdAt:1},returnDocument:"after"});
  if(!delivery)break;
  claimed++;
  try{
   const secret=await dependencies.resolveSecret(delivery.secretRef);
   if(secret.length<32)throw new Error("WEBHOOK_SIGNING_SECRET_TOO_SHORT");
   const timestamp=Math.floor(Date.now()/1000).toString();
   const signature=createHmac("sha256",secret).update(timestamp+"."+delivery.body).digest("hex");
   const response=await (dependencies.fetch??fetch)(delivery.url,{method:"POST",redirect:"error",headers:{"content-type":"application/json","x-zuri-event-id":delivery.eventId,"x-zuri-event-type":delivery.eventType,"x-zuri-timestamp":timestamp,"x-zuri-signature":"sha256="+signature},body:delivery.body,signal:AbortSignal.timeout(options?.timeoutMs??10000)});
   if(!response.ok)throw new Error("WEBHOOK_HTTP_"+response.status);
   const updated=await c.updateOne({deliveryId:delivery.deliveryId,status:"processing",leaseOwner:workerId},{$set:{status:"delivered",deliveredAt:new Date(),updatedAt:new Date()},$unset:{leaseOwner:"",leaseUntil:"",lastError:""}});
   if(updated.matchedCount)delivered++;
  }catch(error){
   const dead=delivery.attempts>=maxAttempts,updatedAt=new Date(),delay=Math.min(3600000,1000*2**Math.min(delivery.attempts-1,12));
   await c.updateOne({deliveryId:delivery.deliveryId,status:"processing",leaseOwner:workerId},{$set:{status:dead?"dead_letter":"pending",availableAt:new Date(updatedAt.getTime()+delay),updatedAt,lastError:(error instanceof Error?error.message:"WEBHOOK_DELIVERY_FAILED").slice(0,1000)},$unset:{leaseOwner:"",leaseUntil:""}});
   if(dead)deadLettered++;else retried++;
  }
 }
 return {claimed,delivered,retried,deadLettered};
}
export async function replayDeadLetterWebhookDelivery(db:Db,deliveryId:string){
 const now=new Date(),result=await db.collection<Delivery>("webhook_deliveries").updateOne({deliveryId,status:"dead_letter"},{$set:{status:"pending",attempts:0,availableAt:now,updatedAt:now},$unset:{lastError:"",leaseOwner:"",leaseUntil:""}});
 return result.modifiedCount===1;
}
function waitForPoll(milliseconds:number,signal:AbortSignal):Promise<void>{
 return new Promise(resolve=>{
  if(signal.aborted){resolve();return;}
  const finish=()=>{clearTimeout(timer);signal.removeEventListener("abort",finish);resolve();};
  const timer=setTimeout(finish,milliseconds);
  signal.addEventListener("abort",finish,{once:true});
 });
}
export async function runWebhookDeliveryWorker(db:Db,dependencies:{resolveSecret:WebhookSecretResolver;fetch?:WebhookFetch},signal:AbortSignal,options?:{workerId?:string;batchSize?:number;pollIntervalMs?:number;onError?:(error:unknown)=>void}){
 const poll=Math.max(250,options?.pollIntervalMs??2000);let failures=0;
 while(!signal.aborted){
  try{
   const result=await dispatchWebhookBatch(db,dependencies,{workerId:options?.workerId,batchSize:options?.batchSize});
   failures=0;
   if(result.claimed===0)await waitForPoll(poll,signal);
  }catch(error){
   failures++;try{options?.onError?.(error);}catch{/* telemetry must not stop the worker */}
   await waitForPoll(Math.min(60000,poll*2**Math.min(failures,5)),signal);
  }
 }
}
