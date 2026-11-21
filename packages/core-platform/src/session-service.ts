import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
import {newId} from "./ids.js";
import type {SessionDocument} from "./types.js";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const MAX_SESSION_TTL_SECONDS=60*60*24*90;
export async function createSession(db:Db,tenantId:string,userId:string,membershipId:string,ttlSeconds:number){
 if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>MAX_SESSION_TTL_SECONDS)throw new Error("INVALID_SESSION_TTL");
 const c=coreCollections(db);
 const [tenant,user,membership]=await Promise.all([c.tenants.findOne({tenantId,status:"active"}),c.users.findOne({userId,status:"active"}),c.memberships.findOne({tenantId,membershipId,userId,status:"active"})]);
 if(!tenant)throw new Error("TENANT_NOT_ACTIVE");
 if(!user)throw new Error("ACTIVE_USER_REQUIRED");
 if(!membership)throw new Error("ACTIVE_MEMBERSHIP_REQUIRED");
 const raw=randomBytes(48).toString("base64url"),now=new Date(),sessionId=newId("ses"),tokenFamilyId=randomUUID(),expiresAt=new Date(now.getTime()+ttlSeconds*1000);
 const doc:SessionDocument={tenantId,sessionId,userId,membershipId,refreshTokenHash:digest(raw),refreshTokenHistory:[],tokenFamilyId,expiresAt,lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId};
 await c.sessions.insertOne(doc);
 return {sessionId,refreshToken:raw,expiresAt};
}
/** Atomic compare-and-swap rotation. Random invalid tokens cannot revoke a session. Proven reuse revokes the token family. */
export async function rotateRefreshToken(db:Db,tenantId:string,sessionId:string,presentedToken:string){
 const c=coreCollections(db),now=new Date(),presentedHash=digest(presentedToken),session=await c.sessions.findOne({tenantId,sessionId});
 if(!session||session.revokedAt||session.expiresAt<=now)throw new Error("SESSION_INVALID");
 const [tenant,user,membership]=await Promise.all([c.tenants.findOne({tenantId,status:"active"}),c.users.findOne({userId:session.userId,status:"active"}),c.memberships.findOne({tenantId,membershipId:session.membershipId,userId:session.userId,status:"active"})]);
 if(!tenant||!user||!membership)throw new Error("SESSION_PRINCIPAL_INACTIVE");
 if(session.refreshTokenHash!==presentedHash){
  if(session.refreshTokenHistory?.includes(presentedHash)){
   await c.sessions.updateMany({tenantId,tokenFamilyId:session.tokenFamilyId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:"security:refresh-replay"}});
   throw new Error("REFRESH_TOKEN_REUSE_DETECTED");
  }
  throw new Error("SESSION_INVALID");
 }
 const next=randomBytes(48).toString("base64url"),nextHash=digest(next);
 const result=await c.sessions.updateOne({tenantId,sessionId,refreshTokenHash:presentedHash,revokedAt:{$exists:false},expiresAt:{$gt:now}},{$set:{refreshTokenHash:nextHash,lastUsedAt:now,updatedAt:now},$addToSet:{refreshTokenHistory:presentedHash}});
 if(!result.modifiedCount){
  const latest=await c.sessions.findOne({tenantId,sessionId});
  if(latest?.refreshTokenHistory?.includes(presentedHash)){
   await c.sessions.updateMany({tenantId,tokenFamilyId:session.tokenFamilyId,revokedAt:{$exists:false}},{$set:{revokedAt:new Date(),updatedAt:new Date(),updatedBy:"security:refresh-race"}});
   throw new Error("REFRESH_TOKEN_REUSE_DETECTED");
  }
  throw new Error("SESSION_INVALID");
 }
 return {refreshToken:next};
}
export async function revokeSession(db:Db,tenantId:string,sessionId:string,actorId="system:session-revocation"){
 const now=new Date();
 await coreCollections(db).sessions.updateOne({tenantId,sessionId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actorId}});
}
