import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {ingestCarrierTrackingEvent} from "./carrier-integration-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("carrier tracking events require verified signatures, exact shipment ownership and monotonic versions",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_carrier_it_"+Date.now());const tenantId="tenant-carrier-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true})
  ]);
  await db.collection("supply_chain_shipments").insertOne({
   _id:tenantId+":shipment-1",tenantId,organizationId:"org-a",shipmentId:"shipment-1",
   carrierId:"carrier-a",trackingNumber:"TRACK-1",status:"dispatched",version:1
  });
  const event={
   tenantId,organizationId:"org-a",shipmentId:"shipment-1",carrierId:"carrier-a",
   trackingNumber:"TRACK-1",providerEventId:"provider-event-1",status:"in_transit",
   reason:"Carrier scan confirms departure from origin",occurredAt:"2026-11-20T10:00:00.000Z",
   expectedShipmentVersion:1
  };
  await assert.rejects(()=>ingestCarrierTrackingEvent(db,event,"invalid",async()=>false),/CARRIER_SIGNATURE_INVALID/);
  assert.equal(await db.collection("supply_chain_carrier_events").countDocuments({tenantId}),0);
  await assert.rejects(()=>ingestCarrierTrackingEvent(db,{...event,carrierId:"carrier-b"},"valid",async()=>true),/CARRIER_SHIPMENT_NOT_FOUND/);
  const result=await ingestCarrierTrackingEvent(db,event,"valid",async input=>input.signature==="valid");
  assert.deepEqual(result.body,{shipmentId:"shipment-1",providerEventId:"provider-event-1",status:"in_transit",version:2});
  const replay=await ingestCarrierTrackingEvent(db,event,"valid",async()=>true);
  assert.equal(replay.replayed,true);
  await assert.rejects(()=>ingestCarrierTrackingEvent(db,{...event,providerEventId:"provider-event-2",expectedShipmentVersion:1,status:"delayed"},"valid",async()=>true),/SHIPMENT_VERSION_CONFLICT/);
  const shipment=await db.collection<any>("supply_chain_shipments").findOne({tenantId,shipmentId:"shipment-1"});
  assert.equal(shipment.status,"in_transit");assert.equal(shipment.version,2);
  assert.equal(await db.collection("supply_chain_carrier_events").countDocuments({tenantId}),1);
  assert.equal(await db.collection("audit_events").countDocuments({tenantId}),1);
  assert.equal(await db.collection("outbox_events").countDocuments({tenantId}),1);
 }finally{await db.dropDatabase();await client.close();}
});
