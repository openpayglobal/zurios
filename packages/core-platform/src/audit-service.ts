import {randomUUID} from "node:crypto";
import type {Db} from "mongodb";
import {z} from "zod";
import {coreCollections} from "./repositories.js";
const eventSchema=z.object({tenantId:z.string().min(1),actor:z.object({userId:z.string().min(1).optional(),service:z.string().min(1).optional(),ipHash:z.string().max(128).optional(),userAgent:z.string().max(512).optional()}).refine(v=>Boolean(v.userId||v.service),{message:"Audit actor must be identified"}),action:z.string().min(2).max(160),resourceType:z.string().min(2).max(120),resourceId:z.string().max(200).optional(),outcome:z.enum(["success","denied","failure"]),correlationId:z.string().max(200).optional(),metadata:z.record(z.unknown()).default({})});
const sensitiveKey=/(password|secret|token|authorization|cookie|otp|recovery|credential|private.?key)/i;
function redact(value:unknown,depth=0):unknown{
 if(depth>8)return "[MAX_DEPTH]";
 if(Array.isArray(value))return value.slice(0,100).map(v=>redact(v,depth+1));
 if(value&&typeof value==="object"){
  const out:Record<string,unknown>={};
  for(const [key,child] of Object.entries(value as Record<string,unknown>).slice(0,100))out[key]=sensitiveKey.test(key)?"[REDACTED]":redact(child,depth+1);
  return out;
 }
 if(typeof value==="string")return value.slice(0,4000);
 return value;
}
export async function appendAuditEvent(db:Db,input:unknown){
 const event=eventSchema.parse(input),now=new Date();
 const {actor,resourceId,correlationId,metadata,...rest}=event;
 const safeActor={...(actor.userId!==undefined?{userId:actor.userId}:{}),...(actor.service!==undefined?{service:actor.service}:{}),...(actor.ipHash!==undefined?{ipHash:actor.ipHash}:{}),...(actor.userAgent!==undefined?{userAgent:actor.userAgent}:{})};
 const doc={eventId:randomUUID(),occurredAt:now,...rest,actor:safeActor,...(resourceId!==undefined?{resourceId}:{}),...(correlationId!==undefined?{correlationId}:{}),metadata:redact(metadata) as Record<string,unknown>};
 await coreCollections(db).auditEvents.insertOne(doc);
 return {eventId:doc.eventId,occurredAt:doc.occurredAt};
}
