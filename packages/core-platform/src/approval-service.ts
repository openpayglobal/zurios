import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";

export type ApprovalAction="membership.suspend"|"membership.reactivate"|"membership.revoke"|"policy.apply"|"feature_flag.set"|"break_glass.grant"|"tenant.activate"|"tenant.suspend"|"tenant.close";
export type ApprovalRequestDocument={
 requestId:string;tenantId:string;scope:"tenant"|"platform";action:ApprovalAction;
 targetType:string;targetId:string;payload:Record<string,unknown>;reason:string;
 requestedBy:string;status:"pending"|"approved"|"rejected"|"executed"|"expired";
 approvedBy?:string;approvalReason?:string;rejectedBy?:string;rejectionReason?:string;
 correlationId?:string;expiresAt:Date;createdAt:Date;updatedAt:Date;executedAt?:Date;
};
const schema=z.object({
 tenantId:z.string().min(1),scope:z.enum(["tenant","platform"]),action:z.enum([
  "membership.suspend","membership.reactivate","membership.revoke","policy.apply","feature_flag.set","break_glass.grant","tenant.activate","tenant.suspend","tenant.close"
 ]),
 targetType:z.string().min(2).max(80),targetId:z.string().min(1).max(200),
 payload:z.record(z.unknown()).default({}),reason:z.string().min(20).max(2000),
 requestedBy:z.string().min(1),correlationId:z.string().max(200).optional(),
 ttlSeconds:z.number().int().min(300).max(7*24*60*60).default(24*60*60)
});
export async function createApprovalRequest(db:Db,session:ClientSession,input:unknown){
 const d=schema.parse(input),now=new Date(),doc:ApprovalRequestDocument={
  requestId:newId("apr"),tenantId:d.tenantId,scope:d.scope,action:d.action,targetType:d.targetType,targetId:d.targetId,
  payload:d.payload,reason:d.reason,requestedBy:d.requestedBy,status:"pending",
  ...(d.correlationId?{correlationId:d.correlationId}:{}),expiresAt:new Date(now.getTime()+d.ttlSeconds*1000),createdAt:now,updatedAt:now
 };
 await db.collection<ApprovalRequestDocument>("approval_requests").insertOne(doc,{session});
 return doc;
}
export async function approveApprovalRequest(db:Db,session:ClientSession,input:{
 tenantId:string;requestId:string;approverId:string;reason:string
}){
 const reason=z.string().min(10).max(1000).parse(input.reason),now=new Date(),collection=db.collection<ApprovalRequestDocument>("approval_requests");
 const request=await collection.findOne({tenantId:input.tenantId,requestId:input.requestId,status:"pending",expiresAt:{$gt:now}},{session});
 if(!request)throw new Error("APPROVAL_NOT_PENDING_OR_EXPIRED");
 if(request.requestedBy===input.approverId)throw new Error("APPROVAL_SELF_APPROVAL_PROHIBITED");
 const result=await collection.updateOne({tenantId:input.tenantId,requestId:input.requestId,status:"pending",expiresAt:{$gt:now}},{$set:{status:"approved",approvedBy:input.approverId,approvalReason:reason,updatedAt:now}},{session});
 if(!result.modifiedCount)throw new Error("APPROVAL_STATE_CONFLICT");
 return {...request,status:"approved" as const,approvedBy:input.approverId,approvalReason:reason,updatedAt:now};
}
export async function rejectApprovalRequest(db:Db,session:ClientSession,input:{
 tenantId:string;requestId:string;reviewerId:string;reason:string
}){
 const reason=z.string().min(10).max(1000).parse(input.reason),now=new Date(),collection=db.collection<ApprovalRequestDocument>("approval_requests");
 const request=await collection.findOne({tenantId:input.tenantId,requestId:input.requestId,status:"pending",expiresAt:{$gt:now}},{session});
 if(!request)throw new Error("APPROVAL_NOT_PENDING_OR_EXPIRED");
 const result=await collection.updateOne({tenantId:input.tenantId,requestId:input.requestId,status:"pending",expiresAt:{$gt:now}},{$set:{status:"rejected",rejectedBy:input.reviewerId,rejectionReason:reason,updatedAt:now}},{session});
 if(!result.modifiedCount)throw new Error("APPROVAL_STATE_CONFLICT");
 return {...request,status:"rejected" as const,rejectedBy:input.reviewerId,rejectionReason:reason,updatedAt:now};
}
export async function completeApprovalRequest(db:Db,session:ClientSession,tenantId:string,requestId:string,actorId:string){
 const now=new Date(),result=await db.collection<ApprovalRequestDocument>("approval_requests").updateOne(
  {tenantId,requestId,status:"approved",approvedBy:{$exists:true}},
  {$set:{status:"executed",executedAt:now,updatedAt:now},$currentDate:{updatedAt:true}}
 ,{session});
 if(!result.modifiedCount)throw new Error("APPROVAL_EXECUTION_STATE_CONFLICT");
 return db.collection<ApprovalRequestDocument>("approval_requests").findOne({tenantId,requestId},{session});
}
