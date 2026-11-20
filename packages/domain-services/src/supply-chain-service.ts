import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {ShipmentSchema,ShipmentStatusUpdateSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createShipment(db:Db,input:unknown,actorId:string,key:string){
 const shipment=ShipmentSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:shipment.tenantId,actorId,operation:"supply_chain.shipment.create",key,request:shipment},async session=>{
  const locations=await db.collection<any>("locations").find({tenantId:shipment.tenantId,organizationId:shipment.organizationId,locationId:{$in:[shipment.originLocationId,shipment.destinationLocationId]},status:"active"},{session}).toArray();
  if(locations.length!==2)throw new Error("SHIPMENT_LOCATION_SCOPE_INVALID");
  let referenceExists=false;
  if(shipment.referenceType==="purchase_order"){
   referenceExists=Boolean(await db.collection("erp_purchase_orders").findOne({tenantId:shipment.tenantId,organizationId:shipment.organizationId,orderNumber:shipment.referenceId},{session,projection:{_id:1}}));
  }else if(shipment.referenceType==="commerce_order"){
   referenceExists=Boolean(await db.collection("commerce_orders").findOne({tenantId:shipment.tenantId,organizationId:shipment.organizationId,orderId:shipment.referenceId},{session,projection:{_id:1}}));
  }else{
   referenceExists=Boolean(await db.collection("inventory_stock_ledger").findOne({tenantId:shipment.tenantId,movementId:shipment.referenceId,movementType:"transfer"},{session,projection:{_id:1}}));
  }
  if(!referenceExists)throw new Error("SHIPMENT_REFERENCE_NOT_FOUND");
  const now=new Date();
  await db.collection("supply_chain_shipments").insertOne({...shipment,_id:shipment.tenantId+":"+shipment.shipmentId,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,shipment.tenantId,actorId,"supply_chain.shipment.created","shipment",shipment.shipmentId,{organizationId:shipment.organizationId,referenceType:shipment.referenceType,referenceId:shipment.referenceId,carrierId:shipment.carrierId,trackingNumber:shipment.trackingNumber});
  await appendOutboxEvent(db,session,{tenantId:shipment.tenantId,eventType:"supply_chain.shipment.created",aggregateType:"shipment",aggregateId:shipment.shipmentId,payload:{shipmentId:shipment.shipmentId,organizationId:shipment.organizationId,referenceType:shipment.referenceType,referenceId:shipment.referenceId,carrierId:shipment.carrierId,trackingNumber:shipment.trackingNumber}});
  return {statusCode:201,body:{shipmentId:shipment.shipmentId,status:"planned",version:0}};
 });
}

const transitions:Record<string,string[]>={planned:["dispatched","cancelled"],dispatched:["in_transit","delayed","delivered","cancelled"],in_transit:["delayed","delivered","cancelled"],delayed:["in_transit","delivered","cancelled"]};
export async function updateShipmentStatus(db:Db,input:unknown,actorId:string,key:string){
 const update=ShipmentStatusUpdateSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:update.tenantId,actorId,operation:"supply_chain.shipment.status.update",key,request:update},async session=>{
  const shipment=await db.collection<any>("supply_chain_shipments").findOne({tenantId:update.tenantId,organizationId:update.organizationId,shipmentId:update.shipmentId},{session});
  if(!shipment)throw new Error("SHIPMENT_NOT_FOUND");
  if(shipment.version!==update.expectedVersion)throw new Error("SHIPMENT_VERSION_CONFLICT");
  if(!transitions[shipment.status]?.includes(update.status))throw new Error("SHIPMENT_STATUS_TRANSITION_INVALID");
  const now=new Date();
  const result=await db.collection("supply_chain_shipments").updateOne(
   {tenantId:update.tenantId,organizationId:update.organizationId,shipmentId:update.shipmentId,status:shipment.status,version:update.expectedVersion},
   {$set:{status:update.status,lastStatusReason:update.reason,lastStatusAt:new Date(update.occurredAt),updatedAt:now,...(update.proofOfDeliveryRef?{proofOfDeliveryRef:update.proofOfDeliveryRef}:{})},$inc:{version:1}},{session}
  );
  if(result.matchedCount!==1)throw new Error("SHIPMENT_VERSION_CONFLICT");
  await auditDomainMutation(db,session,update.tenantId,actorId,"supply_chain.shipment.status_changed","shipment",update.shipmentId,{organizationId:update.organizationId,fromStatus:shipment.status,toStatus:update.status,reason:update.reason,proofOfDeliveryRef:update.proofOfDeliveryRef??null,version:update.expectedVersion+1});
  await appendOutboxEvent(db,session,{tenantId:update.tenantId,eventType:"supply_chain.shipment."+update.status,aggregateType:"shipment",aggregateId:update.shipmentId,payload:{shipmentId:update.shipmentId,organizationId:update.organizationId,status:update.status,occurredAt:update.occurredAt,version:update.expectedVersion+1}});
  return {statusCode:200,body:{shipmentId:update.shipmentId,status:update.status,version:update.expectedVersion+1}};
 });
}
