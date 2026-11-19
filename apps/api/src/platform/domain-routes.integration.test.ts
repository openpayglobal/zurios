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
   "inventory.stock.write","inventory.stock.reserve","inventory.stock.consume","inventory.stock.release",
   "pos.terminal.create","pos.shift.open","pos.shift.close","pos.sale.complete","pos.refund.complete","pos.offline.sync",
   "erp.account.read","erp.account.create","erp.fiscal_period.read","erp.fiscal_period.create","erp.purchase_order.create",
   "erp.invoice.read","erp.invoice.create","erp.invoice.payment.allocate","erp.journal.post"
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

  const terminal=await app.inject({
   method:"POST",url:"/v1/pos/terminals",headers:{...headers,"idempotency-key":"pos-terminal-api-001"},
   payload:{terminalId:"terminal-api-001",code:"POS-API-1",locationId:"loc-a",deviceId:"device-api-1",status:"active"}
  });
  assert.equal(terminal.statusCode,201);
  const deniedTerminal=await app.inject({
   method:"POST",url:"/v1/pos/terminals",headers:{...headers,"idempotency-key":"pos-terminal-api-002"},
   payload:{terminalId:"terminal-api-002",code:"POS-API-2",locationId:"loc-b",deviceId:"device-api-2",status:"active"}
  });
  assert.equal(deniedTerminal.statusCode,403);
  const openedShift=await app.inject({
   method:"POST",url:"/v1/pos/shifts/open",headers:{...headers,"idempotency-key":"pos-shift-open-api-001"},
   payload:{shiftId:"shift-api-001",terminalId:"terminal-api-001",cashierId:"inventory-user",currency:"UGX",openedAt:now.toISOString(),openingFloatMinor:10000,status:"open"}
  });
  assert.equal(openedShift.statusCode,201);
  const sale=await app.inject({
   method:"POST",url:"/v1/pos/sales/complete",headers:{...headers,"idempotency-key":"pos-sale-api-001"},
   payload:{saleId:"sale-api-001",terminalId:"terminal-api-001",cashierId:"inventory-user",currency:"UGX",
    lines:[{sku:"SKU-POS-API",description:"POS API test item",quantityMilli:1000,unitPriceMinor:2000,discountMinor:0,taxRateBps:0}],
    subtotalMinor:2000,taxMinor:0,totalMinor:2000,
    tenders:[{tenderId:"tender-api-001",method:"cash",amountMinor:2000,currency:"UGX",status:"captured"}],
    status:"completed",completedAt:now.toISOString()}
  });
  assert.equal(sale.statusCode,201);
  const refund=await app.inject({
   method:"POST",url:"/v1/pos/refunds",headers:{...headers,"idempotency-key":"pos-refund-api-001"},
   payload:{refundId:"refund-api-001",saleId:"sale-api-001",originalSaleTotalMinor:2000,amountMinor:500,currency:"UGX",reason:"API integration return",status:"completed",completedAt:now.toISOString()}
  });
  assert.equal(refund.statusCode,201);
  const closedShift=await app.inject({
   method:"POST",url:"/v1/pos/shifts/shift-api-001/close",headers:{...headers,"idempotency-key":"pos-shift-close-api-001"},
   payload:{expectedCashMinor:2000,countedCashMinor:2000}
  });
  assert.equal(closedShift.statusCode,200);
  const offline=await app.inject({
   method:"POST",url:"/v1/pos/offline-commands",headers:{...headers,"idempotency-key":"offline-command-api-001"},
   payload:{terminalId:"terminal-api-001",commandId:"offline-command-api-001",sequence:1,commandType:"sale",payload:{saleId:"offline-sale-api-001"},issuedAt:now.toISOString()}
  });
  assert.equal(offline.statusCode,202);

  const accountCash=await app.inject({
   method:"POST",url:"/v1/erp/accounts",headers:{...headers,"idempotency-key":"erp-account-api-001"},
   payload:{organizationId:"org-a",accountCode:"1000",name:"Cash",accountType:"asset",normalBalance:"debit"}
  });
  assert.equal(accountCash.statusCode,201);
  const accountRevenue=await app.inject({
   method:"POST",url:"/v1/erp/accounts",headers:{...headers,"idempotency-key":"erp-account-api-002"},
   payload:{organizationId:"org-a",accountCode:"4000",name:"Sales Revenue",accountType:"income",normalBalance:"credit"}
  });
  assert.equal(accountRevenue.statusCode,201);
  const accountList=await app.inject({method:"GET",url:"/v1/erp/accounts",headers});
  assert.equal(accountList.statusCode,200);
  assert.equal(accountList.json().data.length,2);
  const deniedAccount=await app.inject({
   method:"POST",url:"/v1/erp/accounts",headers:{...headers,"idempotency-key":"erp-account-api-003"},
   payload:{organizationId:"org-b",accountCode:"9000",name:"Out of scope",accountType:"asset",normalBalance:"debit"}
  });
  assert.equal(deniedAccount.statusCode,403);

  const fiscal=await app.inject({
   method:"POST",url:"/v1/erp/fiscal-periods",headers:{...headers,"idempotency-key":"erp-period-api-001"},
   payload:{organizationId:"org-a",periodId:"FY-API",periodCode:"FY-API",startsAt:"2026-01-01T00:00:00.000Z",endsAt:"2026-12-31T23:59:59.999Z",status:"open"}
  });
  assert.equal(fiscal.statusCode,201);
  const purchaseOrder=await app.inject({
   method:"POST",url:"/v1/erp/purchase-orders",headers:{...headers,"idempotency-key":"erp-po-api-001"},
   payload:{orderNumber:"PO-API-001",supplierId:"supplier-api",warehouseId:"warehouse-a",currency:"UGX",orderedAt:now.toISOString(),
    lines:[{sku:"SKU-API",description:"Stock item",quantityMilli:1000,unitPriceMinor:1000,taxRateBps:0}],totalMinor:1000,status:"submitted"}
  });
  assert.equal(purchaseOrder.statusCode,201);
  const invoice=await app.inject({
   method:"POST",url:"/v1/erp/invoices",headers:{...headers,"idempotency-key":"erp-invoice-api-001"},
   payload:{organizationId:"org-a",invoiceId:"invoice-api-001",invoiceNumber:"INV-API-001",invoiceType:"sales",partyId:"customer-api",currency:"UGX",
    issuedAt:now.toISOString(),dueAt:new Date(now.getTime()+30*86400000).toISOString(),
    lines:[{description:"Service",quantityMilli:1000,unitPriceMinor:10000,discountMinor:0,taxRateBps:1800}],
    subtotalMinor:10000,taxMinor:1800,totalMinor:11800,status:"issued"}
  });
  assert.equal(invoice.statusCode,201);
  const payment=await app.inject({
   method:"POST",url:"/v1/erp/invoices/invoice-api-001/payments",headers:{...headers,"idempotency-key":"erp-payment-api-001"},
   payload:{paymentId:"payment-api-001",amountMinor:11800,currency:"UGX"}
  });
  assert.equal(payment.statusCode,201);
  const invoiceList=await app.inject({method:"GET",url:"/v1/erp/invoices",headers});
  assert.equal(invoiceList.statusCode,200);
  assert.equal(invoiceList.json().data.length,1);
  const journal=await app.inject({
   method:"POST",url:"/v1/erp/journal-entries/post",headers:{...headers,"idempotency-key":"erp-journal-api-001"},
   payload:{entryNumber:"JE-API-001",fiscalPeriodId:"FY-API",sourceType:"manual",sourceId:"source-api-001",currency:"UGX",
    lines:[{accountCode:"1000",debitMinor:1000,creditMinor:0,currency:"UGX"},{accountCode:"4000",debitMinor:0,creditMinor:1000,currency:"UGX"}],
    status:"posted",postedAt:now.toISOString()}
  });
  assert.equal(journal.statusCode,201);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId:"tenant-a"})>=16);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId:"tenant-a"})>=3);
 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
