import type {Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({key:z.string().min(2).max(80).regex(/^[a-z][a-z0-9._-]*$/),name:z.string().min(2).max(100),description:z.string().max(500).optional(),permissionKeys:z.array(z.string()).max(500),isSystem:z.boolean().default(false)});
export async function createRole(db:Db,tenantId:string,actorId:string,input:unknown){
 const d=schema.parse(input),now=new Date(),doc={tenantId,roleId:newId("rol"),...d,...(d.description?{description:d.description}:{}),status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await coreCollections(db).roles.insertOne(doc);return doc;
}
export async function permissionsForMembership(db:Db,tenantId:string,membershipId:string):Promise<string[]>{
 const c=coreCollections(db),m=await c.memberships.findOne({tenantId,membershipId,status:"active"});
 if(!m)throw new Error("ACTIVE_MEMBERSHIP_REQUIRED");
 const roles=await c.roles.find({tenantId,roleId:{$in:m.roleIds},status:"active"}).toArray();
 return [...new Set(roles.flatMap(r=>r.permissionKeys))];
}
