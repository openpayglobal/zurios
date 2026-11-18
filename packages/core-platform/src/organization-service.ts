import type {Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({code:z.string().min(1).max(40),name:z.string().min(2).max(150),type:z.enum(["group","company","business_unit","department","branch"]),parentOrganizationId:z.string().optional()});
export async function createOrganization(db:Db,tenantId:string,actorId:string,input:unknown){
 const d=schema.parse(input),c=coreCollections(db);
 if(d.parentOrganizationId&&!await c.organizations.findOne({tenantId,organizationId:d.parentOrganizationId}))throw new Error("PARENT_ORGANIZATION_NOT_FOUND");
 const path=d.parentOrganizationId?(await c.organizations.findOne({tenantId,organizationId:d.parentOrganizationId}))!.path.concat(d.parentOrganizationId):[];
 const now=new Date(),doc={tenantId,organizationId:newId("org"),...d,...(d.parentOrganizationId?{parentOrganizationId:d.parentOrganizationId}:{}),path,status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.organizations.insertOne(doc);return doc;
}
