import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createInventoryProduct,createStockLocation,createStockLot,getStockBalance,recordStockMovement} from "./inventory-service.js";
import {ensureCoreIndexes} from "./indexes.js";
import {newId} from "./ids.js";

const uri=process.env.MONGODB_TEST_URI;
async function transaction<T>(client:MongoClient,work:(session:import("mongodb").ClientSession)=>Promise<T>):Promise<T>{
 const session=client.startSession();let output:T|undefined;
 try{await session.withTransaction(async()=>{output=await work(session);});if(output===undefined)throw new Error("TEST_TRANSACTION_RESULT_MISSING");return output;}
 finally{await session.endSession();}
}

test("inventory maintains immutable movements and atomic Decimal128 balances", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_inventory_it_"+newId("run").replaceAll("_",""));
 try{
  await ensureCoreIndexes(db);
  const tenantId="tenant_inventory_a",actorId="user_inventory_a",organizationId="org_inventory_a";
  await db.collection("organizations").insertOne({tenantId,organizationId,code:"MAIN",name:"Main",type:"company",status:"active",path:[],createdAt:new Date(),updatedAt:new Date(),createdBy:actorId,updatedBy:actorId});
  const product=await transaction(client,session=>createInventoryProduct(db,tenantId,actorId,{sku:"SKU-001",name:"Test Product",baseUnitCode:"EA"},session));
  const source=await transaction(client,session=>createStockLocation(db,tenantId,actorId,{organizationId,code:"WH-A",name:"Warehouse A",type:"warehouse"},session));
  const destination=await transaction(client,session=>createStockLocation(db,tenantId,actorId,{organizationId,code:"WH-B",name:"Warehouse B",type:"warehouse"},session));
  await transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:source.stockLocationId,movementType:"receipt",quantity:"10.125",unitCode:"EA",source:{type:"goods_receipt",id:"grn-1"},idempotencyKey:"receipt-grn-1"},session));
  await transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:source.stockLocationId,movementType:"issue",quantity:"4.125",unitCode:"EA",source:{type:"sale",id:"sale-1"},idempotencyKey:"issue-sale-1"},session));
  assert.equal((await getStockBalance(db,tenantId,product.productId,source.stockLocationId)).quantityOnHand,"6.000");
  await assert.rejects(()=>transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:source.stockLocationId,movementType:"issue",quantity:"7",unitCode:"EA",source:{type:"sale",id:"sale-2"},idempotencyKey:"issue-sale-2"},session)),/INSUFFICIENT_STOCK/);
  await transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:source.stockLocationId,destinationStockLocationId:destination.stockLocationId,movementType:"transfer",quantity:"2.5",unitCode:"EA",source:{type:"stock_transfer",id:"transfer-1"},idempotencyKey:"transfer-1"},session));
  assert.equal((await getStockBalance(db,tenantId,product.productId,source.stockLocationId)).quantityOnHand,"3.500");
  assert.equal((await getStockBalance(db,tenantId,product.productId,destination.stockLocationId)).quantityOnHand,"2.5");
  assert.equal(await db.collection("stock_movements").countDocuments({tenantId}),4);
  await assert.rejects(()=>transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:source.stockLocationId,movementType:"receipt",quantity:"1",unitCode:"EA",source:{type:"goods_receipt",id:"grn-1"},idempotencyKey:"receipt-grn-1"},session)),/STOCK_MOVEMENT_ALREADY_RECORDED/);
  assert.equal((await getStockBalance(db,"tenant_inventory_b",product.productId,source.stockLocationId)).quantityOnHand,"0");
 }finally{await db.dropDatabase();await client.close();}
});

test("inventory enforces lot tracking and rejects unsupported serial tracking", {skip:!uri}, async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_inventory_lot_it_"+newId("run").replaceAll("_",""));
 try{
  await ensureCoreIndexes(db);
  const tenantId="tenant_inventory_lot",actorId="user_inventory_lot",organizationId="org_inventory_lot";
  await db.collection("organizations").insertOne({tenantId,organizationId,code:"MAIN",name:"Main",type:"company",status:"active",path:[],createdAt:new Date(),updatedAt:new Date(),createdBy:actorId,updatedBy:actorId});
  const product=await transaction(client,session=>createInventoryProduct(db,tenantId,actorId,{sku:"LOT-001",name:"Lot Product",baseUnitCode:"KG",trackLot:true},session));
  const location=await transaction(client,session=>createStockLocation(db,tenantId,actorId,{organizationId,code:"LOT-WH",name:"Lot Warehouse"},session));
  await assert.rejects(()=>transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:location.stockLocationId,movementType:"receipt",quantity:"1",unitCode:"KG",source:{type:"goods_receipt",id:"grn-lot"},idempotencyKey:"lot-missing-1"},session)),/LOT_REQUIRED/);
  const lot=await transaction(client,session=>createStockLot(db,tenantId,actorId,{productId:product.productId,lotNumber:"BATCH-001",expiryDate:"2027-12-31T00:00:00.000Z"},session));
  await transaction(client,session=>recordStockMovement(db,tenantId,actorId,{productId:product.productId,stockLocationId:location.stockLocationId,movementType:"receipt",quantity:"5",unitCode:"KG",lotId:lot.lotId,source:{type:"goods_receipt",id:"grn-lot"},idempotencyKey:"lot-receipt-1"},session));
  assert.equal((await getStockBalance(db,tenantId,product.productId,location.stockLocationId,lot.lotId)).quantityOnHand,"5");
  await assert.rejects(()=>transaction(client,session=>createInventoryProduct(db,tenantId,actorId,{sku:"SERIAL-001",name:"Serial Product",baseUnitCode:"EA",trackSerial:true},session)));
 }finally{await db.dropDatabase();await client.close();}
});
