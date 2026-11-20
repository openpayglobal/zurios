import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";\nimport type {TenantDocument} from "./types.js";
const inputSchema=z.object({slug:z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),legalName:z.string().min(2).max(200),displayName:z.string().min(2).max(100),defaultLocale:z.string().default("en"),defaultCurrency:z.string().length(3).transform(v=>v.toUpperCase()).default("UGX"),timezone:z.string().default("Africa/Kampala")});
export async function provisionTenant(db:Db,actorId:string,input:unknown,session?:ClientSession){
 const data=inputSchema.parse(input),c=coreCollections(db),now=new Date(),tenantId=newId("ten");
 const doc={tenantId,...data,status:"provisioning" as const,metadata:{},createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId} as TenantDocument;
 await c.tenants.insertOne(doc,session?{session}:{});return doc;
}
export async function setTenantStatus(db:Db,tenantId:string,status:"active"|"suspended"|"closed",actorId:string,session?:ClientSession){
 const c=coreCollections(db),now=new Date(),r=await c.tenants.updateOne({tenantId},{$set:{status,updatedAt:now,updatedBy:actorId}},session?{session}:{});
 if(!r.matchedCount)throw new Error("TENANT_NOT_FOUND");
 if(status!=="active")await c.sessions.updateMany({tenantId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actorId}},session?{session}:{});
}
