import type {Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({key:z.string().min(2).max(100),effect:z.enum(["allow","deny"]),priority:z.number().int().min(0).max(10000),subject:z.record(z.unknown()).default({}),resource:z.record(z.unknown()).default({}),actions:z.array(z.string().min(1)).min(1),conditions:z.record(z.unknown()).default({})});
export async function upsertPolicy(db:Db,tenantId:string,actorId:string,input:unknown){
 const d=schema.parse(input),now=new Date(),policyId=newId("pol");
 await coreCollections(db).policies.updateOne({tenantId,key:d.key},{$set:{...d,status:"active",updatedAt:now,updatedBy:actorId},$setOnInsert:{tenantId,policyId,createdAt:now,createdBy:actorId}},{upsert:true});
 return coreCollections(db).policies.findOne({tenantId,key:d.key});
}
export async function deactivatePolicy(db:Db,tenantId:string,key:string,actorId:string){
 const r=await coreCollections(db).policies.updateOne({tenantId,key},{$set:{status:"inactive",updatedAt:new Date(),updatedBy:actorId}});
 if(!r.matchedCount)throw new Error("POLICY_NOT_FOUND");
}
