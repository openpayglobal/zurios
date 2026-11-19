import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {SignJWT} from "jose";
import {platformRoutes} from "./platform-routes.js";
import type {AuthConfig} from "./auth-service.js";

const uri=process.env.MONGODB_TEST_URI;
const config:AuthConfig={
 issuer:"https://zuri.test",audience:"zuri-api-test",jwtSecret:"test-only-secret-that-is-long-enough-for-ci",
 accessTokenTtlSeconds:300,sessionTtlSeconds:3600,mfaEncryptionKey:""
};
const signingKey=new TextEncoder().encode(config.jwtSecret);

test("versioned platform API enforces tenant, scope, idempotency and outbox invariants",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_api_it_${randomUUID().replaceAll("-","")}`);
 const app=Fastify();
 try{
  const now=new Date();
  await db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true});
  await db.collection("outbox_events").createIndex({eventId:1},{unique:true});
  await db.collection("tenants").insertMany([{tenantId:"tenant-a",status:"active"},{tenantId:"tenant-b",status:"active"}]);
  await db.collection("users").insertMany([{userId:"operator-a",status:"active"},{userId:"target-user",status:"active"}]);
  await db.collection("organizations").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",code:"org-a",name:"Tenant A Org",path:[],status:"active"},
   {tenantId:"tenant-a",organizationId:"org-b",code:"org-b",name:"Tenant A Other Org",path:[],status:"active"},
   {tenantId:"tenant-b",organizationId:"org-secret",code:"secret",name:"Tenant B Secret",path:[],status:"active"}
  ]);
  await db.collection("locations").insertMany([
   {tenantId:"tenant-a",locationId:"loc-a",organizationId:"org-a",name:"A Location",status:"active"},
   {tenantId:"tenant-a",locationId:"loc-b",organizationId:"org-b",name:"B Location",status:"active"}
  ]);
  await db.collection("roles").insertOne({
   tenantId:"tenant-a",roleId:"role-admin",key:"test.admin",
   permissionKeys:["platform.tenant.read","platform.organizations.read","platform.organizations.create","platform.locations.read","platform.locations.create","platform.memberships.read","platform.memberships.create","platform.memberships.assign.roles","platform.roles.read","platform.roles.create","platform.policies.read","platform.policies.write","platform.policies.write.allow","platform.policies.write.deny","platform.policies.write.global","platform.feature-flags.read","platform.feature-flags.write","platform.sessions.read","platform.sessions.revoke","platform.sessions.revoke.all","platform.audit.read"],status:"active"
  });
  await db.collection("roles").insertOne({tenantId:"tenant-a",roleId:"role-super",key:"test.super",permissionKeys:["platform.superuser"],status:"active"});
  await db.collection("memberships").insertOne({
   tenantId:"tenant-a",membershipId:"membership-a",userId:"operator-a",
   organizationIds:["org-a","org-b"],locationIds:["loc-a","loc-b"],roleIds:["role-admin"],status:"active"
  });
  await db.collection("sessions").insertOne({
   tenantId:"tenant-a",sessionId:"session-a",userId:"operator-a",membershipId:"membership-a",
   expiresAt:new Date(now.getTime()+60_000),lastUsedAt:now
  });
  await app.register(platformRoutes(db,config),{prefix:"/v1"});
  await app.register(platformRoutes(db,config));
  await app.ready();
  const token=await new SignJWT({tenantId:"tenant-a",membershipId:"membership-a",sessionId:"session-a"})
   .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience)
   .setSubject("operator-a").setIssuedAt().setExpirationTime("5m").sign(signingKey);

  const unauthenticated=await app.inject({method:"GET",url:"/v1/platform/organizations"});
  assert.equal(unauthenticated.statusCode,401);

  const organizations=await app.inject({
   method:"GET",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`}
  });
  assert.equal(organizations.statusCode,200);
  const body=organizations.json() as {data:Array<{organizationId:string;tenantId:string}>};
  assert.deepEqual(body.data.map(item=>item.organizationId).sort(),["org-a","org-b"]);
  assert.ok(body.data.every(item=>item.tenantId==="tenant-a"));

  await db.collection("policies").insertOne({
   tenantId:"tenant-a",policyId:"policy-deny-org-read",key:"deny-org-read",effect:"deny",priority:100,
   subject:{userId:"operator-a"},resource:{resourceType:"platform_api"},actions:["platform.organizations.read"],conditions:{},status:"active"
  });
  const abacDenied=await app.inject({method:"GET",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(abacDenied.statusCode,403);
  assert.equal(abacDenied.json().error,"ABAC_POLICY_DENIED");


  const legacy=await app.inject({method:"GET",url:"/platform/organizations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(legacy.statusCode,200);
  assert.equal(legacy.headers.deprecation,"true");
  assert.equal(legacy.headers.link,'</v1/platform>; rel="successor-version"');

  const invalidMembership=await app.inject({
   method:"POST",url:"/v1/platform/memberships",
   headers:{authorization:`Bearer ${token}`,"idempotency-key":"membership-invalid-0001"},
   payload:{userId:"target-user",organizationIds:["org-a"],locationIds:["loc-b"],roleIds:[]}
  });
  assert.equal(invalidMembership.statusCode,422);
  assert.equal(invalidMembership.json().error,"INVALID_LOCATION_ORGANIZATION_SCOPE");
  assert.equal(await db.collection("audit_events").countDocuments({tenantId:"tenant-a",action:"platform.memberships.create.failed",outcome:"failure"}),1);

  const deniedMembership=await app.inject({
   method:"POST",url:"/v1/platform/memberships",
   headers:{authorization:`Bearer ${token}`,"idempotency-key":"membership-denied-0001"},
   payload:{userId:"target-user",organizationIds:["org-secret"],locationIds:[],roleIds:[]}
  });
  assert.equal(deniedMembership.statusCode,403);
  assert.equal(deniedMembership.json().error,"MEMBERSHIP_SCOPE_DENIED");

  const escalatedMembership=await app.inject({
   method:"POST",url:"/v1/platform/memberships",
   headers:{authorization:`Bearer ${token}`,"idempotency-key":"membership-escalation-0001"},
   payload:{userId:"target-user",organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["role-super"]}
  });
  assert.equal(escalatedMembership.statusCode,403);
  assert.equal(escalatedMembership.json().error,"ROLE_ASSIGNMENT_PRIVILEGE_ESCALATION_DENIED");

  assert.equal(await db.collection("audit_events").countDocuments({tenantId:"tenant-a",action:"authorization.denied",resourceType:"membership",outcome:"denied"}),1);


  const validPayload={userId:"target-user",organizationIds:["org-a"],locationIds:["loc-a"],roleIds:[]};
  const create=()=>app.inject({
   method:"POST",url:"/v1/platform/memberships",
   headers:{authorization:`Bearer ${token}`,"idempotency-key":"membership-create-0001"},
   payload:validPayload
  });
  const created=await create(),replayed=await create();
  assert.equal(created.statusCode,201);
  assert.equal(replayed.statusCode,201);
  assert.equal(replayed.headers["idempotency-replayed"],"true");
  assert.deepEqual(replayed.json(),created.json());
  assert.equal(await db.collection("memberships").countDocuments({tenantId:"tenant-a",userId:"target-user"}),1);
  assert.equal(await db.collection("outbox_events").countDocuments({tenantId:"tenant-a",eventType:"platform.membership.created"}),1);
  assert.equal(await db.collection("audit_events").countDocuments({tenantId:"tenant-a",action:"platform.membership.created"}),1);

  const changed=await app.inject({
   method:"POST",url:"/v1/platform/memberships",
   headers:{authorization:`Bearer ${token}`,"idempotency-key":"membership-create-0001"},
   payload:{...validPayload,organizationIds:["org-b"],locationIds:["loc-b"]}
  });
  assert.equal(changed.statusCode,409);
  assert.equal(changed.json().error,"IDEMPOTENCY_KEY_REUSED");
 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
