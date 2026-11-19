import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({code:z.string().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),name:z.string().min(2).max(150),type:z.enum(["group","company","business_unit","department","branch"]),parentOrganizationId:z.string().optional()});
export async function createOrganization(db:Db,tenantId:string,actorId:string,input:unknown,session?:ClientSession){
 const d=schema.parse(input),{parentOrganizationId,...rest}=d,c=coreCollections(db),parent=parentOrganizationId?await c.organizations.findOne({tenantId,organizationId:parentOrganizationId,status:"active"},session?{session}:{}):null;
 if(parentOrganizationId&&!parent)throw new Error("PARENT_ORGANIZATION_NOT_FOUND");
 const path=parent?[...parent.path,parent.organizationId]:[],now=new Date(),doc={tenantId,organizationId:newId("org"),...rest,...(parentOrganizationId?{parentOrganizationId}:{}),path,status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.organizations.insertOne(doc,session?{session}:{});return doc;
}
