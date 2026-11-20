import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createPurchaseOrder} from "./erp-service.js";
import {receivePurchaseOrder} from "./procurement-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Goods receipts atomically update purchase order quantities and stock ledger",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_procurement_it_"+Date.now());
 const tenantId="tenant-procurement-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("inventory_warehouses").createIndex({tenantId:1,warehouseId:1},{unique:true}),
   db.collection("inventory_stock_balances").createIndex({tenantId:1,warehouseId:1,sku:1},{unique:true}),
   db.collection("inventory_stock_ledger").createIndex({tenantId:1,movementId:1,leg:1},{unique:true}),
   db.collection("erp_purchase_orders").createIndex({tenantId:1,orderNumber:1},{unique:true}),
   db.collection("erp_purchase_order_receipts").createIndex({tenantId:1,receiptId:1},{unique:true})
  ]);
  await db.collection("inventory_warehouses").insertOne({tenantId,warehouseId:"warehouse-001",status:"active"});
  await createPurchaseOrder(db,{
   tenantId,organizationId:"org-procurement-a",idempotencyKey:"po-create-procurement-001",orderNumber:"PO-PROC-001",
   supplierId:"supplier-001",warehouseId:"warehouse-001",currency:"UGX",orderedAt:"2026-11-01T00:00:00.000Z",
   lines:[{sku:"SKU-RECEIPT",description:"Received stock",quantityMilli:2000,unitPriceMinor:1000,taxRateBps:0}],
   totalMinor:2000,status:"approved"
  },"buyer-user");
  const receipt1={tenantId,organizationId:"org-procurement-a",receiptId:"receipt-001",purchaseOrderId:"PO-PROC-001",
   receivedAt:"2026-11-19T10:00:00.000Z",lines:[{sku:"SKU-RECEIPT",quantityMilli:1000}]};
  const partial=await receivePurchaseOrder(db,receipt1,"warehouse-user","goods-receipt-001");
  assert.equal((partial.body as {status:string}).status,"partially_received");
  const replay=await receivePurchaseOrder(db,receipt1,"warehouse-user","goods-receipt-001");
  assert.equal(replay.replayed,true);
  let balance=await db.collection<any>("inventory_stock_balances").findOne({tenantId,warehouseId:"warehouse-001",sku:"SKU-RECEIPT"});
  assert.equal(balance.quantityOnHandMilli,1000);
  const receipt2=await receivePurchaseOrder(db,{...receipt1,receiptId:"receipt-002",lines:[{sku:"SKU-RECEIPT",quantityMilli:1000}]},"warehouse-user","goods-receipt-002");
  assert.equal((receipt2.body as {status:string}).status,"received");
  balance=await db.collection<any>("inventory_stock_balances").findOne({tenantId,warehouseId:"warehouse-001",sku:"SKU-RECEIPT"});
  assert.equal(balance.quantityOnHandMilli,2000);
  const order=await db.collection<any>("erp_purchase_orders").findOne({tenantId,orderNumber:"PO-PROC-001"});
  assert.equal(order.status,"received");
  assert.equal(order.lines[0].receivedQuantityMilli,2000);
  assert.equal(await db.collection("inventory_stock_ledger").countDocuments({tenantId}),2);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=5);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=4);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
