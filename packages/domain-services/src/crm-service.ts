import type {ClientSession,Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {
 CrmAccountSchema,CrmContactSchema,CrmLeadSchema,CrmOpportunitySchema,CrmActivitySchema,CrmOpportunityStageUpdateSchema
} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

type CreateOptions={
 tenantId:string;actorId:string;operation:string;key:string;collection:string;
 action:string;resourceType:string;resourceId:string;eventType:string;aggregateType:string;
 document:Record<string,unknown>;payload:Record<string,unknown>;responseIdField:string
};
async function createRecord(db:Db,options:CreateOptions){
 return runIdempotentMutation(db,{tenantId:options.tenantId,actorId:options.actorId,operation:options.operation,key:options.key,request:options.document},async session=>{
  const now=new Date();
  await db.collection(options.collection).insertOne({...options.document,createdAt:now,updatedAt:now,createdBy:options.actorId},{session});
  await auditDomainMutation(db,session,options.tenantId,options.actorId,options.action,options.resourceType,options.resourceId,options.payload);
  await appendOutboxEvent(db,session,{tenantId:options.tenantId,eventType:options.eventType,aggregateType:options.aggregateType,aggregateId:options.resourceId,payload:options.payload});
  return {statusCode:201,body:{[options.responseIdField]:options.resourceId}};
 });
}
async function assertRelatedResource(db:Db,session:ClientSession,collection:string,tenantId:string,organizationId:string,idField:string,id:string){
 const found=await db.collection(collection).findOne({tenantId,organizationId,[idField]:id},{session,projection:{_id:1}});
 if(!found)throw new Error("CRM_RELATED_RESOURCE_NOT_FOUND");
}
export async function createCrmAccount(db:Db,input:unknown,actorId:string,key:string){
 const account=CrmAccountSchema.parse(input);
 return createRecord(db,{tenantId:account.tenantId,actorId,operation:"crm.account.create",key,collection:"crm_accounts",
  action:"crm.account.created",resourceType:"crm_account",resourceId:account.accountId,eventType:"crm.account.created",aggregateType:"crm_account",
  document:{...account},payload:{organizationId:account.organizationId,accountType:account.accountType},responseIdField:"accountId"});
}
export async function createCrmContact(db:Db,input:unknown,actorId:string,key:string){
 const contact=CrmContactSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:contact.tenantId,actorId,operation:"crm.contact.create",key,request:contact},async session=>{
  if(contact.accountId)await assertRelatedResource(db,session,"crm_accounts",contact.tenantId,contact.organizationId,"accountId",contact.accountId);
  const now=new Date();
  await db.collection("crm_contacts").insertOne({...contact,...(contact.consentCapturedAt?{consentCapturedAt:new Date(contact.consentCapturedAt)}:{}),createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,contact.tenantId,actorId,"crm.contact.created","crm_contact",contact.contactId,{organizationId:contact.organizationId,accountId:contact.accountId??null,marketingConsent:contact.marketingConsent});
  await appendOutboxEvent(db,session,{tenantId:contact.tenantId,eventType:"crm.contact.created",aggregateType:"crm_contact",aggregateId:contact.contactId,payload:{contactId:contact.contactId,organizationId:contact.organizationId,accountId:contact.accountId??null}});
  return {statusCode:201,body:{contactId:contact.contactId}};
 });
}
export async function createCrmLead(db:Db,input:unknown,actorId:string,key:string){
 const lead=CrmLeadSchema.parse(input);
 return createRecord(db,{tenantId:lead.tenantId,actorId,operation:"crm.lead.create",key,collection:"crm_leads",
  action:"crm.lead.created",resourceType:"crm_lead",resourceId:lead.leadId,eventType:"crm.lead.created",aggregateType:"crm_lead",
  document:{...lead,...(lead.consentCapturedAt?{consentCapturedAt:new Date(lead.consentCapturedAt)}:{})},
  payload:{organizationId:lead.organizationId,source:lead.source,status:lead.status,marketingConsent:lead.marketingConsent},responseIdField:"leadId"});
}
export async function createCrmOpportunity(db:Db,input:unknown,actorId:string,key:string){
 const opportunity=CrmOpportunitySchema.parse(input);
 return runIdempotentMutation(db,{tenantId:opportunity.tenantId,actorId,operation:"crm.opportunity.create",key,request:opportunity},async session=>{
  if(opportunity.accountId)await assertRelatedResource(db,session,"crm_accounts",opportunity.tenantId,opportunity.organizationId,"accountId",opportunity.accountId);
  if(opportunity.contactId)await assertRelatedResource(db,session,"crm_contacts",opportunity.tenantId,opportunity.organizationId,"contactId",opportunity.contactId);
  const now=new Date();
  await db.collection("crm_opportunities").insertOne({...opportunity,expectedCloseAt:new Date(opportunity.expectedCloseAt),createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,opportunity.tenantId,actorId,"crm.opportunity.created","crm_opportunity",opportunity.opportunityId,{organizationId:opportunity.organizationId,stage:opportunity.stage,amountMinor:opportunity.amountMinor,currency:opportunity.currency});
  await appendOutboxEvent(db,session,{tenantId:opportunity.tenantId,eventType:"crm.opportunity.created",aggregateType:"crm_opportunity",aggregateId:opportunity.opportunityId,payload:{opportunityId:opportunity.opportunityId,organizationId:opportunity.organizationId,stage:opportunity.stage,amountMinor:opportunity.amountMinor,currency:opportunity.currency}});
  return {statusCode:201,body:{opportunityId:opportunity.opportunityId,version:opportunity.version}};
 });
}
export async function recordCrmActivity(db:Db,input:unknown,actorId:string,key:string){
 const activity=CrmActivitySchema.parse(input);
 const relatedCollection={account:"crm_accounts",contact:"crm_contacts",lead:"crm_leads",opportunity:"crm_opportunities"}[activity.relatedType];
 return runIdempotentMutation(db,{tenantId:activity.tenantId,actorId,operation:"crm.activity.create",key,request:activity},async session=>{
  await assertRelatedResource(db,session,relatedCollection,activity.tenantId,activity.organizationId,
   activity.relatedType==="account"?"accountId":activity.relatedType==="contact"?"contactId":activity.relatedType==="lead"?"leadId":"opportunityId",activity.relatedId);
  const now=new Date();
  await db.collection("crm_activities").insertOne({...activity,occurredAt:new Date(activity.occurredAt),createdAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,activity.tenantId,actorId,"crm.activity.recorded","crm_activity",activity.activityId,{organizationId:activity.organizationId,relatedType:activity.relatedType,relatedId:activity.relatedId,activityType:activity.activityType});
  await appendOutboxEvent(db,session,{tenantId:activity.tenantId,eventType:"crm.activity.recorded",aggregateType:"crm_activity",aggregateId:activity.activityId,payload:{activityId:activity.activityId,organizationId:activity.organizationId,relatedType:activity.relatedType,relatedId:activity.relatedId}});
  return {statusCode:201,body:{activityId:activity.activityId}};
 });
}
export async function updateCrmOpportunityStage(db:Db,input:unknown,actorId:string,key:string){
 const update=CrmOpportunityStageUpdateSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:update.tenantId,actorId,operation:"crm.opportunity.stage.update",key,request:update},async session=>{
  const current=await db.collection<any>("crm_opportunities").findOne({tenantId:update.tenantId,organizationId:update.organizationId,opportunityId:update.opportunityId},{session});
  if(!current)throw new Error("CRM_OPPORTUNITY_NOT_FOUND");
  if(current.version!==update.expectedVersion)throw new Error("CRM_OPPORTUNITY_VERSION_CONFLICT");
  if(current.stage===update.stage)throw new Error("CRM_OPPORTUNITY_STAGE_UNCHANGED");
  const now=new Date();
  const result=await db.collection("crm_opportunities").updateOne(
   {tenantId:update.tenantId,organizationId:update.organizationId,opportunityId:update.opportunityId,version:update.expectedVersion},
   {$set:{stage:update.stage,version:update.expectedVersion+1,updatedAt:now,updatedBy:actorId}},{session}
  );
  if(result.matchedCount!==1)throw new Error("CRM_OPPORTUNITY_VERSION_CONFLICT");
  await auditDomainMutation(db,session,update.tenantId,actorId,"crm.opportunity.stage_changed","crm_opportunity",update.opportunityId,{organizationId:update.organizationId,fromStage:current.stage,toStage:update.stage,version:update.expectedVersion+1});
  await appendOutboxEvent(db,session,{tenantId:update.tenantId,eventType:"crm.opportunity.stage_changed",aggregateType:"crm_opportunity",aggregateId:update.opportunityId,payload:{opportunityId:update.opportunityId,organizationId:update.organizationId,fromStage:current.stage,toStage:update.stage,version:update.expectedVersion+1}});
  return {statusCode:200,body:{opportunityId:update.opportunityId,stage:update.stage,version:update.expectedVersion+1}};
 });
}
