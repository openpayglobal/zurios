import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {AssetSchema,MaintenanceWorkOrderSchema,MaintenanceCompletionSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createAsset(db:Db,input:unknown,actorId:string,key:string){
 const asset=AssetSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:asset.tenantId,actorId,operation:"assets.asset.create",key,request:asset},async session=>{
  const now=new Date();
  await db.collection("assets").insertOne({...asset,acquiredAt:new Date(asset.acquiredAt),createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,asset.tenantId,actorId,"assets.asset.created","asset",asset.assetId,{organizationId:asset.organizationId,assetTag:asset.assetTag,category:asset.category,acquisitionCostMinor:asset.acquisitionCostMinor,currency:asset.currency});
  await appendOutboxEvent(db,session,{tenantId:asset.tenantId,eventType:"assets.asset.created",aggregateType:"asset",aggregateId:asset.assetId,payload:{assetId:asset.assetId,organizationId:asset.organizationId,assetTag:asset.assetTag,category:asset.category}});
  return {statusCode:201,body:{assetId:asset.assetId}};
 });
}
export async function createMaintenanceWorkOrder(db:Db,input:unknown,actorId:string,key:string){
 const work=MaintenanceWorkOrderSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:work.tenantId,actorId,operation:"assets.work_order.create",key,request:work},async session=>{
  const asset=await db.collection("assets").findOne({tenantId:work.tenantId,organizationId:work.organizationId,assetId:work.assetId,status:"active"},{session,projection:{_id:1}});
  if(!asset)throw new Error("ACTIVE_ASSET_NOT_FOUND");
  const now=new Date();
  await db.collection("maintenance_work_orders").insertOne({...work,scheduledAt:new Date(work.scheduledAt),createdAt:now,updatedAt:now,createdBy:actorId,version:0},{session});
  await auditDomainMutation(db,session,work.tenantId,actorId,"assets.work_order.created","maintenance_work_order",work.workOrderId,{organizationId:work.organizationId,assetId:work.assetId,workType:work.workType,priority:work.priority});
  await appendOutboxEvent(db,session,{tenantId:work.tenantId,eventType:"assets.work_order.created",aggregateType:"maintenance_work_order",aggregateId:work.workOrderId,payload:{workOrderId:work.workOrderId,organizationId:work.organizationId,assetId:work.assetId,priority:work.priority}});
  return {statusCode:201,body:{workOrderId:work.workOrderId,status:"open",version:0}};
 });
}
export async function completeMaintenanceWorkOrder(db:Db,input:unknown,actorId:string,key:string){
 const completion=MaintenanceCompletionSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:completion.tenantId,actorId,operation:"assets.work_order.complete",key,request:completion},async session=>{
  const work=await db.collection<any>("maintenance_work_orders").findOne({tenantId:completion.tenantId,organizationId:completion.organizationId,workOrderId:completion.workOrderId},{session});
  if(!work)throw new Error("MAINTENANCE_WORK_ORDER_NOT_FOUND");
  if(work.status!=="open"&&work.status!=="in_progress")throw new Error("MAINTENANCE_WORK_ORDER_NOT_ACTIVE");
  if(work.version!==completion.expectedVersion)throw new Error("MAINTENANCE_WORK_ORDER_VERSION_CONFLICT");
  const now=new Date();
  const result=await db.collection("maintenance_work_orders").updateOne(
   {tenantId:completion.tenantId,organizationId:completion.organizationId,workOrderId:completion.workOrderId,version:completion.expectedVersion,status:{$in:["open","in_progress"]}},
   {$set:{status:"completed",actualCostMinor:completion.actualCostMinor,completionNotes:completion.completionNotes,completedAt:now,completedByUserId:actorId,updatedAt:now,version:completion.expectedVersion+1}},{session}
  );
  if(result.matchedCount!==1)throw new Error("MAINTENANCE_WORK_ORDER_VERSION_CONFLICT");
  await auditDomainMutation(db,session,completion.tenantId,actorId,"assets.work_order.completed","maintenance_work_order",completion.workOrderId,{organizationId:completion.organizationId,actualCostMinor:completion.actualCostMinor,version:completion.expectedVersion+1});
  await appendOutboxEvent(db,session,{tenantId:completion.tenantId,eventType:"assets.work_order.completed",aggregateType:"maintenance_work_order",aggregateId:completion.workOrderId,payload:{workOrderId:completion.workOrderId,organizationId:completion.organizationId,actualCostMinor:completion.actualCostMinor,version:completion.expectedVersion+1}});
  return {statusCode:200,body:{workOrderId:completion.workOrderId,status:"completed",version:completion.expectedVersion+1}};
 });
}
export function calculateStraightLineMonthlyDepreciation(acquisitionCostMinor:number,residualValueMinor:number,usefulLifeMonths:number):number{
 if(!Number.isSafeInteger(acquisitionCostMinor)||!Number.isSafeInteger(residualValueMinor)||!Number.isSafeInteger(usefulLifeMonths)||usefulLifeMonths<=0||residualValueMinor<0||residualValueMinor>acquisitionCostMinor)throw new Error("INVALID_ASSET_DEPRECIATION_INPUT");
 return Math.floor((acquisitionCostMinor-residualValueMinor)/usefulLifeMonths);
}
