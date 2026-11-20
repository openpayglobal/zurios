import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";\nimport type {LocationDocument} from "./types.js";
const schema=z.object({organizationId:z.string().min(1),code:z.string().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),name:z.string().min(2).max(150),type:z.enum(["site","store","warehouse","office","other"]),parentLocationId:z.string().optional(),timezone:z.string().default("Africa/Kampala"),address:z.record(z.string()).optional()});
export async function createLocation(db:Db,tenantId:string,actorId:string,input:unknown,session?:ClientSession){
 const d=schema.parse(input),{parentLocationId,address,...rest}=d,c=coreCollections(db);
 if(!await c.organizations.findOne({tenantId,organizationId:d.organizationId,status:"active"},session?{session}:{}))throw new Error("ORGANIZATION_NOT_FOUND");
 if(parentLocationId&&!await c.locations.findOne({tenantId,locationId:parentLocationId,organizationId:d.organizationId,status:"active"},session?{session}:{}))throw new Error("PARENT_LOCATION_NOT_FOUND");
 const now=new Date(),doc={tenantId,locationId:newId("loc"),...rest,...(parentLocationId?{parentLocationId}:{}),...(address?{address}:{}),status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId} as LocationDocument;
 await c.locations.insertOne(doc,session?{session}:{});return doc;
}

export async function setLocationStatus(db:Db,tenantId:string,locationId:string,status:"active"|"inactive",actorId:string,session?:ClientSession){
 const c=coreCollections(db),now=new Date();
 if(status==="inactive"){
  const [children,memberships]=await Promise.all([c.locations.countDocuments({tenantId,parentLocationId:locationId,status:"active"},session?{session}:{}),c.memberships.countDocuments({tenantId,locationIds:locationId,status:"active"},session?{session}:{})]);
  if(children||memberships)throw new Error("LOCATION_HAS_ACTIVE_DEPENDENCIES");
 }
 const result=await c.locations.updateOne({tenantId,locationId,status:{$ne:"inactive"}},{$set:{status,updatedAt:now,updatedBy:actorId}},session?{session}:{});
 if(!result.matchedCount)throw new Error("LOCATION_NOT_FOUND_OR_INACTIVE");
 return c.locations.findOne({tenantId,locationId},session?{session}:{});
}
