import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createAsset,createMaintenanceWorkOrder,completeMaintenanceWorkOrder,calculateStraightLineMonthlyDepreciation} from "./asset-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Asset and maintenance services enforce ownership, versioning and depreciation arithmetic",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_assets_it_"+Date.now());
 const tenantId="tenant-assets-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("assets").createIndex({tenantId:1,assetId:1},{unique:true}),
   db.collection("maintenance_work_orders").createIndex({tenantId:1,workOrderId:1},{unique:true})
  ]);
  const asset=await createAsset(db,{
   tenantId,organizationId:"org-assets-a",assetId:"asset-001",assetTag:"ASSET-001",name:"Delivery vehicle",category:"vehicle",
   acquiredAt:"2026-01-01T00:00:00.000Z",acquisitionCostMinor:12000000,residualValueMinor:1200000,
   usefulLifeMonths:60,currency:"UGX",depreciationMethod:"straight_line",status:"active"
  },"asset-manager","asset-create-001");
  assert.equal((asset.body as {assetId:string}).assetId,"asset-001");
  const work=await createMaintenanceWorkOrder(db,{
   tenantId,organizationId:"org-assets-a",workOrderId:"work-001",assetId:"asset-001",workType:"preventive",
   priority:"normal",description:"Scheduled inspection and oil service",scheduledAt:"2026-11-20T08:00:00.000Z",
   estimatedCostMinor:150000,status:"open"
  },"asset-manager","asset-work-create-001");
  assert.equal((work.body as {status:string}).status,"open");
  const completion={tenantId,organizationId:"org-assets-a",workOrderId:"work-001",actualCostMinor:140000,completionNotes:"Inspection completed and service checklist signed",expectedVersion:0};
  const done=await completeMaintenanceWorkOrder(db,completion,"technician-user","asset-work-complete-001");
  assert.deepEqual(done.body,{workOrderId:"work-001",status:"completed",version:1});
  const replay=await completeMaintenanceWorkOrder(db,completion,"technician-user","asset-work-complete-001");
  assert.equal(replay.replayed,true);
  await assert.rejects(()=>completeMaintenanceWorkOrder(db,{...completion,actualCostMinor:160000},"technician-user","asset-work-complete-002"),/MAINTENANCE_WORK_ORDER_NOT_ACTIVE|MAINTENANCE_WORK_ORDER_VERSION_CONFLICT/);
  assert.equal(calculateStraightLineMonthlyDepreciation(12000000,1200000,60),180000);
  assert.throws(()=>calculateStraightLineMonthlyDepreciation(100,200,10),/INVALID_ASSET_DEPRECIATION_INPUT/);
  const persisted=await db.collection<any>("maintenance_work_orders").findOne({tenantId,workOrderId:"work-001"});
  assert.equal(persisted.status,"completed");
  assert.equal(persisted.actualCostMinor,140000);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=3);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=3);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
