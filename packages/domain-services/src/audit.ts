import type {ClientSession,Db} from "mongodb";
import {appendAuditEvent} from "@zuri/core-platform";

export async function auditDomainMutation(
 db:Db,session:ClientSession,tenantId:string,actorId:string,action:string,resourceType:string,resourceId:string,metadata:Record<string,unknown>={}
){
 await appendAuditEvent(db,{tenantId,actor:{userId:actorId},action,resourceType,resourceId,outcome:"success",metadata},session);
}
