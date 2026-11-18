import {randomBytes,randomUUID,createHash} from "node:crypto";
import type {Db} from "mongodb";
import {SignJWT,jwtVerify} from "jose";
import {coreCollections} from "@zuri/core-platform";
import {createSession,rotateRefreshToken,revokeSession} from "@zuri/core-platform";
import {permissionsForMembership} from "@zuri/core-platform";
import {appendAuditEvent} from "@zuri/core-platform";
import {decryptMfaSecret,encryptMfaSecret,generateRecoveryCodes,generateTotpSecret,hashOpaqueToken,hashPassword,hashRecoveryCode,verifyPassword,verifyTotpCode} from "./auth-crypto.js";
export type AuthConfig={issuer:string;audience:string;jwtSecret:string;accessTokenTtlSeconds:number;sessionTtlSeconds:number;mfaEncryptionKey:string};
const key=(config:AuthConfig)=>new TextEncoder().encode(config.jwtSecret);
const normalizeEmail=(email:string)=>email.trim().toLowerCase();
async function issueAccessToken(config:AuthConfig,claims:{userId:string;tenantId:string;membershipId:string;sessionId:string;permissions:string[]}){
 return new SignJWT({tenantId:claims.tenantId,membershipId:claims.membershipId,sessionId:claims.sessionId,permissions:claims.permissions})
  .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience).setSubject(claims.userId).setIssuedAt().setExpirationTime(`${config.accessTokenTtlSeconds}s`).sign(key(config));
}
async function issueMfaChallenge(db:Db,config:AuthConfig,claims:{userId:string;tenantId:string;membershipId:string}){
 const challengeId=randomUUID(),now=new Date();
 await db.collection("auth_challenges").insertOne({challengeId,userId:claims.userId,tenantId:claims.tenantId,membershipId:claims.membershipId,createdAt:now,expiresAt:new Date(now.getTime()+5*60_000)});
 return new SignJWT({purpose:"mfa",challengeId,tenantId:claims.tenantId,membershipId:claims.membershipId})
  .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience).setSubject(claims.userId).setIssuedAt().setExpirationTime("5m").sign(key(config));
}
async function completeLogin(db:Db,config:AuthConfig,claims:{userId:string;tenantId:string;membershipId:string}){
 const session=await createSession(db,claims.tenantId,claims.userId,claims.membershipId,config.sessionTtlSeconds);
 const permissions=await permissionsForMembership(db,claims.tenantId,claims.membershipId);
 const accessToken=await issueAccessToken(config,{...claims,sessionId:session.sessionId,permissions});
 await appendAuditEvent(db,{tenantId:claims.tenantId,actor:{userId:claims.userId},action:"auth.login",resourceType:"session",resourceId:session.sessionId,outcome:"success",metadata:{method:"password+mfa-if-enabled"}});
 return {accessToken,refreshToken:session.refreshToken,sessionId:session.sessionId,expiresAt:session.expiresAt,tokenType:"Bearer" as const};
}
async function enforceLoginRateLimit(db:Db,email:string,ipHash:string){
 const bucket=Math.floor(Date.now()/60_000),keyValue=createHash("sha256").update(email+"|"+ipHash+"|"+bucket).digest("hex"),collection=db.collection("auth_rate_limits");
 await collection.updateOne({key:keyValue},{$inc:{count:1},$setOnInsert:{expiresAt:new Date((bucket+2)*60_000)}},{upsert:true});
 const row=await collection.findOne({key:keyValue});
 if((row?.count??0)>10)throw new Error("AUTH_RATE_LIMITED");
}
export async function login(db:Db,config:AuthConfig,input:{email:string;password:string;tenantSlug:string;ipHash?:string}){
 const email=normalizeEmail(input.email);await enforceLoginRateLimit(db,email,input.ipHash??"unknown");
 const c=coreCollections(db),user=await c.users.findOne({emailNormalized:email}),now=new Date();
 if(user?.lockedUntil&&user.lockedUntil>now)throw new Error("INVALID_CREDENTIALS");
 const valid=user?.passwordHash?await verifyPassword(input.password,user.passwordHash):false;
 if(!user||!valid){
  if(user){await c.users.updateOne({userId:user.userId},{$inc:{failedLoginCount:1},$set:{updatedAt:now}});const latest=await c.users.findOne({userId:user.userId});if((latest?.failedLoginCount??0)>=5)await c.users.updateOne({userId:user.userId},{$set:{lockedUntil:new Date(now.getTime()+15*60_000)}});}
  throw new Error("INVALID_CREDENTIALS");
 }
 if(user.status!=="active"||!user.emailVerifiedAt)throw new Error("INVALID_CREDENTIALS");
 const tenant=await c.tenants.findOne({slug:input.tenantSlug,status:"active"});
 if(!tenant)throw new Error("INVALID_CREDENTIALS");
 const membership=await c.memberships.findOne({tenantId:tenant.tenantId,userId:user.userId,status:"active"});
 if(!membership)throw new Error("INVALID_CREDENTIALS");
 await c.users.updateOne({userId:user.userId},{$set:{failedLoginCount:0,updatedAt:now},$unset:{lockedUntil:""}});
 if(user.mfaEnabled)return {mfaRequired:true as const,challengeToken:await issueMfaChallenge(db,config,{userId:user.userId,tenantId:tenant.tenantId,membershipId:membership.membershipId})};
 return {mfaRequired:false as const,...await completeLogin(db,config,{userId:user.userId,tenantId:tenant.tenantId,membershipId:membership.membershipId})};
}
export async function verifyMfaLogin(db:Db,config:AuthConfig,challengeToken:string,code:string){
 const verified=await jwtVerify(challengeToken,key(config),{issuer:config.issuer,audience:config.audience,algorithms:["HS256"]});
 const claims=verified.payload;
 if(claims.purpose!=="mfa"||typeof claims.sub!=="string"||typeof claims.tenantId!=="string"||typeof claims.membershipId!=="string"||typeof claims.challengeId!=="string")throw new Error("INVALID_MFA_CHALLENGE");
 const c=coreCollections(db),user=await c.users.findOne({userId:claims.sub,status:"active",mfaEnabled:true});
 if(!user?.mfaSecretEncrypted)throw new Error("MFA_NOT_CONFIGURED");
 const secret=decryptMfaSecret(user.mfaSecretEncrypted,config.mfaEncryptionKey),step=verifyTotpCode(secret,code);
 if(step!==null){
  const result=await c.users.updateOne({userId:user.userId,$or:[{mfaLastUsedStep:{$lt:step}},{mfaLastUsedStep:{$exists:false}}]},{$set:{mfaLastUsedStep:step}});
  if(!result.modifiedCount)throw new Error("MFA_CODE_ALREADY_USED");
 }else{
  const recoveryHash=hashRecoveryCode(code),result=await c.users.updateOne({userId:user.userId,mfaRecoveryCodeHashes:recoveryHash},{$pull:{mfaRecoveryCodeHashes:recoveryHash}});
  if(!result.modifiedCount)throw new Error("INVALID_MFA_CODE");
 }
 const membership=await c.memberships.findOne({tenantId:claims.tenantId,membershipId:claims.membershipId,userId:user.userId,status:"active"});
 if(!membership)throw new Error("ACTIVE_MEMBERSHIP_REQUIRED");
 const consumed=await db.collection("auth_challenges").updateOne({challengeId:claims.challengeId,userId:user.userId,usedAt:{$exists:false},expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}});
 if(!consumed.modifiedCount)throw new Error("MFA_CHALLENGE_ALREADY_USED");
 return completeLogin(db,config,{userId:user.userId,tenantId:claims.tenantId,membershipId:claims.membershipId});
}
export async function beginMfaEnrollment(db:Db,userId:string,config:AuthConfig){
 const c=coreCollections(db),user=await c.users.findOne({userId,status:"active"});if(!user)throw new Error("ACTIVE_USER_REQUIRED");
 const secret=generateTotpSecret(),encrypted=encryptMfaSecret(secret,config.mfaEncryptionKey);
 await c.users.updateOne({userId},{$set:{pendingMfaSecretEncrypted:encrypted,updatedAt:new Date()}});
 const label=encodeURIComponent(user.emailNormalized),issuer=encodeURIComponent("Zuri OS");
 return {secret,otpauthUrl:`otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`};
}
export async function disableMfa(db:Db,userId:string,password:string,code:string,config:AuthConfig){
 const c=coreCollections(db),user=await c.users.findOne({userId,status:"active",mfaEnabled:true});
 if(!user?.passwordHash||!user.mfaSecretEncrypted||!await verifyPassword(password,user.passwordHash))throw new Error("MFA_STEP_UP_FAILED");
 const secret=decryptMfaSecret(user.mfaSecretEncrypted,config.mfaEncryptionKey),step=verifyTotpCode(secret,code);
 if(step!==null){
  const used=await c.users.updateOne({userId,$or:[{mfaLastUsedStep:{$lt:step}},{mfaLastUsedStep:{$exists:false}}]},{$set:{mfaLastUsedStep:step}});
  if(!used.modifiedCount)throw new Error("MFA_CODE_ALREADY_USED");
 }else{
  const used=await c.users.updateOne({userId,mfaRecoveryCodeHashes:hashRecoveryCode(code)},{$pull:{mfaRecoveryCodeHashes:hashRecoveryCode(code)}});
  if(!used.modifiedCount)throw new Error("MFA_STEP_UP_FAILED");
 }
 const now=new Date();
 await c.users.updateOne({userId},{$set:{mfaEnabled:false,updatedAt:now},$unset:{mfaSecretEncrypted:"",pendingMfaSecretEncrypted:"",mfaRecoveryCodeHashes:"",mfaLastUsedStep:""}});
 await c.sessions.updateMany({userId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:"security:mfa-disabled"}});
 await appendAuditEvent(db,{tenantId:"platform",actor:{userId},action:"auth.mfa.disabled",resourceType:"user",resourceId:userId,outcome:"success",metadata:{}});
}
export async function confirmMfaEnrollment(db:Db,userId:string,code:string,config:AuthConfig){
 const c=coreCollections(db),user=await c.users.findOne({userId,status:"active"});if(!user?.pendingMfaSecretEncrypted)throw new Error("MFA_ENROLLMENT_NOT_STARTED");
 const secret=decryptMfaSecret(user.pendingMfaSecretEncrypted,config.mfaEncryptionKey),step=verifyTotpCode(secret,code);if(step===null)throw new Error("INVALID_MFA_CODE");
 const recoveryCodes=generateRecoveryCodes(),mfaRecoveryCodeHashes=recoveryCodes.map(hashRecoveryCode);
 await c.users.updateOne({userId},{$set:{mfaEnabled:true,mfaSecretEncrypted:user.pendingMfaSecretEncrypted,mfaRecoveryCodeHashes,mfaLastUsedStep:step,updatedAt:new Date()},$unset:{pendingMfaSecretEncrypted:""}});
 await appendAuditEvent(db,{tenantId:"platform",actor:{userId},action:"auth.mfa.enabled",resourceType:"user",resourceId:userId,outcome:"success",metadata:{}});
 return {recoveryCodes};
}
export async function issueInvitation(db:Db,userId:string,ttlSeconds=7*24*60*60){
 if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<300||ttlSeconds>30*24*60*60)throw new Error("INVALID_INVITATION_TTL");
 const token=randomBytes(32).toString("base64url"),now=new Date();
 const r=await coreCollections(db).users.updateOne({userId,status:"invited"},{$set:{invitationTokenHash:hashOpaqueToken(token),invitationExpiresAt:new Date(now.getTime()+ttlSeconds*1000),updatedAt:now}});
 if(!r.matchedCount)throw new Error("USER_NOT_INVITED");
 return token;
}
export async function acceptInvitation(db:Db,userId:string,token:string,password:string){
 const passwordHash=await hashPassword(password),now=new Date(),c=coreCollections(db);
 const r=await c.users.updateOne({userId,status:"invited",invitationTokenHash:hashOpaqueToken(token),invitationExpiresAt:{$gt:now}},{$set:{passwordHash,emailVerifiedAt:now,status:"active",updatedAt:now},$unset:{invitationTokenHash:"",invitationExpiresAt:""}});
 if(!r.matchedCount)throw new Error("INVITATION_INVALID_OR_EXPIRED");
}
export async function issueEmailVerification(db:Db,userId:string){
 const token=randomBytes(32).toString("base64url"),now=new Date();
 const r=await coreCollections(db).users.updateOne({userId,status:"invited"},{$set:{emailVerificationTokenHash:hashOpaqueToken(token),emailVerificationExpiresAt:new Date(now.getTime()+24*60*60_000),updatedAt:now}});
 if(!r.matchedCount)throw new Error("USER_NOT_INVITED");
 return token;
}
export async function verifyEmail(db:Db,userId:string,token:string){
 const now=new Date(),c=coreCollections(db),user=await c.users.findOne({userId,status:"invited",emailVerificationTokenHash:hashOpaqueToken(token),emailVerificationExpiresAt:{$gt:now}});
 if(!user)throw new Error("EMAIL_VERIFICATION_INVALID_OR_EXPIRED");
 await c.users.updateOne({userId,status:"invited"},{$set:{emailVerifiedAt:now,...(user.passwordHash?{status:"active"}:{})},$unset:{emailVerificationTokenHash:"",emailVerificationExpiresAt:""}});
}
export async function issuePasswordReset(db:Db,email:string){
 const user=await coreCollections(db).users.findOne({emailNormalized:normalizeEmail(email),status:"active"});
 if(!user)return null;
 const token=randomBytes(32).toString("base64url"),now=new Date();
 await coreCollections(db).users.updateOne({userId:user.userId},{$set:{passwordResetTokenHash:hashOpaqueToken(token),passwordResetExpiresAt:new Date(now.getTime()+30*60_000),updatedAt:now}});
 return {userId:user.userId,token};
}
export async function resetPassword(db:Db,userId:string,token:string,newPassword:string){
 const passwordHash=await hashPassword(newPassword),now=new Date(),c=coreCollections(db);
 const r=await c.users.updateOne({userId,status:"active",passwordResetTokenHash:hashOpaqueToken(token),passwordResetExpiresAt:{$gt:now}},{$set:{passwordHash,failedLoginCount:0,updatedAt:now},$unset:{passwordResetTokenHash:"",passwordResetExpiresAt:"",lockedUntil:""}});
 if(!r.matchedCount)throw new Error("PASSWORD_RESET_INVALID_OR_EXPIRED");
 await c.sessions.updateMany({userId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:"security:password-reset"}});
}
export async function refreshLogin(db:Db,config:AuthConfig,tenantId:string,sessionId:string,refreshToken:string){
 const c=coreCollections(db),session=await c.sessions.findOne({tenantId,sessionId});if(!session)throw new Error("SESSION_INVALID");
 const rotated=await rotateRefreshToken(db,tenantId,sessionId,refreshToken),permissions=await permissionsForMembership(db,tenantId,session.membershipId);
 const accessToken=await issueAccessToken(config,{userId:session.userId,tenantId,membershipId:session.membershipId,sessionId,permissions});
 return {accessToken,refreshToken:rotated.refreshToken,sessionId,tokenType:"Bearer" as const};
}
export async function logout(db:Db,tenantId:string,sessionId:string,userId:string){await revokeSession(db,tenantId,sessionId,userId);}
