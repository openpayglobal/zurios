import {randomUUID} from "node:crypto";
import {collection} from "../db/mongo.js";
import type {AuditActor} from "./types.js";
type AuditEvent={eventId:string;tenantId:string;actor:AuditActor;action:string;resourceType:string;resourceId?:string;outcome:"success"|"denied"|"failure";metadata:Record<string,unknown>;occurredAt:Date};
export async function writeAuditEvent(input:Omit<AuditEvent,"eventId"|"occurredAt">):Promise<void>{
 await collection<AuditEvent>("audit_events").insertOne({...input,eventId:randomUUID(),occurredAt:new Date()});
}
