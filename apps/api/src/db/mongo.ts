import {MongoClient,type Db,type Collection} from "mongodb";
import {config} from "../config.js";
let client:MongoClient|undefined;
let database:Db|undefined;
export async function connectMongo():Promise<Db>{
 if(database)return database;
 client=new MongoClient(config.MONGODB_URI,{appName:"zuri-os-api",maxPoolSize:20,minPoolSize:2});
 await client.connect();
 database=client.db(config.MONGODB_DATABASE);
 await ensureIndexes(database);
 return database;
}
export function getDb():Db{
 if(!database)throw new Error("MongoDB has not been initialized");
 return database;
}
export function collection<T extends object>(name:string):Collection<T>{return getDb().collection<T>(name);}
async function ensureIndexes(db:Db):Promise<void>{
 await Promise.all([
  db.collection("tenants").createIndex({tenantId:1},{unique:true}),
  db.collection("tenants").createIndex({slug:1},{unique:true}),
  db.collection("users").createIndex({userId:1},{unique:true}),
  db.collection("users").createIndex({emailNormalized:1},{unique:true}),
  db.collection("organizations").createIndex({tenantId:1,organizationId:1},{unique:true}),
  db.collection("organizations").createIndex({tenantId:1,code:1},{unique:true}),
  db.collection("locations").createIndex({tenantId:1,locationId:1},{unique:true}),
  db.collection("locations").createIndex({tenantId:1,organizationId:1,code:1},{unique:true}),
  db.collection("memberships").createIndex({tenantId:1,membershipId:1},{unique:true}),
  db.collection("memberships").createIndex({tenantId:1,userId:1},{unique:true,partialFilterExpression:{status:{$in:["invited","active","suspended"]}}}),
  db.collection("roles").createIndex({tenantId:1,roleId:1},{unique:true}),
  db.collection("roles").createIndex({tenantId:1,key:1},{unique:true}),
  db.collection("policies").createIndex({tenantId:1,key:1},{unique:true}),
  db.collection("sessions").createIndex({tenantId:1,sessionId:1},{unique:true}),
  db.collection("sessions").createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection("feature_flags").createIndex({tenantId:1,key:1},{unique:true}),
  db.collection("audit_events").createIndex({tenantId:1,occurredAt:-1}),
  db.collection("audit_events").createIndex({eventId:1},{unique:true}),
  db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
  db.collection("idempotency_records").createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
  db.collection("outbox_events").createIndex({status:1,availableAt:1,occurredAt:1}),
  db.collection("outbox_events").createIndex({status:1,leaseUntil:1}),
  db.collection("event_consumer_receipts").createIndex({consumerId:1,eventId:1},{unique:true}),
  db.collection("event_consumer_receipts").createIndex({tenantId:1,processedAt:-1}),
  db.collection("platform_events").createIndex({eventId:1},{unique:true}),
  db.collection("platform_events").createIndex({tenantId:1,occurredAt:1}),
  db.collection("platform_events").createIndex({eventType:1,occurredAt:1}),
  db.collection("approval_requests").createIndex({requestId:1},{unique:true}),
  db.collection("approval_requests").createIndex({tenantId:1,status:1,createdAt:-1}),
  db.collection("approval_requests").createIndex({expiresAt:1}),
  db.collection("break_glass_grants").createIndex({grantId:1},{unique:true}),
  db.collection("break_glass_grants").createIndex({tenantId:1,userId:1,status:1,expiresAt:1}),
  db.collection("platform_operator_grants").createIndex({grantId:1},{unique:true}),
  db.collection("platform_operator_grants").createIndex({userId:1,status:1,validUntil:1}),
  db.collection("platform_operator_grants").createIndex({userId:1},{unique:true,partialFilterExpression:{status:"active"}}),
  db.collection("tenant_config").createIndex({tenantId:1,key:1},{unique:true}),
  db.collection("audit_export_jobs").createIndex({jobId:1},{unique:true}),
  db.collection("audit_export_jobs").createIndex({tenantId:1,createdAt:-1}),
  db.collection("auth_rate_limits").createIndex({key:1},{unique:true}),
  db.collection("auth_rate_limits").createIndex({expiresAt:1},{expireAfterSeconds:0}),
  db.collection("auth_challenges").createIndex({challengeId:1},{unique:true}),
  db.collection("inventory_warehouses").createIndex({tenantId:1,warehouseId:1},{unique:true}),,
  db.collection("inventory_warehouses").createIndex({tenantId:1,code:1},{unique:true}),,
  db.collection("inventory_stock_balances").createIndex({tenantId:1,warehouseId:1,sku:1},{unique:true}),,
  db.collection("inventory_stock_ledger").createIndex({tenantId:1,movementId:1,leg:1},{unique:true}),,
  db.collection("inventory_stock_ledger").createIndex({tenantId:1,warehouseId:1,sku:1,occurredAt:-1}),,
  db.collection("inventory_reservations").createIndex({tenantId:1,reservationId:1},{unique:true}),,
  db.collection("inventory_reservations").createIndex({tenantId:1,warehouseId:1,status:1,expiresAt:1}),,
  db.collection("erp_accounts").createIndex({tenantId:1,accountCode:1},{unique:true}),,
  db.collection("erp_fiscal_periods").createIndex({tenantId:1,periodId:1},{unique:true}),,
  db.collection("erp_fiscal_periods").createIndex({tenantId:1,startsAt:1,endsAt:1,status:1}),,
  db.collection("erp_purchase_orders").createIndex({tenantId:1,orderNumber:1},{unique:true}),,
  db.collection("erp_invoices").createIndex({tenantId:1,invoiceId:1},{unique:true}),,
  db.collection("erp_invoices").createIndex({tenantId:1,invoiceNumber:1},{unique:true}),,
  db.collection("erp_invoices").createIndex({tenantId:1,partyId:1,status:1,dueAt:1}),,
  db.collection("erp_journal_entries").createIndex({tenantId:1,entryNumber:1},{unique:true}),,
  db.collection("erp_journal_entries").createIndex({tenantId:1,fiscalPeriodId:1,postedAt:1}),,
  db.collection("erp_payment_allocations").createIndex({tenantId:1,paymentId:1,invoiceId:1},{unique:true}),,
  db.collection("pos_terminals").createIndex({tenantId:1,terminalId:1},{unique:true}),,
  db.collection("pos_terminals").createIndex({tenantId:1,code:1},{unique:true}),,
  db.collection("pos_cashier_shifts").createIndex({tenantId:1,shiftId:1},{unique:true}),,
  db.collection("pos_cashier_shifts").createIndex({tenantId:1,terminalId:1,status:1}),
  db.collection("pos_cashier_shifts").createIndex({tenantId:1,terminalId:1},{unique:true,partialFilterExpression:{status:"open"}}),,
  db.collection("pos_sales").createIndex({tenantId:1,saleId:1},{unique:true}),,
  db.collection("pos_refunds").createIndex({tenantId:1,refundId:1},{unique:true}),,
  db.collection("pos_refunds").createIndex({tenantId:1,saleId:1,status:1}),,
  db.collection("pos_offline_commands").createIndex({tenantId:1,terminalId:1,commandId:1},{unique:true}),,
  db.collection("pos_offline_commands").createIndex({tenantId:1,terminalId:1,sequence:1},{unique:true}),
  db.collection("webhook_subscriptions").createIndex({tenantId:1,endpointId:1},{unique:true}),
  db.collection("webhook_subscriptions").createIndex({tenantId:1,status:1,eventTypes:1}),
  db.collection("webhook_deliveries").createIndex({tenantId:1,endpointId:1,eventId:1},{unique:true}),
  db.collection("webhook_deliveries").createIndex({status:1,availableAt:1,createdAt:1}),
  db.collection("webhook_deliveries").createIndex({status:1,leaseUntil:1}),
  db.collection("auth_challenges").createIndex({expiresAt:1},{expireAfterSeconds:0})
 ]);
}
export async function closeMongo():Promise<void>{await client?.close();client=undefined;database=undefined;}
