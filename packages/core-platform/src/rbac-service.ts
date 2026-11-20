import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";\nimport type {RoleDocument} from "./types.js";
const schema=z.object({key:z.string().min(2).max(80).regex(/^[a-z][a-z0-9._-]*$/),name:z.string().min(2).max(100),description:z.string().max(500).optional(),permissionKeys:z.array(z.string().min(1).refine(v=>v!=="*",{message:"Wildcard permissions are prohibited"})).max(500).refine(v=>new Set(v).size===v.length,{message:"Duplicate permissions are not allowed"}),isSystem:z.boolean().default(false)});
export async function createRole(db:Db,tenantId:string,actorId:string,input:unknown,session?:ClientSession){
 const d=schema.parse(input),{description,...rest}=d,now=new Date(),doc={tenantId,roleId:newId("rol"),...rest,...(description?{description}:{}),status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId} as RoleDocument;
 await coreCollections(db).roles.insertOne(doc,session?{session}:{});return doc;
}
export async function permissionsForMembership(db:Db,tenantId:string,membershipId:string):Promise<string[]>{
 const c=coreCollections(db),m=await c.memberships.findOne({tenantId,membershipId,status:"active"});
 if(!m||m.validFrom&&m.validFrom>new Date()||m.validUntil&&m.validUntil<=new Date())throw new Error("ACTIVE_MEMBERSHIP_REQUIRED");
 if(!await c.tenants.findOne({tenantId,status:"active"})||!await c.users.findOne({userId:m.userId,status:"active"}))throw new Error("ACTIVE_PRINCIPAL_REQUIRED");
 const roles=await c.roles.find({tenantId,roleId:{$in:m.roleIds},status:"active"}).toArray();
 return [...new Set(roles.flatMap(r=>r.permissionKeys))];
}
