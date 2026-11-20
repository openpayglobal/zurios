import {createHash} from "node:crypto";
import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {CarrierTrackingEventSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export type CarrierTrackingSignatureVerifier=(input:{tenantId:string;carrierId:string;trackingNumber:string;providerEventId:string;signature:string})=>Promise<boolean>;

const transitions:Record<string,string[]>={planned:["dispatched","cancelled"],dispatched:["in_transit","delayed","delivered","cancelled"],in_transit:["delayed","delivered","cancelled"],delayed:["in_transit","delivered","cancelled"]};

/**
 * Provider-neutral, signature-verified carrier event ingestion.
 * The provider adapter resolves tenant/carrier configuration and verifies
 * the provider's exact signing scheme before this service mutates shipment state.
 */
export async function ingestCarrierTrackingEvent(db:Db,input:unknown,signature:string,verifySignature:CarrierTrackingSignatureVerifier){
 const event=CarrierTrackingEventSchema.parse(input);
 if(!signature||signature.length>2048)throw new Error("CARRIER_SIGNATURE_INVALID");
 const verified=await verifySignature({tenantId:event.tenantId,carrierId:event.carrierId,trackingNumber:event.trackingNumber,providerEventId:event.providerEventId,signature});
 if(!verified)throw new Error("CARRIER_SIGNATURE_INVALID");
 const actorId="carrier:"+event.carrierId;
 const key="carrier-event-"+createHash("sha256").update(event.carrierId+":"+event.providerEventId).digest("hex");
 return runIdempotentMutation(db,{tenantId:event.tenantId,actorId,operation:"supply_chain.carrier_event.ingest",key,request:event},async session=>{
  const shipment=await db.collection<any>("supply_chain_shipments").findOne({
   tenantId:event.tenantId,organizationId:event.organizationId,shipmentId:event.shipmentId,
   carrierId:event.carrierId,trackingNumber:event.trackingNumber
  },{session});
  if(!shipment)throw new Error("CARRIER_SHIPMENT_NOT_FOUND");
  const occurredAt=new Date(event.occurredAt);
  if(shipment.lastStatusAt&&occurredAt<=new Date(shipment.lastStatusAt))throw new Error("CARRIER_EVENT_STALE");
  if(!transitions[shipment.status]?.includes(event.status))throw new Error("SHIPMENT_STATUS_TRANSITION_INVALID");
  const now=new Date();
  const update=await db.collection("supply_chain_shipments").updateOne(
   {tenantId:event.tenantId,organizationId:event.organizationId,shipmentId:event.shipmentId,carrierId:event.carrierId,trackingNumber:event.trackingNumber,status:shipment.status,version:shipment.version},
   {$set:{status:event.status,lastStatusReason:event.reason,lastStatusAt:new Date(event.occurredAt),updatedAt:now,...(event.proofOfDeliveryRef?{proofOfDeliveryRef:event.proofOfDeliveryRef}:{})},$inc:{version:1}},
   {session}
  );
  if(update.matchedCount!==1)throw new Error("SHIPMENT_VERSION_CONFLICT");
  const eventId=event.carrierId+":"+event.providerEventId;
  await db.collection<any>("supply_chain_carrier_events").insertOne({
   _id:event.tenantId+":"+eventId,tenantId:event.tenantId,organizationId:event.organizationId,
   carrierId:event.carrierId,providerEventId:event.providerEventId,shipmentId:event.shipmentId,
   trackingNumber:event.trackingNumber,status:event.status,reason:event.reason,
   occurredAt:new Date(event.occurredAt),receivedAt:now,shipmentVersion:shipment.version+1
  },{session});
  await auditDomainMutation(db,session,event.tenantId,actorId,"supply_chain.carrier_event.accepted","shipment",event.shipmentId,{
   organizationId:event.organizationId,carrierId:event.carrierId,providerEventId:event.providerEventId,
   status:event.status,shipmentVersion:shipment.version+1
  });
  await appendOutboxEvent(db,session,{tenantId:event.tenantId,eventType:"supply_chain.shipment."+event.status,aggregateType:"shipment",aggregateId:event.shipmentId,payload:{
   shipmentId:event.shipmentId,organizationId:event.organizationId,status:event.status,
   occurredAt:event.occurredAt,version:shipment.version+1,carrierId:event.carrierId,providerEventId:event.providerEventId
  }});
  return {statusCode:200,body:{shipmentId:event.shipmentId,providerEventId:event.providerEventId,status:event.status,version:shipment.version+1}};
 });
}
