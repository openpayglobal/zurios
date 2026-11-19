import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {SignJWT} from "jose";
import {domainRoutes} from "./domain-routes.js";
import type {AuthConfig} from "./auth-service.js";

const uri=process.env.MONGODB_TEST_URI;
const config:AuthConfig={
 issuer:"https://zuri.test",audience:"zuri-api-test",jwtSecret:"test-only-secret-that-is-long-enough-for-ci",
 accessTokenTtlSeconds:300,sessionTtlSeconds:3600,mfaEncryptionKey:""
};
const signingKey=new TextEncoder().encode(config.jwtSecret);

test("Inventory API enforces tenant, organization, location, ABAC and idempotency boundaries",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_inventory_api_it_${randomUUID().replaceAll("-","")}`);
 const app=Fastify();
 try{
  const now=new Date();
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("inventory_warehouses").createIndex({tenantId:1,warehouseId:1},{unique:true}),
   db.collection("inventory_warehouses").createIndex({tenantId:1,code:1},{unique:true}),
   db.collection("inventory_stock_balances").createIndex({tenantId:1,warehouseId:1,sku:1},{unique:true}),
   db.collection("inventory_stock_ledger").createIndex({tenantId:1,movementId:1,leg:1},{unique:true}),
   db.collection("inventory_reservations").createIndex({tenantId:1,reservationId:1},{unique:true})
  ]);
  await db.collection("tenants").insertMany([{tenantId:"tenant-a",status:"active"},{tenantId:"tenant-b",status:"active"}]);
  await db.collection("users").insertOne({userId:"inventory-user",status:"active"});
  await db.collection("organizations").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",status:"active"},
   {tenantId:"tenant-a",organizationId:"org-b",status:"active"},
   {tenantId:"tenant-b",organizationId:"org-secret",status:"active"}
  ]);
  await db.collection("locations").insertMany([
   {tenantId:"tenant-a",locationId:"loc-a",organizationId:"org-a",status:"active"},
   {tenantId:"tenant-a",locationId:"loc-b",organizationId:"org-b",status:"active"},
   {tenantId:"tenant-b",locationId:"loc-secret",organizationId:"org-secret",status:"active"}
  ]);
  const permissions=[
   "inventory.warehouse.read","inventory.warehouse.create","inventory.stock.read",
   "inventory.stock.write","inventory.stock.reserve","inventory.stock.consume","inventory.stock.release"
  ];
  await db.collection("roles").insertOne({tenantId:"tenant-a",roleId:"inventory-role",key:"inventory.manager",permissionKeys:permissions,status:"active"});
  await db.collection("memberships").insertOne({
   tenantId:"tenant-a",membershipId:"inventory-membership",userId:"inventory-user",
   organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["inventory-role"],status:"active"
  });
  await db.collection("sessions").insertOne({
   tenantId:"tenant-a",sessionId:"inventory-session",userId:"inventory-user",membershipId:"inventory-membership",
   expiresAt:new Date(now.getTime()+60_000),lastUsedAt:now
  });
  await db.collection("policies").insertMany(permissions.map((action,index)=>({
   tenantId:"tenant-a",policyId:"inventory-allow-"+index,key:"inventory-allow-"+index,effect:"allow",priority:0,
   subject:{userId:"inventory-user"},resource:{},actions:[action],conditions:{},status:"active"
  })));
  await db.collection("inventory_warehouses").insertMany([
   {tenantId:"tenant-a",warehouseId:"warehouse-a",code:"WH-A",name:"Assigned warehouse",locationId:"loc-a",status:"active"},
   {tenantId:"tenant-a",warehouseId:"warehouse-b",code:"WH-B",name:"Other location warehouse",locationId:"loc-b",status:"active"},
   {tenantId:"tenant-b",warehouseId:"warehouse-secret",code:"WH-S",name:"Foreign tenant warehouse",locationId:"loc-secret",status:"active"}
  ]);
  await app.register(domainRoutes(db,config),{prefix:"/v1"});await app.ready();
  const token=await new SignJWT({tenantId:"tenant-a",membershipId:"inventory-membership",sessionId:"inventory-session"})
   .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience)
   .setSubject("inventory-user").setIssuedAt().setExpirationTime("5m").sign(signingKey);
  const headers={authorization:`Bearer ${token}`};

  const listed=await app.inject({method:"GET",url:"/v1/inventory/warehouses",headers});
  assert.equal(listed.statusCode,200);
  assert.deepEqual(listed.json().data.map((w:any)=>w.warehouseId),["warehouse-a"]);

  const foreign=await app.inject({method:"GET",url:"/v1/inventory/warehouses/warehouse-secret/balances",headers});
  assert.equal(foreign.statusCode,404,"foreign-tenant resources must not be discoverable");

  const outOfScope=await app.inject({method:"GET",url:"/v1/inventory/warehouses/warehouse-b/balances",headers});
  assert.equal(outOfScope.statusCode,403,"same-tenant resources outside the assigned location must be denied");

  const create=await app.inject({
   method:"POST",url:"/v1/inventory/warehouses",headers:{...headers,"idempotency-key":"warehouse-create-api-001"},
   payload:{warehouseId:"warehouse-new",code:"WH-NEW",name:"New assigned warehouse",locationId:"loc-a",status:"active"}
  });
  assert.equal(create.statusCode,201);
  const replay=await app.inject({
   method:"POST",url:"/v1/inventory/warehouses",headers:{...headers,"idempotency-key":"warehouse-create-api-001"},
   payload:{warehouseId:"warehouse-new",code:"WH-NEW",name:"New assigned warehouse",locationId:"loc-a",status:"active"}
  });
  assert.equal(replay.statusCode,201);
  assert.deepEqual(replay.json(),create.json());

  const deniedCreate=await app.inject({
   method:"POST",url:"/v1/inventory/warehouses",headers:{...headers,"idempotency-key":"warehouse-create-api-002"},
   payload:{warehouseId:"warehouse-denied",code:"WH-DENIED",name:"Other location warehouse",locationId:"loc-b",status:"active"}
  });
  assert.equal(deniedCreate.statusCode,403);

  const movement=await app.inject({
   method:"POST",url:"/v1/inventory/stock-movements",headers:{...headers,"idempotency-key":"stock-receipt-api-001"},
   payload:{movementId:"receipt-api-001",movementType:"receipt",sku:"SKU-API",warehouseId:"warehouse-a",quantityMilli:5000,referenceType:"purchase_order",referenceId:"PO-API",occurredAt:now.toISOString()}
  });
  assert.equal(movement.statusCode,201);
  const balances=await app.inject({method:"GET",url:"/v1/inventory/warehouses/warehouse-a/balances?sku=SKU-API",headers});
  assert.equal(balances.statusCode,200);
  assert.equal(balances.json().data[0].quantityOnHandMilli,5000);

  const reservation=await app.inject({
   method:"POST",url:"/v1/inventory/reservations",headers:{...headers,"idempotency-key":"stock-reserve-api-001"},
   payload:{reservationId:"reservation-api-001",orderId:"order-api-001",warehouseId:"warehouse-a",lines:[{sku:"SKU-API",quantityMilli:2000}],status:"reserved",expiresAt:new Date(Date.now()+60_000).toISOString()}
  });
  assert.equal(reservation.statusCode,201);
  const committed=await app.inject({method:"POST",url:"/v1/inventory/reservations/reservation-api-001/commit",headers:{...headers,"idempotency-key":"stock-commit-api-001"}});
  assert.equal(committed.statusCode,200);
  const committedReplay=await app.inject({method:"POST",url:"/v1/inventory/reservations/reservation-api-001/commit",headers:{...headers,"idempotency-key":"stock-commit-api-001"}});
  assert.equal(committedReplay.statusCode,200);
  assert.deepEqual(committedReplay.json(),committed.json());
  const finalBalance=await db.collection<any>("inventory_stock_balances").findOne({tenantId:"tenant-a",warehouseId:"warehouse-a",sku:"SKU-API"});
  assert.equal(finalBalance.quantityOnHandMilli,3000);
  assert.equal(finalBalance.quantityReservedMilli,0);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId:"tenant-a"})>=4);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId:"tenant-a"})>=3);
 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
