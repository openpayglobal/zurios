import type {Db} from "mongodb";

/** Domain-specific indexes required by the shipment and carrier event stores. */
export async function ensureDomainServiceIndexes(db:Db):Promise<void>{
 await Promise.all([
  db.collection("supply_chain_shipments").createIndex(
   {tenantId:1,shipmentId:1},{unique:true,name:"uq_shipment_tenant_id"}
  ),
  db.collection("supply_chain_shipments").createIndex(
   {tenantId:1,organizationId:1,status:1,expectedDeliveryAt:1},{name:"ix_shipment_org_status_eta"}
  ),
  db.collection("supply_chain_shipments").createIndex(
   {tenantId:1,organizationId:1,carrierId:1,trackingNumber:1},{name:"ix_shipment_carrier_tracking"}
  ),
  db.collection("supply_chain_carrier_events").createIndex(
   {tenantId:1,carrierId:1,providerEventId:1},{unique:true,name:"uq_carrier_provider_event"}
  ),
  db.collection("supply_chain_carrier_events").createIndex(
   {tenantId:1,shipmentId:1,occurredAt:-1},{name:"ix_carrier_event_shipment_time"}
  )
 ]);
}
