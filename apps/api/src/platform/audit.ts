import {randomUUID} from "node:crypto";
import {collection} from "../db/mongo.js";
import {signAuditEventDocument} from "@zuri/core-platform";
import type {AuditEventIntegrity} from "@zuri/core-platform";
import type {AuditActor} from "./types.js";
type AuditEvent={eventId:string;tenantId:string;actor:AuditActor;action:string;resourceType:string;resourceId?:string;outcome:"success"|"denied"|"failure";metadata:Record<string,unknown>;occurredAt:Date;integrity?:AuditEventIntegrity};
export async function writeAuditEvent(input:Omit<AuditEvent,"eventId"|"occurredAt"|"integrity">):Promise<void>{
 const event:AuditEvent={...input,eventId:randomUUID(),occurredAt:new Date()};
 const integrity=await signAuditEventDocument(event as unknown as import("@zuri/core-platform").AuditEventDocument);
 if(integrity)event.integrity=integrity;
 await collection<AuditEvent>("audit_events").insertOne(event);
}
