import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {provisionTenant,setTenantStatus,createUser,createMembership,runCoreMigrations} from "@zuri/core-platform";
import {issueInvitation,acceptInvitation,login} from "./auth-service.js";
const uri=process.env.MONGODB_TEST_URI;
test("invitation acceptance and password login use active tenant membership", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_auth_"+randomUUID().replaceAll("-",""));
 try{
  await runCoreMigrations(db);
  await db.collection("auth_rate_limits").createIndex({key:1},{unique:true});
  const tenant=await provisionTenant(db,"test",{slug:"auth-test",legalName:"Auth Test Ltd",displayName:"Auth Test"});
  await setTenantStatus(db,tenant.tenantId,"active","test");
  const user=await createUser(db,"test",{email:"auth@example.test",displayName:"Auth User"});
  const invitation=await issueInvitation(db,user.userId);
  const password=randomBytes(24).toString("base64url");
  await acceptInvitation(db,user.userId,invitation,password);
  await createMembership(db,tenant.tenantId,"test",{userId:user.userId});
  const cfg={issuer:"https://identity.example.test",audience:"zuri-api-test",jwtSecret:randomBytes(32).toString("base64url"),accessTokenTtlSeconds:900,sessionTtlSeconds:3600,mfaEncryptionKey:randomBytes(32).toString("base64")};
  const result=await login(db,cfg,{email:"AUTH@example.test",password,tenantSlug:tenant.slug,ipHash:"integration"});
  assert.equal(result.mfaRequired,false);
  if(result.mfaRequired)throw new Error("Unexpected MFA challenge");
  assert.ok(result.accessToken);
 }finally{await db.dropDatabase();await client.close();}
});
