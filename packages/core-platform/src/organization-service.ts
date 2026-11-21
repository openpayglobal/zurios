import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
import type {OrganizationDocument} from "./types.js";
const schema=z.object({code:z.string().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),name:z.string().min(2).max(150),type:z.enum(["group","company","business_unit","department","branch"]),parentOrganizationId:z.string().optional()});
export async function createOrganization(db:Db,tenantId:string,actorId:string,input:unknown,session?:ClientSession){
 const d=schema.parse(input),{parentOrganizationId}=d,c=coreCollections(db),parent=parentOrganizationId?await c.organizations.findOne({tenantId,organizationId:parentOrganizationId,status:"active"},session?{session}:{}):null;
 if(parentOrganizationId&&!parent)throw new Error("PARENT_ORGANIZATION_NOT_FOUND");
 const path=parent?[...parent.path,parent.organizationId]:[],now=new Date();
 const doc:OrganizationDocument={
  tenantId,
  organizationId:newId("org"),
  code:d.code,
  name:d.name,
  type:d.type,
  ...(parentOrganizationId?{parentOrganizationId}:{}),
  path,
  status:"active",
  createdAt:now,
  updatedAt:now,
  createdBy:actorId,
  updatedBy:actorId
 };
 await c.organizations.insertOne(doc,session?{session}:{});return doc;
}

export async function setOrganizationStatus(db:Db,tenantId:string,organizationId:string,status:"active"|"inactive",actorId:string,session?:ClientSession){
 const c=coreCollections(db),now=new Date();
 if(status==="inactive"){
  const [children,locations,memberships]=await Promise.all([
   c.organizations.countDocuments({tenantId,parentOrganizationId:organizationId,status:"active"},session?{session}:{}),
   c.locations.countDocuments({tenantId,organizationId,status:"active"},session?{session}:{}),
   c.memberships.countDocuments({tenantId,organizationIds:organizationId,status:"active"},session?{session}:{})
  ]);
  if(children||locations||memberships)throw new Error("ORGANIZATION_HAS_ACTIVE_DEPENDENCIES");
 }
 const result=await c.organizations.updateOne({tenantId,organizationId,status:{$ne:"inactive"}},{$set:{status,updatedAt:now,updatedBy:actorId}},session?{session}:{});
 if(!result.matchedCount)throw new Error("ORGANIZATION_NOT_FOUND_OR_INACTIVE");
 return c.organizations.findOne({tenantId,organizationId},session?{session}:{});
}
