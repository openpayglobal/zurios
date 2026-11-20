import type {ClientSession,Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";
import {coreCollections} from "./repositories.js";
import {upsertPolicy} from "./policy-service.js";
const schema=z.object({userId:z.string().min(1),organizationIds:z.array(z.string().min(1)).default([]),locationIds:z.array(z.string().min(1)).default([]),roleIds:z.array(z.string().min(1)).default([])});
function assertUnique(values:string[],code:string){if(new Set(values).size!==values.length)throw new Error(code);}
export async function createMembership(db:Db,tenantId:string,actorId:string,input:unknown,session?:ClientSession,options?:{allowInvitedUser?:boolean;forceInvited?:boolean;allowProvisioningTenant?:boolean}){
 const d=schema.parse(input),c=coreCollections(db);
 assertUnique(d.organizationIds,"DUPLICATE_ORGANIZATION_SCOPE");assertUnique(d.locationIds,"DUPLICATE_LOCATION_SCOPE");assertUnique(d.roleIds,"DUPLICATE_ROLE_ASSIGNMENT");
 if(!await c.tenants.findOne({tenantId,status:options?.allowProvisioningTenant?{$in:["active","provisioning"]}:"active"},session?{session}:{}))throw new Error("TENANT_NOT_ACTIVE");
 const user=await c.users.findOne({userId:d.userId,status:options?.allowInvitedUser?{$in:["active","invited"]}:"active"},session?{session}:{});
 if(!user)throw new Error("ACTIVE_USER_REQUIRED");
 if(d.organizationIds.length&&await c.organizations.countDocuments({tenantId,organizationId:{$in:d.organizationIds},status:"active"},session?{session}:{})!==d.organizationIds.length)throw new Error("INVALID_ORGANIZATION_SCOPE");
 if(d.locationIds.length){
  const locations=await c.locations.find({tenantId,locationId:{$in:d.locationIds},status:"active"},{projection:{_id:0,locationId:1,organizationId:1},...(session?{session}:{})}).toArray();
  if(locations.length!==d.locationIds.length)throw new Error("INVALID_LOCATION_SCOPE");
  const allowedOrganizations=new Set(d.organizationIds);
  if(locations.some(location=>!allowedOrganizations.has(location.organizationId)))throw new Error("INVALID_LOCATION_ORGANIZATION_SCOPE");
 }
 if(d.roleIds.length&&await c.roles.countDocuments({tenantId,roleId:{$in:d.roleIds},status:"active"},session?{session}:{})!==d.roleIds.length)throw new Error("INVALID_ROLE_ASSIGNMENT");
 if(await c.memberships.findOne({tenantId,userId:d.userId,status:{$in:["invited","active","suspended"]}},session?{session}:{}))throw new Error("MEMBERSHIP_ALREADY_EXISTS");
 const now=new Date(),doc={tenantId,membershipId:newId("mem"),...d,status:(options?.forceInvited||user.status==="invited"?"invited":"active") as "invited"|"active",createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await c.memberships.insertOne(doc,session?{session}:{});
 if(d.roleIds.length){
  const roles=await c.roles.find({tenantId,roleId:{$in:d.roleIds},status:"active"},{projection:{_id:0,permissionKeys:1},...(session?{session}:{})}).toArray();
  const actions=[...new Set(roles.flatMap(role=>role.permissionKeys??[]))];
  if(actions.length)await upsertPolicy(db,tenantId,actorId,{key:`membership-role:${doc.membershipId}`,effect:"allow",priority:0,subject:{userId:d.userId},resource:{},actions,conditions:{}},session);
 }
 return doc;
}
export async function revokeMembership(db:Db,tenantId:string,membershipId:string,actorId:string,session?:ClientSession){
 const now=new Date(),c=coreCollections(db),r=await c.memberships.updateOne({tenantId,membershipId,status:{$ne:"revoked"}},{$set:{status:"revoked",updatedAt:now,updatedBy:actorId}},session?{session}:{});
 if(!r.matchedCount)throw new Error("MEMBERSHIP_NOT_FOUND");
 await c.sessions.updateMany({tenantId,membershipId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actorId}},session?{session}:{});
}

export async function setMembershipStatus(db:Db,tenantId:string,membershipId:string,status:"active"|"suspended"|"revoked",actorId:string,session?:ClientSession){
 const now=new Date(),c=coreCollections(db);
 const result=await c.memberships.updateOne({tenantId,membershipId,status:{$ne:"revoked"}},{$set:{status,updatedAt:now,updatedBy:actorId}},session?{session}:{});
 if(!result.matchedCount)throw new Error("MEMBERSHIP_NOT_FOUND");
 if(status!=="active")await c.sessions.updateMany({tenantId,membershipId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actorId}},session?{session}:{});
 return c.memberships.findOne({tenantId,membershipId},session?{session}:{});
}
