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
  db.collection("auth_challenges").createIndex({expiresAt:1},{expireAfterSeconds:0})
 ]);
}
export async function closeMongo():Promise<void>{await client?.close();client=undefined;database=undefined;}
