import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createShipment,updateShipmentStatus} from "./supply-chain-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Shipment lifecycle enforces organization locations, ordered status transitions and proof of delivery",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_supply_chain_it_"+Date.now());const tenantId="tenant-supply-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true})
  ]);
  await db.collection("locations").insertMany([
   {tenantId,organizationId:"org-a",locationId:"origin",status:"active"},
   {tenantId,organizationId:"org-a",locationId:"destination",status:"active"},
   {tenantId,organizationId:"org-b",locationId:"foreign",status:"active"}
  ]);
  const shipment={tenantId,organizationId:"org-a",shipmentId:"shipment-001",referenceType:"purchase_order" as const,referenceId:"PO-001",carrierId:"carrier-001",trackingNumber:"TRACK-001",originLocationId:"origin",destinationLocationId:"destination",expectedDeliveryAt:"2026-11-25T12:00:00.000Z",status:"planned" as const,version:0};
  const created=await createShipment(db,shipment,"logistics-user","shipment-create-001");
  assert.deepEqual(created.body,{shipmentId:"shipment-001",status:"planned",version:0});
  const replay=await createShipment(db,shipment,"logistics-user","shipment-create-001");assert.deepEqual(replay.body,created.body);
  await assert.rejects(()=>createShipment(db,{...shipment,shipmentId:"shipment-cross-org",destinationLocationId:"foreign"},"logistics-user","shipment-create-002"),/SHIPMENT_LOCATION_SCOPE_INVALID/);
  const dispatched=await updateShipmentStatus(db,{tenantId,organizationId:"org-a",shipmentId:"shipment-001",status:"dispatched",reason:"Carrier collected the sealed consignment",occurredAt:"2026-11-20T10:00:00.000Z",expectedVersion:0},"logistics-user","shipment-dispatch-001");
  assert.equal((dispatched.body as any).version,1);
  const transit=await updateShipmentStatus(db,{tenantId,organizationId:"org-a",shipmentId:"shipment-001",status:"in_transit",reason:"Carrier confirmed departure from origin",occurredAt:"2026-11-20T11:00:00.000Z",expectedVersion:1},"logistics-user","shipment-transit-001");
  assert.equal((transit.body as any).status,"in_transit");
  await assert.rejects(()=>updateShipmentStatus(db,{tenantId,organizationId:"org-a",shipmentId:"shipment-001",status:"delivered",reason:"Delivered without evidence",occurredAt:"2026-11-21T12:00:00.000Z",expectedVersion:2},"logistics-user","shipment-deliver-no-proof"),/proofOfDeliveryRef/);
  const delivered=await updateShipmentStatus(db,{tenantId,organizationId:"org-a",shipmentId:"shipment-001",status:"delivered",reason:"Consignee accepted and signed for delivery",occurredAt:"2026-11-21T12:00:00.000Z",expectedVersion:2,proofOfDeliveryRef:"pod://signed-document-001"},"logistics-user","shipment-deliver-001");
  assert.equal((delivered.body as any).status,"delivered");
  await assert.rejects(()=>updateShipmentStatus(db,{tenantId,organizationId:"org-a",shipmentId:"shipment-001",status:"delayed",reason:"Attempt to reopen completed delivery",occurredAt:"2026-11-22T12:00:00.000Z",expectedVersion:3},"logistics-user","shipment-invalid-transition"),/SHIPMENT_STATUS_TRANSITION_INVALID/);
  const stored=await db.collection<any>("supply_chain_shipments").findOne({tenantId,shipmentId:"shipment-001"});
  assert.equal(stored.status,"delivered");assert.equal(stored.proofOfDeliveryRef,"pod://signed-document-001");assert.equal(stored.version,3);
  assert.equal(await db.collection("audit_events").countDocuments({tenantId}),3);
  assert.equal(await db.collection("outbox_events").countDocuments({tenantId}),3);
 }finally{await db.dropDatabase();await client.close();}
});
