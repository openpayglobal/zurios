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

  const deniedWithoutAllow=await app.inject({method:"GET",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(deniedWithoutAllow.statusCode,403);
  assert.equal(deniedWithoutAllow.json().error,"ABAC_POLICY_NO_MATCHING_ALLOW");
  const adminRole=await db.collection("roles").findOne({tenantId:"tenant-a",roleId:"role-admin"});
  const allowedActions=(adminRole?.permissionKeys??[]) as string[];
  await db.collection("policies").insertMany(allowedActions.map((action,index)=>({
   tenantId:"tenant-a",policyId:"route-allow-"+index,key:"route-allow-"+index,effect:"allow",priority:0,
   subject:{userId:"operator-a"},resource:{},actions:[action],conditions:{},status:"active"
  })));
  const organizations=await app.inject({
   method:"GET",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`}
  });
  assert.equal(organizations.statusCode,200);
  const body=organizations.json() as {data:Array<{organizationId:string;tenantId:string}>};
  assert.deepEqual(body.data.map(item=>item.organizationId).sort(),["org-a","org-b"]);
  assert.ok(body.data.every(item=>item.tenantId==="tenant-a"));

  const legacy=await app.inject({method:"GET",url:"/platform/organizations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(legacy.statusCode,200);
  assert.equal(legacy.headers.deprecation,"true");
  assert.equal(legacy.headers.link,'</v1/platform>; rel="successor-version"');
  const tenantRead=await app.inject({method:"GET",url:"/v1/platform/tenant",headers:{authorization:`Bearer ${token}`}});
  assert.equal(tenantRead.statusCode,200);
  assert.equal(tenantRead.json().data.tenantId,"tenant-a");

  const locationRead=await app.inject({method:"GET",url:"/v1/platform/locations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(locationRead.statusCode,200);
  assert.equal(locationRead.json().data.length,2);
  const roleRead=await app.inject({method:"GET",url:"/v1/platform/roles",headers:{authorization:`Bearer ${token}`}});
  assert.equal(roleRead.statusCode,200);
  assert.ok(roleRead.json().data.some((role:any)=>role.roleId==="role-admin"));
  const policyRead=await app.inject({method:"GET",url:"/v1/platform/policies",headers:{authorization:`Bearer ${token}`}});
  assert.equal(policyRead.statusCode,200);
  assert.ok(policyRead.json().data.length>0);
  const flagRead=await app.inject({method:"GET",url:"/v1/platform/feature-flags",headers:{authorization:`Bearer ${token}`}});
  assert.equal(flagRead.statusCode,200);
  const sessionRead=await app.inject({method:"GET",url:"/v1/platform/sessions",headers:{authorization:`Bearer ${token}`}});
  assert.equal(sessionRead.statusCode,200);
  assert.ok(sessionRead.json().data.some((session:any)=>session.sessionId==="session-a"));


  await db.collection("policies").insertOne({
   tenantId:"tenant-a",policyId:"policy-deny-org-read",key:"deny-org-read",effect:"deny",priority:100,
   subject:{userId:"operator-a"},resource:{resourceType:"platform_api"},actions:["platform.organizations.read"],conditions:{},status:"active"
  });
  const abacDenied=await app.inject({method:"GET",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(abacDenied.statusCode,403);
  assert.equal(abacDenied.json().error,"ABAC_POLICY_DENIED");
  const organizationCreate=await app.inject({method:"POST",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`,"idempotency-key":"organization-create-route-0001"},payload:{code:"org-c",name:"Tenant A Child",type:"department",parentOrganizationId:"org-a"}});
  assert.equal(organizationCreate.statusCode,201);
  const locationCreate=await app.inject({method:"POST",url:"/v1/platform/locations",headers:{authorization:`Bearer ${token}`,"idempotency-key":"location-create-route-0001"},payload:{organizationId:"org-a",code:"LOC-C",name:"Location C",type:"warehouse"}});
  assert.equal(locationCreate.statusCode,201);
  const organizationReadAfterCreate=await app.inject({method:"GET",url:"/v1/platform/organizations",headers:{authorization:`Bearer ${token}`}});
  assert.equal(organizationReadAfterCreate.statusCode,403,"explicit deny continues to override an allow policy");

  const roleCreate=await app.inject({method:"POST",url:"/v1/platform/roles",headers:{authorization:`Bearer ${token}`,"idempotency-key":"role-create-route-0001"},payload:{key:"test.created",name:"Created Test Role",description:"Route integration role",permissionKeys:["platform.organizations.read"],isSystem:false}});
  assert.equal(roleCreate.statusCode,201);
  const policyWrite=await app.inject({method:"PUT",url:"/v1/platform/policies/route-created-policy",headers:{authorization:`Bearer ${token}`,"idempotency-key":"policy-write-route-0001"},payload:{effect:"allow",priority:5,subject:{userId:"operator-a"},resource:{resourceType:"platform_api"},actions:["platform.test.read"],conditions:{}}});
  assert.equal(policyWrite.statusCode,200);
  const flagWrite=await app.inject({method:"PUT",url:"/v1/platform/feature-flags/route-created-flag",headers:{authorization:`Bearer ${token}`,"idempotency-key":"feature-flag-write-route-0001"},payload:{enabled:true,description:"Route integration flag",environments:["test"],rules:[]}});
  assert.equal(flagWrite.statusCode,200);
  const flagReadAfterWrite=await app.inject({method:"GET",url:"/v1/platform/feature-flags",headers:{authorization:`Bearer ${token}`}});
  assert.equal(flagReadAfterWrite.statusCode,200);
  assert.ok(flagReadAfterWrite.json().data.some((flag:any)=>flag.key==="route-created-flag"));



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

  assert.equal(await db.collection("audit_events").countDocuments({tenantId:"tenant-a",action:"authorization.denied",resourceType:"membership",outcome:"denied"}),2);


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
  const membershipDirectory=await app.inject({method:"GET",url:"/v1/platform/memberships",headers:{authorization:`Bearer ${token}`}});
  assert.equal(membershipDirectory.statusCode,200);
  assert.ok(membershipDirectory.json().data.some((membership:any)=>membership.userId==="target-user"));
  const auditDirectory=await app.inject({method:"GET",url:"/v1/platform/audit-events",headers:{authorization:`Bearer ${token}`}});
  assert.equal(auditDirectory.statusCode,200);
  assert.ok(auditDirectory.json().data.length>0);

  const changed=await app.inject({
   method:"POST",url:"/v1/platform/memberships",
   headers:{authorization:`Bearer ${token}`,"idempotency-key":"membership-create-0001"},
   payload:{...validPayload,organizationIds:["org-b"],locationIds:["loc-b"]}
  });
  assert.equal(changed.statusCode,409);
  assert.equal(changed.json().error,"IDEMPOTENCY_KEY_REUSED");
  const sessionRevoke=await app.inject({method:"POST",url:"/v1/platform/sessions/session-a/revoke",headers:{authorization:`Bearer ${token}`,"idempotency-key":"session-revoke-route-0001"}});
  assert.equal(sessionRevoke.statusCode,204);
  assert.ok(await db.collection("sessions").findOne({tenantId:"tenant-a",sessionId:"session-a",revokedAt:{$exists:true}}));
 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
