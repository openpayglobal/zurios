import type {Db} from "mongodb";
import {z} from "zod";
import {coreCollections} from "./repositories.js";
const schema=z.object({key:z.string().min(2).max(100),enabled:z.boolean(),description:z.string().max(500).optional(),environments:z.array(z.string()).default(["development"]),rules:z.array(z.record(z.unknown())).default([])});
export async function setFeatureFlag(db:Db,tenantId:string,actorId:string,input:unknown){
 const d=schema.parse(input),now=new Date();
 await coreCollections(db).featureFlags.updateOne({tenantId,key:d.key},{$set:{...d,updatedAt:now,updatedBy:actorId},$setOnInsert:{tenantId,createdAt:now,createdBy:actorId}},{upsert:true});
 return coreCollections(db).featureFlags.findOne({tenantId,key:d.key});
}
