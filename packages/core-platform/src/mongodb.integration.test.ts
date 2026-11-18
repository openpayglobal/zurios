import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {scoped} from "./repositories.js";
import {rotateRefreshToken,createSession} from "./session-service.js";
import {revokeMembership,createMembership} from "./membership-service.js";
import {setTenantStatus,provisionTenant} from "./tenant-service.js";
import {runCoreMigrations} from "./migration-registry.js";
import {seedPlatform} from "./seed.js";
import {createOrganization} from "./organization-service.js";
import {createLocation} from "./location-service.js";
import {createUser,setUserStatus} from "./user-service.js";
import {createRole,permissionsForMembership} from "./rbac-service.js";
const uri=process.env.MONGODB_TEST_URI;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
test("MongoDB replica-set integration: tenant isolation, service lifecycles, migrations, seeds and session replay", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_core_it_${randomUUID().replaceAll("-","")}`);
 try{
  assert.deepEqual(await runCoreMigrations(db),["0001_core_indexes"]);
  assert.deepEqual(await runCoreMigrations(db),[],"migration runner must be idempotent");
  const now=new Date(),tenantA="tenant-a",tenantB="tenant-b",userId="user-global";
  await db.collection("tenants").insertMany([{tenantId:tenantA,slug:"tenant-a",status:"active"},{tenantId:tenantB,slug:"tenant-b",status:"active"}]);
  const provisioned=await provisionTenant(db,"integration-test",{slug:"tenant-c",legalName:"Tenant C Limited",displayName:"Tenant C",defaultCurrency:"ugx"});
  assert.equal(provisioned.status,"provisioning");assert.equal(provisioned.defaultCurrency,"UGX");
  await setTenantStatus(db,provisioned.tenantId,"active","integration-test");
  await db.collection("organizations").insertMany([{tenantId:tenantA,organizationId:"org-a",code:"HQ",status:"active",path:[],marker:"scope-check"},{tenantId:tenantB,organizationId:"org-b",code:"HQ",status:"active",path:[],marker:"scope-check"}]);
  await db.collection("locations").insertMany([{tenantId:tenantA,locationId:"loc-a",organizationId:"org-a",code:"STORE-1",status:"active",marker:"scope-check"},{tenantId:tenantB,locationId:"loc-b",organizationId:"org-b",code:"STORE-1",status:"active",marker:"scope-check"}]);
  await assert.rejects(()=>createOrganization(db,tenantA,"tester",{code:"BAD-PARENT",name:"Bad Parent",type:"department",parentOrganizationId:"org-b"}),/PARENT_ORGANIZATION_NOT_FOUND/);
  const childOrg=await createOrganization(db,tenantA,"tester",{code:"SALES",name:"Sales",type:"department",parentOrganizationId:"org-a"});
  assert.deepEqual(childOrg.path,["org-a"],"organization hierarchy path must include parent");
  await assert.rejects(()=>createLocation(db,tenantA,"tester",{organizationId:"org-b",code:"BAD-ORG",name:"Bad location",type:"store"}),/ORGANIZATION_NOT_FOUND/);
  const childLocation=await createLocation(db,tenantA,"tester",{organizationId:"org-a",parentLocationId:"loc-a",code:"STORE-2",name:"Second store",type:"store"});
  assert.equal(childLocation.parentLocationId,"loc-a");

  await db.collection("users").insertOne({userId,emailNormalized:"shared@example.test",status:"active"});
  await assert.rejects(()=>db.collection("users").insertOne({userId:"user-duplicate",emailNormalized:"shared@example.test",status:"active"}),/E11000/);
  await db.collection("memberships").insertMany([
   {tenantId:tenantA,membershipId:"mem-a",userId,organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["role-a"],status:"active",marker:"scope-check"},
   {tenantId:tenantB,membershipId:"mem-b",userId,organizationIds:["org-b"],locationIds:["loc-b"],roleIds:["role-b"],status:"active",marker:"scope-check"}
  ]);
  await assert.rejects(()=>db.collection("memberships").insertOne({tenantId:tenantA,membershipId:"mem-a2",userId,organizationIds:[],locationIds:[],roleIds:[],status:"active"}),/E11000/);
  await db.collection("roles").insertMany([{tenantId:tenantA,roleId:"role-a",key:"operator",permissionKeys:["platform.read"],status:"active",marker:"scope-check"},{tenantId:tenantB,roleId:"role-b",key:"operator",permissionKeys:["platform.read"],status:"active",marker:"scope-check"}]);
  await assert.rejects(()=>createRole(db,tenantA,"tester",{key:"unsafe.root",name:"Unsafe Root",permissionKeys:["*"]}),/Wildcard permissions are prohibited/);
  await db.collection("policies").insertMany([{tenantId:tenantA,policyId:"policy-a",key:"read",marker:"scope-check"},{tenantId:tenantB,policyId:"policy-b",key:"read",marker:"scope-check"}]);
  await db.collection("sessions").insertOne({tenantId:tenantA,sessionId:"session-race",userId,membershipId:"mem-a",tokenFamilyId:"family-a",refreshTokenHash:hash("initial"),refreshTokenHistory:[],expiresAt:new Date(Date.now()+60_000),lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId,marker:"scope-check"});
  await db.collection("sessions").insertOne({tenantId:tenantB,sessionId:"session-b",userId,membershipId:"mem-b",tokenFamilyId:"family-b",refreshTokenHash:hash("tenant-b-token"),refreshTokenHistory:[],expiresAt:new Date(Date.now()+60_000),lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId,marker:"scope-check"});
  await db.collection("feature_flags").insertMany([{tenantId:tenantA,key:"new-ui",enabled:true,marker:"scope-check"},{tenantId:tenantB,key:"new-ui",enabled:false,marker:"scope-check"}]);
  await db.collection("audit_events").insertMany([{tenantId:tenantA,eventId:"event-a",occurredAt:now,marker:"scope-check"},{tenantId:tenantB,eventId:"event-b",occurredAt:now,marker:"scope-check"}]);
  const names=["organizations","locations","memberships","roles","policies","sessions","feature_flags","audit_events"];
  for(const name of names){
   const collection=db.collection<{tenantId:string;marker:string}>(name);
   const visible=await collection.find(scoped<{tenantId:string;marker:string}>(tenantA,{marker:"scope-check"})).toArray();
   assert.ok(visible.length>0,name+" should have tenant A fixtures");
   assert.ok(visible.every(v=>v.tenantId===tenantA),name+" must not return tenant B documents");
  }

  const user2=await createUser(db,"integration-test",{email:"Second.User@Example.Test",displayName:"Second User"});
  assert.equal(user2.emailNormalized,"second.user@example.test");
  await setUserStatus(db,user2.userId,"active","integration-test");
  const role2=await createRole(db,tenantA,"integration-test",{key:"test.viewer",name:"Test Viewer",permissionKeys:["organization.read"]});
  const membership2=await createMembership(db,tenantA,"integration-test",{userId:user2.userId,organizationIds:["org-a"],locationIds:["loc-a"],roleIds:[role2.roleId]});
  assert.deepEqual(await permissionsForMembership(db,tenantA,membership2.membershipId),["organization.read"]);
  await assert.rejects(()=>createMembership(db,tenantA,"integration-test",{userId:user2.userId,organizationIds:["org-b"]}),/INVALID_ORGANIZATION_SCOPE/);
  const issued=await createSession(db,tenantA,user2.userId,membership2.membershipId,3600);
  const persisted=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:issued.sessionId});
  assert.equal(persisted?.refreshTokenHash,hash(issued.refreshToken),"only the refresh token digest may be persisted");
  assert.notEqual(persisted?.refreshTokenHash,issued.refreshToken);
  await setUserStatus(db,user2.userId,"suspended","integration-test");
  const suspendedSession=await db.collection("sessions").findOne({tenantId:tenantA,sessionId:issued.sessionId});
  assert.ok(suspendedSession?.revokedAt,"global user suspension must revoke sessions");

  await seedPlatform(db,tenantA,"integration-test");
  await seedPlatform(db,tenantA,"integration-test");
  assert.equal(await db.collection("roles").countDocuments({tenantId:tenantA,key:"tenant.viewer"}),1,"seed must be idempotent");
  const seeded=await db.collection("roles").findOne({tenantId:tenantA,key:"tenant.viewer"});
  assert.ok(!seeded?.permissionKeys?.includes("*"),"seed must not grant wildcard permission");

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
