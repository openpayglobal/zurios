import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {ensureCoreIndexes} from "./indexes.js";
import {scoped} from "./repositories.js";
import {rotateRefreshToken} from "./session-service.js";
import {revokeMembership} from "./membership-service.js";
import {setTenantStatus} from "./tenant-service.js";
const uri=process.env.MONGODB_TEST_URI;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
test("MongoDB replica-set integration: tenant isolation, uniqueness and lifecycle revocation", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_core_it_${randomUUID().replaceAll("-","")}`);
 try{
  await ensureCoreIndexes(db);
  const now=new Date(),tenantA="tenant-a",tenantB="tenant-b",userId="user-global";
  await db.collection("tenants").insertMany([{tenantId:tenantA,slug:"tenant-a",status:"active"},{tenantId:tenantB,slug:"tenant-b",status:"active"}]);
  await db.collection("organizations").insertMany([{tenantId:tenantA,organizationId:"org-a",code:"HQ",status:"active",marker:"scope-check"},{tenantId:tenantB,organizationId:"org-b",code:"HQ",status:"active",marker:"scope-check"}]);
  await db.collection("locations").insertMany([{tenantId:tenantA,locationId:"loc-a",organizationId:"org-a",code:"STORE-1",status:"active",marker:"scope-check"},{tenantId:tenantB,locationId:"loc-b",organizationId:"org-b",code:"STORE-1",status:"active",marker:"scope-check"}]);
  await db.collection("users").insertOne({userId,emailNormalized:"shared@example.test",status:"active"});
  await assert.rejects(()=>db.collection("users").insertOne({userId:"user-duplicate",emailNormalized:"shared@example.test",status:"active"}),"global email uniqueness");
  await db.collection("memberships").insertMany([
   {tenantId:tenantA,membershipId:"mem-a",userId,organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["role-a"],status:"active",marker:"scope-check"},
   {tenantId:tenantB,membershipId:"mem-b",userId,organizationIds:["org-b"],locationIds:["loc-b"],roleIds:["role-b"],status:"active",marker:"scope-check"}
  ]);
  await assert.rejects(()=>db.collection("memberships").insertOne({tenantId:tenantA,membershipId:"mem-a2",userId,organizationIds:[],locationIds:[],roleIds:[],status:"active"}),"one active membership per tenant/user");
  await db.collection("roles").insertMany([{tenantId:tenantA,roleId:"role-a",key:"operator",marker:"scope-check"},{tenantId:tenantB,roleId:"role-b",key:"operator",marker:"scope-check"}]);
  await db.collection("policies").insertMany([{tenantId:tenantA,policyId:"policy-a",key:"read",marker:"scope-check"},{tenantId:tenantB,policyId:"policy-b",key:"read",marker:"scope-check"}]);
  await db.collection("sessions").insertOne({tenantId:tenantA,sessionId:"session-race",userId,membershipId:"mem-a",tokenFamilyId:"family-a",refreshTokenHash:hash("initial"),refreshTokenHistory:[],expiresAt:new Date(Date.now()+60_000),lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId,marker:"scope-check"});
  await db.collection("sessions").insertOne({tenantId:tenantB,sessionId:"session-b",userId,membershipId:"mem-b",tokenFamilyId:"family-b",refreshTokenHash:hash("tenant-b-token"),refreshTokenHistory:[],expiresAt:new Date(Date.now()+60_000),lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId,marker:"scope-check"});
  await db.collection("feature_flags").insertMany([{tenantId:tenantA,key:"new-ui",enabled:true,marker:"scope-check"},{tenantId:tenantB,key:"new-ui",enabled:false,marker:"scope-check"}]);
  await db.collection("audit_events").insertMany([{tenantId:tenantA,eventId:"event-a",occurredAt:now,marker:"scope-check"},{tenantId:tenantB,eventId:"event-b",occurredAt:now,marker:"scope-check"}]);

  const names=["organizations","locations","memberships","roles","policies","sessions","feature_flags","audit_events"];
  for(const name of names){
   const collection=db.collection<{tenantId:string;marker:string;_id?:unknown}>(name);
   const visible=await collection.find(scoped<{tenantId:string;marker:string}>(tenantA,{marker:"scope-check"})).toArray();
   assert.ok(visible.length>0,name+" should have tenant A fixtures");
   assert.ok(visible.every(v=>v.tenantId===tenantA),name+" must not return tenant B documents");
  }

  await assert.rejects(()=>rotateRefreshToken(db,tenantA,"session-race","unrelated-invalid-token"),/SESSION_INVALID/);
  let session=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:"session-race"});
  assert.equal(session?.revokedAt,undefined,"an arbitrary invalid token must not revoke a session");
  const concurrent=await Promise.allSettled([rotateRefreshToken(db,tenantA,"session-race","initial"),rotateRefreshToken(db,tenantA,"session-race","initial")]);
  assert.equal(concurrent.filter(v=>v.status==="fulfilled").length,1,"exactly one refresh rotation may succeed");
  assert.equal(concurrent.filter(v=>v.status==="rejected").length,1,"the duplicate refresh must be rejected");
  session=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:"session-race"});
  assert.ok(session?.revokedAt,"reuse of a consumed token must revoke the token family");

  await db.collection("sessions").insertOne({tenantId:tenantA,sessionId:"session-membership",userId,membershipId:"mem-a",tokenFamilyId:"family-membership",refreshTokenHash:hash("membership-token"),refreshTokenHistory:[],expiresAt:new Date(Date.now()+60_000),lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId});
  await revokeMembership(db,tenantA,"mem-a","integration-test");
  session=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:"session-membership"});
  assert.ok(session?.revokedAt,"membership revocation must revoke its sessions");

  await setTenantStatus(db,tenantB,"suspended","integration-test");
  session=await db.collection("sessions").findOne({tenantId:tenantB,sessionId:"session-b"});
  assert.ok(session?.revokedAt,"tenant suspension must revoke its sessions");
 }finally{await db.dropDatabase();await client.close();}
});
