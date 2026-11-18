import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {ensureCoreIndexes} from "./indexes.js";
import {scoped} from "./repositories.js";
import {rotateRefreshToken} from "./session-service.js";

const uri=process.env.MONGODB_TEST_URI;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

test("MongoDB replica-set integration: tenant boundaries, global identities and refresh replay", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);
 await client.connect();
 const db=client.db(`zuri_core_it_${randomUUID().replaceAll("-","")}`);
 try{
  await ensureCoreIndexes(db);
  const now=new Date(),tenantA="tenant-a",tenantB="tenant-b",userId="user-global";
  await db.collection("tenants").insertMany([
   {tenantId:tenantA,slug:"tenant-a",status:"active"},
   {tenantId:tenantB,slug:"tenant-b",status:"active"}
  ]);
  await db.collection("organizations").insertMany([
   {tenantId:tenantA,organizationId:"org-a",code:"HQ",status:"active"},
   {tenantId:tenantB,organizationId:"org-b",code:"HQ",status:"active"}
  ]);
  const visibleA=await db.collection("organizations").find(scoped(tenantA,{status:"active"})).toArray();
  assert.deepEqual(visibleA.map(v=>v.organizationId),["org-a"]);
  await db.collection("users").insertOne({userId,emailNormalized:"shared@example.test",status:"active"});
  await assert.rejects(()=>db.collection("users").insertOne({userId:"user-duplicate",emailNormalized:"shared@example.test",status:"active"}));
  await db.collection("memberships").insertMany([
   {tenantId:tenantA,membershipId:"mem-a",userId,organizationIds:["org-a"],locationIds:[],roleIds:[],status:"active"},
   {tenantId:tenantB,membershipId:"mem-b",userId,organizationIds:["org-b"],locationIds:[],roleIds:[],status:"active"}
  ]);
  await assert.rejects(()=>db.collection("memberships").insertOne({tenantId:tenantA,membershipId:"mem-a2",userId,organizationIds:[],locationIds:[],roleIds:[],status:"active"}));

  const token="initial-refresh-token";
  await db.collection("sessions").insertOne({
   tenantId:tenantA,sessionId:"session-race",userId,membershipId:"mem-a",tokenFamilyId:"family-a",
   refreshTokenHash:hash(token),refreshTokenHistory:[],expiresAt:new Date(Date.now()+60_000),
   lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId
  });
  await assert.rejects(()=>rotateRefreshToken(db,tenantA,"session-race","unrelated-invalid-token"),/SESSION_INVALID/);
  let session=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:"session-race"});
  assert.equal(session?.revokedAt,undefined,"an arbitrary invalid token must not revoke the session");

  const concurrent=await Promise.allSettled([
   rotateRefreshToken(db,tenantA,"session-race",token),
   rotateRefreshToken(db,tenantA,"session-race",token)
  ]);
  assert.equal(concurrent.filter(v=>v.status==="fulfilled").length,1,"exactly one refresh rotation may succeed");
  assert.equal(concurrent.filter(v=>v.status==="rejected").length,1,"the duplicate refresh must be rejected");
  session=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:"session-race"});
  assert.ok(session?.revokedAt,"reuse of a consumed token must revoke the token family");
 }finally{
  await db.dropDatabase();
  await client.close();
 }
});
