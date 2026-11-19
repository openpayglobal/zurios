import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {runAbacBackfill} from "./abac-backfill-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("ABAC backfill is dry-run by default, conflict-safe and idempotent",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_abac_backfill_"+randomUUID().replaceAll("-",""));
 try{
  await db.collection("policies").createIndex({tenantId:1,key:1},{unique:true});
  await db.collection("memberships").insertMany([
   {tenantId:"tenant-a",membershipId:"membership-active",userId:"user-active",roleIds:["role-a"],status:"active"},
   {tenantId:"tenant-a",membershipId:"membership-invited",userId:"user-invited",roleIds:["role-a"],status:"invited"},
   {tenantId:"tenant-b",membershipId:"membership-suspended",userId:"user-suspended",roleIds:["role-b"],status:"suspended"},
   {tenantId:"tenant-b",membershipId:"membership-no-role",userId:"user-no-role",roleIds:[],status:"active"}
  ]);
  await db.collection("roles").insertMany([
   {tenantId:"tenant-a",roleId:"role-a",status:"active",permissionKeys:["inventory.stock.read","inventory.stock.write"]},
   {tenantId:"tenant-b",roleId:"role-b",status:"active",permissionKeys:["erp.invoice.read"]}
  ]);
  await db.collection("platform_operator_grants").insertOne({grantId:"grant-a",userId:"platform-user",status:"active",permissionKeys:["platform.admin.overview.read"]});

  const dry=await runAbacBackfill(db,false,"test");
  assert.equal(dry.mode,"dry-run");
  assert.equal(dry.membershipsScanned,4);
  assert.equal(dry.platformGrantsScanned,1);
  assert.equal(dry.wouldCreate,4);
  assert.equal(dry.skipped,1);
  assert.equal(await db.collection("policies").countDocuments({}),0);

  const applied=await runAbacBackfill(db,true,"test");
  assert.equal(applied.created,4);
  assert.equal(applied.unchanged,0);
  assert.equal(await db.collection("policies").countDocuments({}),4);

  const repeated=await runAbacBackfill(db,true,"test");
  assert.equal(repeated.created,0);
  assert.equal(repeated.unchanged,4);

  await db.collection("memberships").insertOne({tenantId:"tenant-c",membershipId:"membership-conflict",userId:"user-conflict",roleIds:["role-c"],status:"active"});
  await db.collection("roles").insertOne({tenantId:"tenant-c",roleId:"role-c",status:"active",permissionKeys:["pos.sale.complete"]});
  await db.collection("policies").insertOne({tenantId:"tenant-c",policyId:"policy-conflict",key:"membership-role:membership-conflict",effect:"deny",priority:0,subject:{userId:"user-conflict"},resource:{},actions:["pos.sale.complete"],conditions:{},status:"active"});
  const conflict=await runAbacBackfill(db,false,"test");
  assert.equal(conflict.conflicts,1);
  await assert.rejects(()=>runAbacBackfill(db,true,"test"),/ABAC_BACKFILL_CONFLICTS_FOUND/);
  assert.equal(await db.collection("policies").countDocuments({}),5);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
