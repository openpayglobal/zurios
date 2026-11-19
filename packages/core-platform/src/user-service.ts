import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({email:z.string().email().max(254),displayName:z.string().min(2).max(120),phoneE164:z.string().regex(/^\+[1-9]\d{7,14}$/).optional()});
export async function createUser(db:Db,actorId:string,input:unknown,session?:ClientSession){
 const d=schema.parse(input),now=new Date(),userId=newId("usr");
 const doc={userId,emailNormalized:d.email.trim().toLowerCase(),displayName:d.displayName,...(d.phoneE164?{phoneE164:d.phoneE164}:{}),status:"invited" as const,mfaEnabled:false,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await coreCollections(db).users.insertOne(doc,session?{session}:{});return doc;
}
export async function setUserStatus(db:Db,userId:string,status:"active"|"suspended"|"locked",actorId:string){
 const c=coreCollections(db),now=new Date();
 const result=await c.users.updateOne({userId},{$set:{status,updatedAt:now,updatedBy:actorId}},session?{session}:{});
 if(!result.matchedCount)throw new Error("USER_NOT_FOUND");
 if(status!=="active")await c.sessions.updateMany({userId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actorId}},session?{session}:{});
}
