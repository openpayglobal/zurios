import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({organizationId:z.string().min(1),code:z.string().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),name:z.string().min(2).max(150),type:z.enum(["site","store","warehouse","office","other"]),parentLocationId:z.string().optional(),timezone:z.string().default("Africa/Kampala"),address:z.record(z.string()).optional()});
export async function createLocation(db:Db,tenantId:string,actorId:string,input:unknown,session?:ClientSession){
 const d=schema.parse(input),{parentLocationId,address,...rest}=d,c=coreCollections(db);
 if(!await c.organizations.findOne({tenantId,organizationId:d.organizationId,status:"active"},session?{session}:{}))throw new Error("ORGANIZATION_NOT_FOUND");
 if(parentLocationId&&!await c.locations.findOne({tenantId,locationId:parentLocationId,organizationId:d.organizationId,status:"active"},session?{session}:{}))throw new Error("PARENT_LOCATION_NOT_FOUND");
 const now=new Date(),doc={tenantId,locationId:newId("loc"),...rest,...(parentLocationId?{parentLocationId}:{}),...(address?{address}:{}),status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.locations.insertOne(doc,session?{session}:{});return doc;
}
