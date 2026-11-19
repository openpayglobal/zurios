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
  ["feature_flags",{tenantId:1,key:1},{unique:true}],["audit_events",{tenantId:1,occurredAt:-1}],["audit_events",{eventId:1},{unique:true}],
  ["idempotency_records",{tenantId:1,actorId:1,operation:1,key:1},{unique:true}],["idempotency_records",{expiresAt:1},{expireAfterSeconds:0}],
  ["outbox_events",{eventId:1},{unique:true}],["outbox_events",{status:1,availableAt:1,occurredAt:1}],["outbox_events",{status:1,leaseUntil:1}],
  ["event_consumer_receipts",{consumerId:1,eventId:1},{unique:true}],["event_consumer_receipts",{tenantId:1,processedAt:-1}],
  ["platform_events",{eventId:1},{unique:true}],["platform_events",{tenantId:1,occurredAt:1}],["platform_events",{eventType:1,occurredAt:1}],
  ["approval_requests",{requestId:1},{unique:true}],["approval_requests",{tenantId:1,status:1,createdAt:-1}],["approval_requests",{expiresAt:1}],
  ["break_glass_grants",{grantId:1},{unique:true}],["break_glass_grants",{tenantId:1,userId:1,status:1,expiresAt:1}],
  ["platform_operator_grants",{grantId:1},{unique:true}],["platform_operator_grants",{userId:1,status:1,validUntil:1}]
 ];
 await Promise.all(specs.map(([name,key,options])=>db.collection(name).createIndex(key,options)));
}
