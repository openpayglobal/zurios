import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
export type BreakGlassGrantDocument={
 grantId:string;tenantId:string;userId:string;permissionKeys:string[];organizationIds:string[];locationIds:string[];
 reason:string;requestedBy:string;approvedBy:string;status:"active"|"revoked"|"expired";
 startsAt:Date;expiresAt:Date;createdAt:Date;updatedAt:Date;revokedAt?:Date;revokedBy?:string;
};
export const BREAK_GLASS_ALLOWED_PERMISSIONS=["platform.audit.read","platform.users.read","platform.sessions.read","platform.sessions.revoke","platform.memberships.read","platform.memberships.manage","platform.organizations.read","platform.locations.read","platform.configuration.read"] as const;
const schema=z.object({
 tenantId:z.string().min(1),userId:z.string().min(1),permissionKeys:z.array(z.string().min(1).refine(v=>v!=="*"&&!v.includes("*"))).min(1).max(20),
 organizationIds:z.array(z.string().min(1)).default([]),locationIds:z.array(z.string().min(1)).default([]),
 reason:z.string().min(20).max(2000),requestedBy:z.string().min(1),approvedBy:z.string().min(1),
 durationMinutes:z.number().int().min(1).max(60)
}).refine(d=>d.organizationIds.length>0||d.locationIds.length>0,{message:"Break-glass scope must include at least one organization or location"}).refine(d=>d.permissionKeys.every(permission=>BREAK_GLASS_ALLOWED_PERMISSIONS.includes(permission as typeof BREAK_GLASS_ALLOWED_PERMISSIONS[number])),{message:"Break-glass permission is not in the emergency allowlist"});
export async function createBreakGlassGrant(db:Db,session:ClientSession,input:unknown){
 const d=schema.parse(input);if(d.requestedBy===d.approvedBy)throw new Error("BREAK_GLASS_SELF_APPROVAL_PROHIBITED");
 const now=new Date(),doc:BreakGlassGrantDocument={grantId:newId("bg"),tenantId:d.tenantId,userId:d.userId,permissionKeys:d.permissionKeys,organizationIds:d.organizationIds,locationIds:d.locationIds,reason:d.reason,requestedBy:d.requestedBy,approvedBy:d.approvedBy,status:"active",startsAt:now,expiresAt:new Date(now.getTime()+d.durationMinutes*60_000),createdAt:now,updatedAt:now};
 await db.collection<BreakGlassGrantDocument>("break_glass_grants").insertOne(doc,{session});return doc;
}
export async function revokeBreakGlassGrant(db:Db,session:ClientSession,tenantId:string,grantId:string,actorId:string){
 const now=new Date(),result=await db.collection<BreakGlassGrantDocument>("break_glass_grants").updateOne(
  {tenantId,grantId,status:"active",expiresAt:{$gt:now}},
  {$set:{status:"revoked",revokedAt:now,revokedBy:actorId,updatedAt:now}},{session}
 );
 if(!result.modifiedCount)throw new Error("BREAK_GLASS_GRANT_NOT_ACTIVE");
 return db.collection<BreakGlassGrantDocument>("break_glass_grants").findOne({tenantId,grantId},{session});
}
