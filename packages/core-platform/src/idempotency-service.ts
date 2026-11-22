import {createHash,randomUUID} from "node:crypto";
import type {ClientSession,Db} from "mongodb";
import {z} from "zod";

type StoredResult={statusCode:number;body:unknown};
type IdempotencyDocument={
 tenantId:string;actorId:string;operation:string;key:string;requestHash:string;
 status:"processing"|"completed";result?:StoredResult;createdAt:Date;updatedAt:Date;expiresAt:Date;
};
type IdempotencyInput={tenantId:string;actorId:string;operation:string;key:string;request?:unknown};
const inputSchema=z.object({
 tenantId:z.string().min(1),actorId:z.string().min(1),operation:z.string().min(3).max(180),
 key:z.string().min(8).max(128),request: z.unknown()
});
function canonical(value:unknown):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value)??"null";
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 const entries=Object.entries(value as Record<string,unknown>).sort(([a],[b])=>(a<b?-1:a>b?1:0));
 return `{${entries.map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
function hash(value:unknown){return createHash("sha256").update(canonical(value)).digest("hex");}
function keyFilter(d:{tenantId:string;actorId:string;operation:string;key:string}){
 return {tenantId:d.tenantId,actorId:d.actorId,operation:d.operation,key:d.key};
}
export class IdempotencyConflictError extends Error{
 constructor(code:"IDEMPOTENCY_KEY_REUSED"|"IDEMPOTENCY_IN_PROGRESS"){super(code);this.name="IdempotencyConflictError";}
}
export async function runIdempotentMutation(
 db:Db,input:unknown,work:(session:ClientSession)=>Promise<StoredResult>
):Promise<StoredResult&{replayed:boolean}>{
 const parsed=inputSchema.parse(input);
 const normalized:IdempotencyInput={tenantId:parsed.tenantId!,actorId:parsed.actorId!,operation:parsed.operation!,key:parsed.key!,...(parsed.request!==undefined?{request:parsed.request}:{})};
 const requestHash=hash(parsed.request),filter=keyFilter(normalized),collection=db.collection<IdempotencyDocument>("idempotency_records");
 const session=db.client.startSession();
 try{
  let output:(StoredResult&{replayed:boolean})|undefined;
  await session.withTransaction(async()=>{
   const existing=await collection.findOne(filter,{session});
   if(existing&&existing.expiresAt<=new Date()){await collection.deleteOne(filter,{session});}
   else if(existing){
    if(existing.requestHash!==requestHash)throw new IdempotencyConflictError("IDEMPOTENCY_KEY_REUSED");
    if(existing.status==="completed"&&existing.result){output={...existing.result,replayed:true};return;}
    throw new IdempotencyConflictError("IDEMPOTENCY_IN_PROGRESS");
   }
   const now=new Date(),record:IdempotencyDocument={...filter,requestHash,status:"processing",createdAt:now,updatedAt:now,expiresAt:new Date(now.getTime()+24*60*60*1000)};
   await collection.insertOne(record,{session});
   const result=await work(session);
   if(!Number.isInteger(result.statusCode)||result.statusCode<100||result.statusCode>599)throw new Error("INVALID_IDEMPOTENCY_RESULT");
   await collection.updateOne({...filter,status:"processing"},{$set:{status:"completed",result,updatedAt:new Date()}},{session});
   output={...result,replayed:false};
  },{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary"});
  if(!output)throw new Error("IDEMPOTENCY_RESULT_MISSING");
  return output;
 }catch(error){
  if(error&&typeof error==="object"&&"code" in error&&(error as {code?:number}).code===11000){
   const existing=await collection.findOne(filter);
   if(existing&&existing.requestHash===requestHash&&existing.status==="completed"&&existing.result)return {...existing.result,replayed:true};
   if(existing&&existing.requestHash!==requestHash)throw new IdempotencyConflictError("IDEMPOTENCY_KEY_REUSED");
  }
  throw error;
 }finally{await session.endSession();}
}
export function newOutboxEventId(){return randomUUID();}
