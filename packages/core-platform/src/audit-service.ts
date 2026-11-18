import {randomUUID} from "node:crypto";
import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
export async function appendAuditEvent(db:Db,event:{tenantId:string;actor:{userId?:string;service?:string};action:string;resourceType:string;resourceId?:string;outcome:"success"|"denied"|"failure";correlationId?:string;metadata?:Record<string,unknown>}){
 await coreCollections(db).auditEvents.insertOne({eventId:randomUUID(),occurredAt:new Date(),...event,metadata:event.metadata??{}});
}
