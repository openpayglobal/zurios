import type {Db} from "mongodb";
export async function ensureCoreIndexes(db:Db):Promise<void>{
 const specs:Array<[string,Record<string,1|-1>,Record<string,unknown>?]>=[
 ["tenants",{tenantId:1},{unique:true}],["tenants",{slug:1},{unique:true}],
 ["organizations",{tenantId:1,organizationId:1},{unique:true}],["organizations",{tenantId:1,code:1},{unique:true}],["organizations",{tenantId:1,parentOrganizationId:1}],
 ["locations",{tenantId:1,locationId:1},{unique:true}],["locations",{tenantId:1,organizationId:1,code:1},{unique:true}],
 ["users",{userId:1},{unique:true}],["users",{emailNormalized:1},{unique:true}],
 ["memberships",{tenantId:1,membershipId:1},{unique:true}],["memberships",{tenantId:1,userId:1},{unique:true,partialFilterExpression:{status:{$in:["invited","active","suspended"]}}}],
 ["roles",{tenantId:1,roleId:1},{unique:true}],["roles",{tenantId:1,key:1},{unique:true}],
 ["policies",{tenantId:1,key:1},{unique:true}],["sessions",{tenantId:1,sessionId:1},{unique:true}],["sessions",{expiresAt:1},{expireAfterSeconds:0}],["sessions",{tenantId:1,userId:1,revokedAt:1}],
 ["feature_flags",{tenantId:1,key:1},{unique:true}],["audit_events",{tenantId:1,occurredAt:-1}],["audit_events",{eventId:1},{unique:true}]
 ];
 await Promise.all(specs.map(([name,key,options])=>db.collection(name).createIndex(key,options)));
}
