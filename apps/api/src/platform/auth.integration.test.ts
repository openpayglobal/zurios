import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import Fastify from "fastify";
import {provisionTenant,setTenantStatus,createUser,createMembership,runCoreMigrations} from "@zuri/core-platform";
import {issueInvitation,acceptInvitation,login,beginMfaEnrollment,confirmMfaEnrollment,verifyMfaLogin,disableMfa,refreshLogin,issuePasswordReset,resetPassword,logout,issueEmailVerification,issueMembershipInvitation} from "./auth-service.js";
import {totpCode} from "./auth-crypto.js";
import {authRoutes} from "./auth-routes.js";
const uri=process.env.MONGODB_TEST_URI;
test("invitation acceptance and password login use active tenant membership", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_auth_"+randomUUID().replaceAll("-",""));
 try{
  await runCoreMigrations(db);
  await db.collection("auth_rate_limits").createIndex({key:1},{unique:true});
  await db.collection("auth_challenges").createIndex({challengeId:1},{unique:true});
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
  const refreshed=await refreshLogin(db,cfg,tenant.tenantId,result.sessionId,result.refreshToken);
  assert.ok(refreshed.accessToken);assert.ok(refreshed.refreshToken);

  const enrollment=await beginMfaEnrollment(db,user.userId,cfg);
  const recovery=await confirmMfaEnrollment(db,user.userId,totpCode(enrollment.secret),cfg);
  assert.equal(recovery.recoveryCodes.length,10);
  const mfaAttempt=await login(db,cfg,{email:"auth@example.test",password,tenantSlug:tenant.slug,ipHash:"integration"});
  if(!mfaAttempt.mfaRequired)throw new Error("Expected MFA challenge");
  const second=await verifyMfaLogin(db,cfg,mfaAttempt.challengeToken,recovery.recoveryCodes[0]!);
  assert.ok(second.accessToken);
  await assert.rejects(()=>verifyMfaLogin(db,cfg,mfaAttempt.challengeToken,recovery.recoveryCodes[0]!));

  const totpAttempt=await login(db,cfg,{email:"auth@example.test",password,tenantSlug:tenant.slug,ipHash:"integration"});
  if(!totpAttempt.mfaRequired)throw new Error("Expected MFA challenge");
  const futureStep=Math.floor(Date.now()/30_000)+1;
  const third=await verifyMfaLogin(db,cfg,totpAttempt.challengeToken,totpCode(enrollment.secret,futureStep));
  assert.ok(third.accessToken);
  await disableMfa(db,user.userId,password,recovery.recoveryCodes[1]!,cfg);

  const reset=await issuePasswordReset(db,"auth@example.test");
  assert.ok(reset);
  const newPassword=randomBytes(24).toString("base64url");
  await resetPassword(db,user.userId,reset!.token,newPassword);
  const oldSession=await db.collection("sessions").findOne({tenantId:tenant.tenantId,sessionId:third.sessionId});
  assert.ok(oldSession?.revokedAt);
  const afterReset=await login(db,cfg,{email:"auth@example.test",password:newPassword,tenantSlug:tenant.slug,ipHash:"integration"});
  assert.equal(afterReset.mfaRequired,false);
  if(afterReset.mfaRequired)throw new Error("MFA should be disabled");
  await logout(db,tenant.tenantId,afterReset.sessionId,user.userId);
  const loggedOut=await db.collection("sessions").findOne({tenantId:tenant.tenantId,sessionId:afterReset.sessionId});
  assert.ok(loggedOut?.revokedAt);

  const app=Fastify();
  await app.register(authRoutes(db,cfg));
  const routeLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email:"auth@example.test",password:newPassword,tenantSlug:tenant.slug}});
  assert.equal(routeLogin.statusCode,200);
  const routeBody=routeLogin.json() as {accessToken:string;sessionId:string};
  const me=await app.inject({method:"GET",url:"/auth/me",headers:{authorization:"Bearer "+routeBody.accessToken}});
  assert.equal(me.statusCode,200);
  assert.equal(me.json().principal.userId,user.userId);
  const routeLogout=await app.inject({method:"POST",url:"/auth/logout",headers:{authorization:"Bearer "+routeBody.accessToken}});
  assert.equal(routeLogout.statusCode,204);
  const meAfterLogout=await app.inject({method:"GET",url:"/auth/me",headers:{authorization:"Bearer "+routeBody.accessToken}});
  assert.equal(meAfterLogout.statusCode,401);
  await app.close();
 }finally{await db.dropDatabase();await client.close();}
});


