import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
import {newId} from "./ids.js";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function createSession(db:Db,tenantId:string,userId:string,membershipId:string,ttlSeconds:number){
 const c=coreCollections(db),membership=await c.memberships.findOne({tenantId,membershipId,userId,status:"active"});
 if(!membership)throw new Error("ACTIVE_MEMBERSHIP_REQUIRED");
 const raw=randomBytes(48).toString("base64url"),now=new Date(),sessionId=newId("ses"),tokenFamilyId=randomUUID();
 await c.sessions.insertOne({tenantId,sessionId,userId,membershipId,refreshTokenHash:digest(raw),tokenFamilyId,expiresAt:new Date(now.getTime()+ttlSeconds*1000),lastUsedAt:now,createdAt:now,updatedAt:now,createdBy:userId,updatedBy:userId});
 return {sessionId,refreshToken:raw,expiresAt:new Date(now.getTime()+ttlSeconds*1000)};
}
export async function rotateRefreshToken(db:Db,tenantId:string,sessionId:string,presentedToken:string){
 const c=coreCollections(db),session=await c.sessions.findOne({tenantId,sessionId});
 if(!session||session.revokedAt||session.expiresAt<=new Date())throw new Error("SESSION_INVALID");
 if(session.refreshTokenHash!==digest(presentedToken)){
  await c.sessions.updateMany({tenantId,tokenFamilyId:session.tokenFamilyId,revokedAt:{$exists:false}},{$set:{revokedAt:new Date(),updatedAt:new Date(),updatedBy:"security:refresh-replay"}});
  throw new Error("REFRESH_TOKEN_REUSE_DETECTED");
 }
 const next=randomBytes(48).toString("base64url"),now=new Date();
 const result=await c.sessions.updateOne({tenantId,sessionId,refreshTokenHash:digest(presentedToken),revokedAt:{$exists:false}},{$set:{refreshTokenHash:digest(next),lastUsedAt:now,updatedAt:now}});
 if(!result.modifiedCount)throw new Error("REFRESH_TOKEN_REPLAY");
 return {refreshToken:next};
}
export async function revokeSession(db:Db,tenantId:string,sessionId:string){
 await coreCollections(db).sessions.updateOne({tenantId,sessionId,revokedAt:{$exists:false}},{$set:{revokedAt:new Date(),updatedAt:new Date()}});
}
