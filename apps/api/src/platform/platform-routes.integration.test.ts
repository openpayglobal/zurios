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

test("platform API enforces authenticated tenant and organization-location scope",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_api_it_${randomUUID().replaceAll("-","")}`);
 const app=Fastify();
 try{
  const now=new Date();
  await db.collection("tenants").insertMany([
   {tenantId:"tenant-a",status:"active"},
   {tenantId:"tenant-b",status:"active"}
  ]);
  await db.collection("users").insertMany([
   {userId:"operator-a",status:"active"},
   {userId:"target-user",status:"active"}
  ]);
  await db.collection("organizations").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",name:"Tenant A Org",status:"active"},
   {tenantId:"tenant-a",organizationId:"org-b",name:"Tenant A Other Org",status:"active"},
   {tenantId:"tenant-b",organizationId:"org-secret",name:"Tenant B Secret",status:"active"}
  ]);
  await db.collection("locations").insertMany([
   {tenantId:"tenant-a",locationId:"loc-a",organizationId:"org-a",name:"A Location",status:"active"},
   {tenantId:"tenant-a",locationId:"loc-b",organizationId:"org-b",name:"B Location",status:"active"}
  ]);
  await db.collection("roles").insertOne({
   tenantId:"tenant-a",roleId:"role-admin",key:"test.admin",
   permissionKeys:["platform.organizations.read","platform.memberships.create"],status:"active"
  });
  await db.collection("memberships").insertOne({
   tenantId:"tenant-a",membershipId:"membership-a",userId:"operator-a",
   organizationIds:["org-a","org-b"],locationIds:["loc-a","loc-b"],roleIds:["role-admin"],status:"active"
  });
  await db.collection("sessions").insertOne({
   tenantId:"tenant-a",sessionId:"session-a",userId:"operator-a",membershipId:"membership-a",
   expiresAt:new Date(now.getTime()+60_000),lastUsedAt:now
  });
  await app.register(platformRoutes(db,config));
  await app.ready();
  const token=await new SignJWT({tenantId:"tenant-a",membershipId:"membership-a",sessionId:"session-a"})
   .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience)
   .setSubject("operator-a").setIssuedAt().setExpirationTime("5m").sign(signingKey);

  const unauthenticated=await app.inject({method:"GET",url:"/platform/organizations"});
  assert.equal(unauthenticated.statusCode,401);

  const organizations=await app.inject({
   method:"GET",url:"/platform/organizations",headers:{authorization:`Bearer ${token}`}
  });
  assert.equal(organizations.statusCode,200);
  const body=organizations.json() as {data:Array<{organizationId:string;tenantId:string}>};
  assert.deepEqual(body.data.map(item=>item.organizationId).sort(),["org-a","org-b"]);
  assert.ok(body.data.every(item=>item.tenantId==="tenant-a"));

  const invalidMembership=await app.inject({
   method:"POST",url:"/platform/memberships",headers:{authorization:`Bearer ${token}`},
   payload:{userId:"target-user",organizationIds:["org-a"],locationIds:["loc-b"],roleIds:[]}
  });
  assert.equal(invalidMembership.statusCode,422);
  assert.equal(invalidMembership.json().error,"INVALID_LOCATION_ORGANIZATION_SCOPE");
 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