test("auth HTTP routes validate and complete the complete identity lifecycle", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_auth_routes_"+randomUUID().replaceAll("-",""));
 const app=Fastify();
 const cfg={issuer:"https://identity.routes.example.test",audience:"zuri-api-routes-test",jwtSecret:randomBytes(32).toString("base64url"),accessTokenTtlSeconds:900,sessionTtlSeconds:3600,mfaEncryptionKey:randomBytes(32).toString("base64")};
 try{
  await runCoreMigrations(db);
  await db.collection("auth_rate_limits").createIndex({key:1},{unique:true});
  await db.collection("auth_challenges").createIndex({challengeId:1},{unique:true});
  const suffix=randomUUID().replaceAll("-","");
  const tenant=await provisionTenant(db,"route-test",{slug:"auth-route-"+suffix,legalName:"Auth Route Ltd",displayName:"Auth Route"});
  await setTenantStatus(db,tenant.tenantId,"active","route-test");
  const email="route-"+suffix+"@example.test";
  const user=await createUser(db,"route-test",{email,displayName:"Route Test User"});
  const password="Route-Test-Password-123!";
  const userInvitation=await issueInvitation(db,user.userId);
  await acceptInvitation(db,user.userId,userInvitation,password);
  await createMembership(db,tenant.tenantId,"route-test",{userId:user.userId});

  const invitedUser=await createUser(db,"route-test",{email:"invite-"+suffix+"@example.test",displayName:"Invited User"});
  const emailToken=await issueEmailVerification(db,invitedUser.userId);
  const inviteEmail=await app.register(authRoutes(db,cfg)).then(()=>app.inject({method:"POST",url:"/auth/email/verify",payload:{userId:invitedUser.userId,token:emailToken}}));
  assert.equal(inviteEmail.statusCode,204);
  const inviteToken=await issueInvitation(db,invitedUser.userId);
  const acceptInvite=await app.inject({method:"POST",url:"/auth/invitations/"+invitedUser.userId+"/accept",payload:{token:inviteToken,password:"Invited-User-Password-123!"}});
  assert.equal(acceptInvite.statusCode,204);
  const replayInvite=await app.inject({method:"POST",url:"/auth/invitations/"+invitedUser.userId+"/accept",payload:{token:inviteToken,password:"Invited-User-Password-123!"}});
  assert.equal(replayInvite.statusCode,401);
  const replayEmail=await app.inject({method:"POST",url:"/auth/email/verify",payload:{userId:invitedUser.userId,token:emailToken}});
  assert.equal(replayEmail.statusCode,401);

  const secondTenant=await provisionTenant(db,"route-test",{slug:"auth-route-secondary-"+suffix,legalName:"Secondary Ltd",displayName:"Secondary"});
  await setTenantStatus(db,secondTenant.tenantId,"active","route-test");
  const invitedMembership=await createMembership(db,secondTenant.tenantId,"route-test",{userId:user.userId});
  await db.collection("memberships").updateOne({membershipId:invitedMembership.membershipId},{$set:{status:"invited"}});
  const membershipToken=await issueMembershipInvitation(db,invitedMembership.membershipId);
  const acceptMembership=await app.inject({method:"POST",url:"/auth/memberships/"+invitedMembership.membershipId+"/accept",payload:{token:membershipToken}});
  assert.equal(acceptMembership.statusCode,204);
  const replayMembership=await app.inject({method:"POST",url:"/auth/memberships/"+invitedMembership.membershipId+"/accept",payload:{token:membershipToken}});
  assert.equal(replayMembership.statusCode,401);

  const invalidBody=await app.inject({method:"POST",url:"/auth/login",payload:{email:"not-an-email",password:"",tenantSlug:"x"}});
  assert.equal(invalidBody.statusCode,400);
  const invalidLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email,password:"incorrect",tenantSlug:tenant.slug}});
  assert.equal(invalidLogin.statusCode,401);
  const login=await app.inject({method:"POST",url:"/auth/login",payload:{email,password,tenantSlug:tenant.slug}});
  assert.equal(login.statusCode,200);
  assert.equal(login.headers["cache-control"],"no-store");
  const loginBody=login.json() as {accessToken:string;refreshToken:string;sessionId:string};
  assert.ok(loginBody.accessToken);

  const me=await app.inject({method:"GET",url:"/auth/me",headers:{authorization:"Bearer "+loginBody.accessToken}});
  assert.equal(me.statusCode,200);
  assert.equal(me.json().principal.userId,user.userId);
  const unauthenticatedMe=await app.inject({method:"GET",url:"/auth/me"});
  assert.equal(unauthenticatedMe.statusCode,401);

  const refreshed=await app.inject({method:"POST",url:"/auth/refresh",payload:{sessionId:loginBody.sessionId,refreshToken:loginBody.refreshToken}});
  assert.equal(refreshed.statusCode,200);
  const refreshedBody=refreshed.json() as {accessToken:string;refreshToken:string;sessionId:string};
  const refreshReplay=await app.inject({method:"POST",url:"/auth/refresh",payload:{sessionId:loginBody.sessionId,refreshToken:loginBody.refreshToken}});
  assert.equal(refreshReplay.statusCode,401);

  const enrollment=await app.inject({method:"POST",url:"/auth/mfa/enroll",headers:{authorization:"Bearer "+refreshedBody.accessToken}});
  assert.equal(enrollment.statusCode,200);
  const enrollmentBody=enrollment.json() as {secret:string;otpauthUrl:string};
  assert.match(enrollmentBody.otpauthUrl,/^otpauth:\/\/totp\//);
  const confirm=await app.inject({method:"POST",url:"/auth/mfa/confirm",headers:{authorization:"Bearer "+refreshedBody.accessToken},payload:{code:totpCode(enrollmentBody.secret)}});
  assert.equal(confirm.statusCode,200);
  const recoveryCodes=(confirm.json() as {recoveryCodes:string[]}).recoveryCodes;
  assert.equal(recoveryCodes.length,10);

  const mfaLogin=await app.inject({method:"POST",url:"/auth/login",payload:{email,password,tenantSlug:tenant.slug}});
  assert.equal(mfaLogin.statusCode,200);
  const challenge=(mfaLogin.json() as {mfaRequired:boolean;challengeToken:string});
  assert.equal(challenge.mfaRequired,true);
  const futureStep=Math.floor(Date.now()/30_000)+1;
  const mfaVerify=await app.inject({method:"POST",url:"/auth/mfa/verify",payload:{challengeToken:challenge.challengeToken,code:totpCode(enrollmentBody.secret,futureStep)}});
  assert.equal(mfaVerify.statusCode,200);
  const mfaSession=mfaVerify.json() as {accessToken:string;sessionId:string};
  const disable=await app.inject({method:"POST",url:"/auth/mfa/disable",headers:{authorization:"Bearer "+mfaSession.accessToken},payload:{password,code:recoveryCodes[0]}});
  assert.equal(disable.statusCode,204);
  const mfaSessionAfterDisable=await app.inject({method:"GET",url:"/auth/me",headers:{authorization:"Bearer "+mfaSession.accessToken}});
  assert.equal(mfaSessionAfterDisable.statusCode,401);

  const reset=await issuePasswordReset(db,email);
  assert.ok(reset);
  const newPassword="Route-Test-New-Password-456!";
  const resetResponse=await app.inject({method:"POST",url:"/auth/password/reset",payload:{userId:user.userId,token:reset!.token,newPassword}});
  assert.equal(resetResponse.statusCode,204);
  const resetReplay=await app.inject({method:"POST",url:"/auth/password/reset",payload:{userId:user.userId,token:reset!.token,newPassword}});
  assert.equal(resetReplay.statusCode,401);
  const loginAfterReset=await app.inject({method:"POST",url:"/auth/login",payload:{email,password:newPassword,tenantSlug:tenant.slug}});
  assert.equal(loginAfterReset.statusCode,200);
  const finalToken=(loginAfterReset.json() as {accessToken:string}).accessToken;
  const logoutResponse=await app.inject({method:"POST",url:"/auth/logout",headers:{authorization:"Bearer "+finalToken}});
  assert.equal(logoutResponse.statusCode,204);
  const meAfterLogout=await app.inject({method:"GET",url:"/auth/me",headers:{authorization:"Bearer "+finalToken}});
  assert.equal(meAfterLogout.statusCode,401);

  const noMfaApp=Fastify();
  await noMfaApp.register(authRoutes(db,{...cfg,mfaEncryptionKey:""}));
  const noMfaLogin=await noMfaApp.inject({method:"POST",url:"/auth/login",payload:{email,password:newPassword,tenantSlug:tenant.slug}});
  assert.equal(noMfaLogin.statusCode,200);
  const noMfaToken=(noMfaLogin.json() as {accessToken:string}).accessToken;
  const noMfaEnroll=await noMfaApp.inject({method:"POST",url:"/auth/mfa/enroll",headers:{authorization:"Bearer "+noMfaToken}});
  assert.equal(noMfaEnroll.statusCode,503);
  const noMfaVerify=await noMfaApp.inject({method:"POST",url:"/auth/mfa/verify",payload:{challengeToken:"invalid-challenge-token-long-enough",code:"123456"}});
  assert.equal(noMfaVerify.statusCode,503);
  await noMfaApp.close();
 }finally{
  await app.close();
  await db.dropDatabase();
  await client.close();
 }
});
