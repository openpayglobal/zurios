import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
export type PlatformOperatorGrantDocument={
 grantId:string;userId:string;permissionKeys:string[];status:"active"|"revoked";
 reason:string;createdBy:string;createdAt:Date;updatedAt:Date;validFrom:Date;validUntil?:Date;
};
const schema=z.object({userId:z.string().min(1),permissionKeys:z.array(z.string().min(1).refine(v=>v!=="*"&&!v.includes("*"))).min(1).max(100),reason:z.string().min(20).max(2000),validForDays:z.number().int().min(1).max(90).optional()});
/** Platform operator grants are bootstrap-controlled and never self-service through tenant APIs. */
export async function grantPlatformOperator(db:Db,session:ClientSession,input:unknown,actorId:string){
 const d=schema.parse(input),now=new Date(),doc:PlatformOperatorGrantDocument={grantId:newId("pog"),userId:d.userId,permissionKeys:d.permissionKeys,status:"active",reason:d.reason,createdBy:actorId,createdAt:now,updatedAt:now,validFrom:now,...(d.validForDays?{validUntil:new Date(now.getTime()+d.validForDays*86_400_000)}:{})};
 await db.collection<PlatformOperatorGrantDocument>("platform_operator_grants").insertOne(doc,{session});return doc;
}
export async function revokePlatformOperator(db:Db,session:ClientSession,grantId:string,actorId:string){
 const now=new Date(),result=await db.collection<PlatformOperatorGrantDocument>("platform_operator_grants").updateOne({grantId,status:"active"},{$set:{status:"revoked",updatedAt:now,updatedBy:actorId}},{session});
 if(!result.modifiedCount)throw new Error("PLATFORM_OPERATOR_GRANT_NOT_ACTIVE");
}
export async function platformPermissionsForUser(db:Db,userId:string,now=new Date()):Promise<string[]>{
 const grants=await db.collection<PlatformOperatorGrantDocument>("platform_operator_grants").find({userId,status:"active",validFrom:{$lte:now},$or:[{validUntil:{$exists:false}},{validUntil:{$gt:now}}]}).toArray();
 return [...new Set(grants.flatMap(grant=>grant.permissionKeys))];
}
