import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createCommerceProduct,createCommerceOrder} from "./commerce-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Commerce orders use catalog prices and require matching stock reservations",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_commerce_it_"+Date.now());
 const tenantId="tenant-commerce-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("commerce_products").createIndex({tenantId:1,productId:1},{unique:true}),
   db.collection("commerce_orders").createIndex({tenantId:1,orderId:1},{unique:true})
  ]);
  await createCommerceProduct(db,{
   tenantId,organizationId:"org-commerce-a",productId:"product-001",sku:"SKU-001",name:"Catalog item",
   currency:"UGX",unitPriceMinor:10000,taxRateBps:1800,status:"active"
  },"commerce-user","commerce-product-001");
  await db.collection("inventory_reservations").insertOne({
   tenantId,reservationId:"reservation-commerce-001",warehouseId:"warehouse-001",orderId:"order-commerce-001",
   lines:[{sku:"SKU-001",quantityMilli:2000}],status:"reserved"
  });
  const order={tenantId,organizationId:"org-commerce-a",orderId:"order-commerce-001",customerId:"customer-001",
   warehouseId:"warehouse-001",reservationId:"reservation-commerce-001",lines:[{sku:"SKU-001",quantityMilli:2000}],status:"placed"};
  const placed=await createCommerceOrder(db,order,"commerce-user","commerce-order-001");
  assert.deepEqual(placed.body,{orderId:"order-commerce-001",status:"placed",subtotalMinor:20000,taxMinor:3600,totalMinor:23600,currency:"UGX"});
  const replay=await createCommerceOrder(db,order,"commerce-user","commerce-order-001");
  assert.equal(replay.replayed,true);
  const stored=await db.collection<any>("commerce_orders").findOne({tenantId,orderId:"order-commerce-001"});
  assert.equal(stored.lines[0].unitPriceMinor,10000,"client cannot override catalog price");
  await assert.rejects(()=>createCommerceOrder(db,{...order,orderId:"order-wrong-reservation",reservationId:"reservation-commerce-001"},"commerce-user","commerce-order-002"),/COMMERCE_ACTIVE_STOCK_RESERVATION_REQUIRED/);
  await assert.rejects(()=>createCommerceOrder(db,{...order,orderId:"order-no-product",reservationId:"reservation-commerce-001",lines:[{sku:"UNKNOWN",quantityMilli:1000}]},"commerce-user","commerce-order-003"),/COMMERCE_ACTIVE_STOCK_RESERVATION_REQUIRED|COMMERCE_PRODUCT_NOT_AVAILABLE/);
  assert.equal(await db.collection("commerce_orders").countDocuments({tenantId}),1);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=2);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=2);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
