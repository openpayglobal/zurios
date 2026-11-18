import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {createMembership} from "./membership-service.js";

const uri=process.env.MONGODB_TEST_URI;

test("membership locations must belong to one of the assigned organizations",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_membership_scope_${randomUUID().replaceAll("-","")}`);
 try{
  await db.collection("tenants").insertOne({tenantId:"tenant-a",status:"active"});
  await db.collection("users").insertOne({userId:"user-a",status:"active"});
  await db.collection("organizations").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",status:"active"},
   {tenantId:"tenant-a",organizationId:"org-b",status:"active"}
  ]);
  await db.collection("locations").insertMany([
   {tenantId:"tenant-a",locationId:"loc-a",organizationId:"org-a",status:"active"},
   {tenantId:"tenant-a",locationId:"loc-b",organizationId:"org-b",status:"active"}
  ]);

  await assert.rejects(
   ()=>createMembership(db,"tenant-a","admin",{userId:"user-a",organizationIds:["org-a"],locationIds:["loc-b"]}),
   /INVALID_LOCATION_ORGANIZATION_SCOPE/
  );
  const valid=await createMembership(db,"tenant-a","admin",{userId:"user-a",organizationIds:["org-a"],locationIds:["loc-a"]});
  assert.deepEqual(valid.organizationIds,["org-a"]);
  assert.deepEqual(valid.locationIds,["loc-a"]);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
