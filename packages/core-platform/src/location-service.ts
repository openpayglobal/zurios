import type {Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({organizationId:z.string(),code:z.string().min(1).max(40),name:z.string().min(2).max(150),type:z.enum(["site","store","warehouse","office","other"]),parentLocationId:z.string().optional(),timezone:z.string().default("Africa/Kampala"),address:z.record(z.string()).optional()});
export async function createLocation(db:Db,tenantId:string,actorId:string,input:unknown){
 const d=schema.parse(input),c=coreCollections(db);
 if(!await c.organizations.findOne({tenantId,organizationId:d.organizationId,status:"active"}))throw new Error("ORGANIZATION_NOT_FOUND");
 if(d.parentLocationId&&!await c.locations.findOne({tenantId,locationId:d.parentLocationId,organizationId:d.organizationId}))throw new Error("PARENT_LOCATION_NOT_FOUND");
 const now=new Date(),doc={tenantId,locationId:newId("loc"),...d,...(d.parentLocationId?{parentLocationId:d.parentLocationId}:{}),...(d.address?{address:d.address}:{}),status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.locations.insertOne(doc);return doc;
}
