import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {totpCode} from "./auth-crypto.js";
import {macOperatorRoutes} from "./mac-operator-routes.js";

const uri=process.env.MONGODB_TEST_URI;
const config={issuer:"https://zuri.test",audience:"zuri-mac-test",jwtSecret:"mac-test-signing-secret-with-more-than-32-bytes",bootstrapToken:"mac-test-bootstrap-token-with-more-than-32-bytes",mfaEncryptionKey:Buffer.alloc(32,7).toString("base64"),sessionTtlSeconds:3600};

test("MAC bootstrap, MFA activation, login, read APIs, refresh rotation and logout are isolated", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_mac_it_${randomUUID().replaceAll("-","")}`),app=Fastify(),authApp=Fastify();
 try{
  await db.collection("platform_operators").createIndex({operatorId:1},{unique:true});
  await db.collection("platform_operators").createIndex({emailNormalized:1},{unique:true});
  await db.collection("platform_operators").createIndex({bootstrapOwner:1},{unique:true,partialFilterExpression:{bootstrapOwner:true}});
  await db.collection("platform_operator_sessions").createIndex({sessionId:1},{unique:true});
  await db.collection("admin_audit_events").createIndex({eventId:1},{unique:true});
  await db.collection("mac_auth_rate_limits").createIndex({key:1},{unique:true});
  await db.collection("tenants").insertMany([{tenantId:"tenant-a",slug:"tenant-a",name:"Tenant A",status:"active"},{tenantId:"tenant-b",slug:"tenant-b",name:"Tenant B",status:"active"}]);
  await app.register(macOperatorRoutes(db,config),{prefix:"/v1"});await app.ready();
  const bootstrap=await app.inject({method:"POST",url:"/v1/mac/auth/bootstrap",headers:{"x-mac-bootstrap-token":config.bootstrapToken},payload:{email:"owner@example.test",displayName:"Platform Owner",password:"A-strong-test-password-2026"}});
  assert.equal(bootstrap.statusCode,201);
  const secret=bootstrap.json().totpSecret as string;
  const bootstrapCode=totpCode(secret);
  const confirm=await app.inject({method:"POST",url:"/v1/mac/auth/bootstrap/confirm",headers:{"x-mac-bootstrap-token":config.bootstrapToken},payload:{email:"owner@example.test",code:bootstrapCode}});
  assert.equal(confirm.statusCode,201);
  const session=confirm.json() as {accessToken:string;refreshToken:string;sessionId:string};
  assert.ok(session.accessToken);assert.ok(session.refreshToken);
  const replayedBootstrapCode=await app.inject({method:"POST",url:"/v1/mac/auth/login",payload:{email:"owner@example.test",password:"A-strong-test-password-2026",code:bootstrapCode}});
  assert.equal(replayedBootstrapCode.statusCode,401);
  const authOnlyConfig={issuer:config.issuer,audience:config.audience,jwtSecret:config.jwtSecret,mfaEncryptionKey:config.mfaEncryptionKey,sessionTtlSeconds:config.sessionTtlSeconds};
  await authApp.register(macOperatorRoutes(db,authOnlyConfig),{prefix:"/v1"});await authApp.ready();
  const nextStepCode=totpCode(secret,Math.floor(Date.now()/30_000)+1);
  const login=await authApp.inject({method:"POST",url:"/v1/mac/auth/login",payload:{email:"owner@example.test",password:"A-strong-test-password-2026",code:nextStepCode}});
  assert.equal(login.statusCode,200);
  assert.equal(login.json().operator.email,"owner@example.test");
  const loginSession=login.json() as {accessToken:string;sessionId:string};
  const operators=await authApp.inject({method:"GET",url:"/v1/mac/operators",headers:{authorization:`Bearer ${session.accessToken}`}});
  assert.equal(operators.statusCode,200);assert.equal(operators.json().data.length,1);
  const sessions=await authApp.inject({method:"GET",url:"/v1/mac/sessions",headers:{authorization:`Bearer ${session.accessToken}`}});
  assert.equal(sessions.statusCode,200);assert.equal(sessions.json().data.length,2);
  const revoke=await authApp.inject({method:"POST",url:`/v1/mac/sessions/${loginSession.sessionId}/revoke`,headers:{authorization:`Bearer ${session.accessToken}`},payload:{reason:"Test operator session revocation"}});
  assert.equal(revoke.statusCode,204);
  const revokedLogin=await authApp.inject({method:"GET",url:"/v1/mac/overview",headers:{authorization:`Bearer ${loginSession.accessToken}`}});
  assert.equal(revokedLogin.statusCode,401);
  const secondBootstrap=await app.inject({method:"POST",url:"/v1/mac/auth/bootstrap",headers:{"x-mac-bootstrap-token":config.bootstrapToken},payload:{email:"attacker@example.test",displayName:"Attacker",password:"Another-strong-password-2026"}});
  assert.equal(secondBootstrap.statusCode,409);
  const overview=await authApp.inject({method:"GET",url:"/v1/mac/overview",headers:{authorization:`Bearer ${session.accessToken}`}});
  assert.equal(overview.statusCode,200);assert.equal(overview.json().data.tenants,2);
  const tenantList=await authApp.inject({method:"GET",url:"/v1/mac/tenants?limit=1",headers:{authorization:`Bearer ${session.accessToken}`}});
  assert.equal(tenantList.statusCode,200);assert.equal(tenantList.json().data.length,1);assert.equal(tenantList.json().page.hasMore,true);
  const invalidTenantQuery=await authApp.inject({method:"GET",url:"/v1/mac/tenants?limit=101",headers:{authorization:`Bearer ${session.accessToken}`}});
  assert.equal(invalidTenantQuery.statusCode,400);
  const revokeCurrent=await authApp.inject({method:"POST",url:`/v1/mac/sessions/${session.sessionId}/revoke`,headers:{authorization:`Bearer ${session.accessToken}`},payload:{reason:"Attempt to revoke own session"}});
  assert.equal(revokeCurrent.statusCode,409);
  const refresh=await authApp.inject({method:"POST",url:"/v1/mac/auth/refresh",payload:{sessionId:session.sessionId,refreshToken:session.refreshToken}});
  assert.equal(refresh.statusCode,200);
  const rotated=refresh.json() as {accessToken:string;refreshToken:string};
  assert.notEqual(rotated.refreshToken,session.refreshToken);
  const reuse=await authApp.inject({method:"POST",url:"/v1/mac/auth/refresh",payload:{sessionId:session.sessionId,refreshToken:session.refreshToken}});
  assert.equal(reuse.statusCode,401);
  const logout=await authApp.inject({method:"POST",url:"/v1/mac/auth/logout",headers:{authorization:`Bearer ${rotated.accessToken}`}});
  assert.equal(logout.statusCode,204);
  const revoked=await authApp.inject({method:"GET",url:"/v1/mac/overview",headers:{authorization:`Bearer ${rotated.accessToken}`}});
  assert.equal(revoked.statusCode,401);
  assert.equal(await db.collection("admin_audit_events").countDocuments({action:"mac.auth.login",outcome:"success"}),2);
 }finally{await app.close();await authApp.close();await db.dropDatabase();await client.close();}
});

test("MAC routes stay unavailable until separate signing, bootstrap and encryption secrets are configured", async()=>{
 const app=Fastify();
 try{
  const client=new MongoClient(uri??"mongodb://127.0.0.1:27017"); 
  const configWithoutSecrets={issuer:config.issuer,audience:config.audience,sessionTtlSeconds:3600,mfaEncryptionKey:""};
  await app.register(macOperatorRoutes(client.db("mac-disabled-test"),configWithoutSecrets),{prefix:"/v1"});await app.ready();
  const response=await app.inject({method:"POST",url:"/v1/mac/auth/bootstrap",payload:{email:"x@example.test",displayName:"Test",password:"Long-password-12345"}});
  assert.equal(response.statusCode,503);assert.equal(response.json().error,"MAC_AUTH_NOT_CONFIGURED");
  await client.close();
 }finally{await app.close();}
});
