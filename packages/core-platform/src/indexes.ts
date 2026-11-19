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
  ["products",{tenantId:1,productId:1},{unique:true}],["products",{tenantId:1,skuNormalized:1},{unique:true}],
  ["stock_locations",{tenantId:1,stockLocationId:1},{unique:true}],["stock_locations",{tenantId:1,organizationId:1,code:1},{unique:true}],
  ["stock_lots",{tenantId:1,lotId:1},{unique:true}],["stock_lots",{tenantId:1,productId:1,lotNumber:1},{unique:true}],["stock_lots",{tenantId:1,expiryDate:1}],
  ["stock_movements",{tenantId:1,movementId:1},{unique:true}],["stock_movements",{tenantId:1,idempotencyKey:1},{unique:true}],
  ["stock_movements",{tenantId:1,productId:1,occurredAt:-1}],["stock_movements",{tenantId:1,stockLocationId:1,occurredAt:-1}],
  ["stock_balances",{tenantId:1,productId:1,stockLocationId:1,lotId:1},{unique:true}],
  ["stock_reservations",{tenantId:1,reservationId:1},{unique:true}],["stock_reservations",{tenantId:1,orderId:1,status:1}],
  ["stock_counts",{tenantId:1,countId:1},{unique:true}],["stock_counts",{tenantId:1,stockLocationId:1,status:1}],
  ["stock_transfer_orders",{tenantId:1,transferId:1},{unique:true}],["stock_transfer_orders",{tenantId:1,status:1,createdAt:-1}]
 ];
 await Promise.all(specs.map(([name,key,options])=>db.collection(name).createIndex(key,options)));
}
