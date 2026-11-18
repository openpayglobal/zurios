import type {Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const inputSchema=z.object({slug:z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),legalName:z.string().min(2).max(200),displayName:z.string().min(2).max(100),defaultLocale:z.string().default("en"),defaultCurrency:z.string().length(3).default("UGX"),timezone:z.string().default("Africa/Kampala")});
export async function provisionTenant(db:Db,actorId:string,input:unknown){
 const data=inputSchema.parse(input),c=coreCollections(db),now=new Date(),tenantId=newId("ten");
 const doc={tenantId,...data,status:"provisioning" as const,metadata:{},createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.tenants.insertOne(doc);
 return doc;
}
export async function setTenantStatus(db:Db,tenantId:string,status:"active"|"suspended"|"closed",actorId:string){
 const r=await coreCollections(db).tenants.updateOne({tenantId},{$set:{status,updatedAt:new Date(),updatedBy:actorId}});
 if(!r.matchedCount)throw new Error("TENANT_NOT_FOUND");
}
