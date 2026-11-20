import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {MongoClient} from "mongodb";
import {
 createWarehouse,recordStockMovement,reserveStock,commitReservation,
 createAccount,createFiscalPeriod,createPurchaseOrder,createInvoice,postJournalEntry,allocateInvoicePayment,
 registerPosTerminal,openCashierShift,closeCashierShift,completePosSale,refundPosSale,acceptOfflinePosCommand
} from "./index.js";

const uri=process.env.MONGODB_TEST_URI;
test("tenant-scoped Inventory, ERP and POS commands commit with idempotency and outbox events",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_domains_"+randomUUID().replaceAll("-",""));
 try{
  await db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true});
  await db.collection("outbox_events").createIndex({eventId:1},{unique:true});
  await db.collection("platform_events").createIndex({eventId:1},{unique:true});
  await db.collection("inventory_warehouses").createIndex({tenantId:1,warehouseId:1},{unique:true});
  await db.collection("inventory_stock_balances").createIndex({tenantId:1,warehouseId:1,sku:1},{unique:true});
  await db.collection("inventory_stock_ledger").createIndex({tenantId:1,movementId:1,leg:1},{unique:true});
  await db.collection("inventory_reservations").createIndex({tenantId:1,reservationId:1},{unique:true});
  await db.collection("erp_accounts").createIndex({tenantId:1,accountCode:1},{unique:true});
  await db.collection("erp_fiscal_periods").createIndex({tenantId:1,periodId:1},{unique:true});
  await db.collection("erp_purchase_orders").createIndex({tenantId:1,orderNumber:1},{unique:true});
  await db.collection("erp_invoices").createIndex({tenantId:1,invoiceId:1},{unique:true});
  await db.collection("erp_journal_entries").createIndex({tenantId:1,entryNumber:1},{unique:true});
  await db.collection("erp_payment_allocations").createIndex({tenantId:1,paymentId:1,invoiceId:1},{unique:true});
  await db.collection("pos_terminals").createIndex({tenantId:1,terminalId:1},{unique:true});
  await db.collection("pos_cashier_shifts").createIndex({tenantId:1,shiftId:1},{unique:true});
  await db.collection("pos_cashier_shifts").createIndex({tenantId:1,terminalId:1},{unique:true,partialFilterExpression:{status:"open"}});
  await db.collection("pos_sales").createIndex({tenantId:1,saleId:1},{unique:true});
  await db.collection("pos_refunds").createIndex({tenantId:1,refundId:1},{unique:true});
  await db.collection("pos_offline_commands").createIndex({tenantId:1,terminalId:1,sequence:1},{unique:true});

  const tenantId="tenant-a",actorId="user-a";
  await createWarehouse(db,{tenantId,warehouseId:"warehouse-a",code:"WH-A",name:"Main Warehouse",status:"active"},actorId);
  await createWarehouse(db,{tenantId,warehouseId:"warehouse-b",code:"WH-B",name:"Overflow Warehouse",status:"active"},actorId);
  const receipt={tenantId,idempotencyKey:"stock-receipt-001",movementId:"movement-receipt-001",movementType:"receipt",sku:"SKU-1",warehouseId:"warehouse-a",quantityMilli:10000,referenceType:"purchase_receipt",referenceId:"receipt-1",occurredAt:"2026-11-19T08:00:00.000Z"};
  const receiptResult=await recordStockMovement(db,receipt,actorId);
  const receiptReplay=await recordStockMovement(db,receipt,actorId);
  assert.equal(receiptResult.replayed,false);
  assert.equal(receiptReplay.replayed,true);
  assert.equal(await db.collection("inventory_stock_ledger").countDocuments({tenantId}),1);

  await recordStockMovement(db,{...receipt,idempotencyKey:"stock-transfer-001",movementId:"movement-transfer-001",movementType:"transfer",warehouseId:"warehouse-a",destinationWarehouseId:"warehouse-b",quantityMilli:2000},actorId);
  let balance=await db.collection<any>("inventory_stock_balances").findOne({tenantId,warehouseId:"warehouse-b",sku:"SKU-1"});
  assert.equal(balance.quantityOnHandMilli,2000);
  await assert.rejects(()=>recordStockMovement(db,{...receipt,idempotencyKey:"stock-issue-001",movementId:"movement-issue-001",movementType:"issue",quantityMilli:9000},actorId),/INSUFFICIENT_STOCK_ON_HAND/);

  const reservation={tenantId,idempotencyKey:"stock-reserve-001",reservationId:"reservation-001",orderId:"order-001",warehouseId:"warehouse-a",lines:[{sku:"SKU-1",quantityMilli:3000}],status:"reserved",expiresAt:new Date(Date.now()+60_000).toISOString()};
  await reserveStock(db,reservation,actorId);
  balance=await db.collection<any>("inventory_stock_balances").findOne({tenantId,warehouseId:"warehouse-a",sku:"SKU-1"});
  assert.equal(balance.quantityAvailableMilli,5000);
  await commitReservation(db,tenantId,"reservation-001",actorId,"stock-commit-001");
  balance=await db.collection<any>("inventory_stock_balances").findOne({tenantId,warehouseId:"warehouse-a",sku:"SKU-1"});
  assert.equal(balance.quantityOnHandMilli,5000);
  assert.equal(balance.quantityReservedMilli,0);

  await createAccount(db,tenantId,actorId,{accountCode:"1000",name:"Cash",accountType:"asset",normalBalance:"debit"});
  await createAccount(db,tenantId,actorId,{accountCode:"4000",name:"Sales Revenue",accountType:"income",normalBalance:"credit"});
  await createFiscalPeriod(db,tenantId,actorId,{periodId:"FY26",periodCode:"FY26",startsAt:"2026-01-01T00:00:00.000Z",endsAt:"2026-12-31T23:59:59.999Z",status:"open"});
  await createPurchaseOrder(db,{tenantId,idempotencyKey:"purchase-order-001",orderNumber:"PO-001",supplierId:"supplier-1",warehouseId:"warehouse-a",currency:"UGX",orderedAt:"2026-11-19T08:00:00.000Z",lines:[{sku:"SKU-2",description:"Widget",quantityMilli:1000,unitPriceMinor:1000,taxRateBps:0}],totalMinor:1000,status:"submitted"},actorId);
  await postJournalEntry(db,{tenantId,idempotencyKey:"journal-entry-001",entryNumber:"JE-001",fiscalPeriodId:"FY26",sourceType:"manual",sourceId:"source-1",currency:"UGX",lines:[{accountCode:"1000",debitMinor:1000,creditMinor:0,currency:"UGX"},{accountCode:"4000",debitMinor:0,creditMinor:1000,currency:"UGX"}],status:"posted",postedAt:"2026-11-19T09:00:00.000Z"},actorId);
  assert.equal(await db.collection("erp_journal_entries").countDocuments({tenantId}),1);

  await createInvoice(db,{tenantId,idempotencyKey:"invoice-create-001",invoiceId:"invoice-001",invoiceNumber:"INV-001",invoiceType:"sales",partyId:"customer-1",currency:"UGX",issuedAt:"2026-11-19T08:00:00.000Z",dueAt:"2026-12-19T08:00:00.000Z",lines:[{description:"Consulting",quantityMilli:1000,unitPriceMinor:10000,discountMinor:0,taxRateBps:1800}],subtotalMinor:10000,taxMinor:1800,totalMinor:11800,status:"issued"},actorId);
  await allocateInvoicePayment(db,{tenantId,actorId,key:"invoice-payment-001",paymentId:"payment-001",invoiceId:"invoice-001",amountMinor:11800,currency:"UGX"});
  const invoice=await db.collection<any>("erp_invoices").findOne({tenantId,invoiceId:"invoice-001"});
  assert.equal(invoice.status,"paid");

  await registerPosTerminal(db,{tenantId,terminalId:"terminal-1",code:"T-1",locationId:"location-1",deviceId:"device-1",status:"active"},actorId);
  await openCashierShift(db,{tenantId,shiftId:"shift-1",terminalId:"terminal-1",cashierId:actorId,currency:"UGX",openedAt:"2026-11-19T08:00:00.000Z",openingFloatMinor:10000,status:"open"},actorId);
  await assert.rejects(()=>openCashierShift(db,{tenantId,shiftId:"shift-2",terminalId:"terminal-1",cashierId:"cashier-b",currency:"UGX",openedAt:"2026-11-19T08:01:00.000Z",openingFloatMinor:0,status:"open"},"cashier-b"),/POS_TERMINAL_SHIFT_ALREADY_OPEN/);
  await recordStockMovement(db,{...receipt,idempotencyKey:"pos-stock-001",movementId:"pos-stock-001",sku:"SKU-POS",quantityMilli:5000},actorId);
  await reserveStock(db,{tenantId,idempotencyKey:"pos-reserve-001",reservationId:"pos-reservation-001",orderId:"sale-001",warehouseId:"warehouse-a",lines:[{sku:"SKU-POS",quantityMilli:1000}],status:"reserved",expiresAt:new Date(Date.now()+60_000).toISOString()},actorId);
  const sale={tenantId,idempotencyKey:"pos-sale-001",saleId:"sale-001",reservationId:"pos-reservation-001",terminalId:"terminal-1",cashierId:actorId,currency:"UGX",lines:[{sku:"SKU-POS",description:"Widget",quantityMilli:1000,unitPriceMinor:2000,discountMinor:0,taxRateBps:0}],subtotalMinor:2000,taxMinor:0,totalMinor:2000,tenders:[{tenderId:"tender-1",method:"cash",amountMinor:2000,currency:"UGX",status:"captured"}],status:"completed",completedAt:"2026-11-19T10:00:00.000Z"};
  await completePosSale(db,sale,actorId);
  const posBalance=await db.collection<any>("inventory_stock_balances").findOne({tenantId,warehouseId:"warehouse-a",sku:"SKU-POS"});
  assert.equal(posBalance.quantityOnHandMilli,4000);
  await refundPosSale(db,{tenantId,idempotencyKey:"pos-refund-001",refundId:"refund-001",saleId:"sale-001",originalSaleTotalMinor:2000,amountMinor:1000,currency:"UGX",reason:"Partial return",status:"completed",completedAt:"2026-11-19T11:00:00.000Z"},actorId);
  await assert.rejects(()=>refundPosSale(db,{tenantId,idempotencyKey:"pos-refund-002",refundId:"refund-002",saleId:"sale-001",originalSaleTotalMinor:2000,amountMinor:1001,currency:"UGX",reason:"Excess return",status:"completed",completedAt:"2026-11-19T11:01:00.000Z"},actorId),/REFUNDS_EXCEED_SALE_TOTAL/);
  await closeCashierShift(db,tenantId,"shift-1",actorId,"shift-close-001",2000,2000);
  await acceptOfflinePosCommand(db,{tenantId,terminalId:"terminal-1",commandId:"offline-command-001",sequence:1,commandType:"sale",payload:{saleId:"offline-sale-1"},issuedAt:"2026-11-19T12:00:00.000Z"},actorId);
  assert.equal(await db.collection("pos_offline_commands").countDocuments({tenantId}),1);

  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=10);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=10);
  const foreignTenant=await db.collection("inventory_stock_balances").findOne({tenantId:"tenant-b",warehouseId:"warehouse-a",sku:"SKU-1"});
  assert.equal(foreignTenant,null);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
