import type {Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
const schema=z.object({userId:z.string(),organizationIds:z.array(z.string()).default([]),locationIds:z.array(z.string()).default([]),roleIds:z.array(z.string()).default([])});
export async function createMembership(db:Db,tenantId:string,actorId:string,input:unknown){
 const d=schema.parse(input),c=coreCollections(db);
 if(!await c.tenants.findOne({tenantId,status:"active"}))throw new Error("TENANT_NOT_ACTIVE");
 if(!await c.users.findOne({userId:d.userId,status:"active"}))throw new Error("ACTIVE_USER_REQUIRED");
 if(d.organizationIds.length&&await c.organizations.countDocuments({tenantId,organizationId:{$in:d.organizationIds},status:"active"})!==d.organizationIds.length)throw new Error("INVALID_ORGANIZATION_SCOPE");
 if(d.locationIds.length&&await c.locations.countDocuments({tenantId,locationId:{$in:d.locationIds},status:"active"})!==d.locationIds.length)throw new Error("INVALID_LOCATION_SCOPE");
 const now=new Date(),doc={tenantId,membershipId:newId("mem"),...d,status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.memberships.insertOne(doc);return doc;
}
export async function revokeMembership(db:Db,tenantId:string,membershipId:string,actorId:string){
 const now=new Date(),c=coreCollections(db);
 const r=await c.memberships.updateOne({tenantId,membershipId,status:{$ne:"revoked"}},{$set:{status:"revoked",updatedAt:now,updatedBy:actorId}});
 if(!r.matchedCount)throw new Error("MEMBERSHIP_NOT_FOUND");
 await c.sessions.updateMany({tenantId,membershipId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actorId}});
}
