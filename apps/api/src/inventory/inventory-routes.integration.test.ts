import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {SignJWT} from "jose";
import {ensureCoreIndexes} from "@zuri/core-platform";
import {inventoryRoutes} from "./inventory-routes.js";
import type {AuthConfig} from "../platform/auth-service.js";

const uri=process.env.MONGODB_TEST_URI;
const config:AuthConfig={issuer:"https://zuri.inventory.test",audience:"zuri-inventory-test",jwtSecret:"inventory-test-secret-long-enough-for-ci",accessTokenTtlSeconds:300,sessionTtlSeconds:3600,mfaEncryptionKey:""};
const signingKey=new TextEncoder().encode(config.jwtSecret);

test("inventory API enforces tenant and organization scope, idempotency, ABAC and stock integrity",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_inventory_api_it_"+randomUUID().replaceAll("-","")),app=Fastify();
 try{
  await ensureCoreIndexes(db);
  const now=new Date(),tenantId="tenant-inventory-a",userId="inventory-user-a",membershipId="inventory-membership-a",sessionId="inventory-session-a";
  await db.collection("tenants").insertOne({tenantId,status:"active",slug:"inventory-a"});
  await db.collection("users").insertOne({userId,status:"active"});
  await db.collection("organizations").insertMany([
   {tenantId,organizationId:"org-inventory-a",code:"A",name:"Warehouse Org",status:"active",path:[]},
   {tenantId,organizationId:"org-inventory-b",code:"B",name:"Restricted Org",status:"active",path:[]}
  ]);
  const permissionKeys=["inventory.products.read","inventory.products.create","inventory.locations.read","inventory.locations.create","inventory.lots.create","inventory.movements.read","inventory.movements.create","inventory.transfers.create","inventory.adjustments.approve","inventory.balances.read"];
  await db.collection("roles").insertOne({tenantId,roleId:"inventory-manager-role",key:"inventory.manager",permissionKeys,status:"active"});
  await db.collection("memberships").insertOne({tenantId,membershipId,userId,organizationIds:["org-inventory-a"],locationIds:[],roleIds:["inventory-manager-role"],status:"active"});
  await db.collection("sessions").insertOne({tenantId,sessionId,userId,membershipId,expiresAt:new Date(now.getTime()+60_000),lastUsedAt:now});
  await db.collection("stock_locations").insertOne({tenantId,stockLocationId:"restricted-stock-location",organizationId:"org-inventory-b",code:"RESTRICTED",name:"Restricted",type:"warehouse",status:"active"});
  await app.register(inventoryRoutes(db,config),{prefix:"/v1"});await app.ready();
  const token=await new SignJWT({tenantId,membershipId,sessionId}).setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience).setSubject(userId).setIssuedAt().setExpirationTime("5m").sign(signingKey);
  const headers={authorization:"Bearer "+token};
  const productPayload={sku:"SKU-100",name:"Inventory Test Item",baseUnitCode:"EA"};
  const createProduct=()=>app.inject({method:"POST",url:"/v1/inventory/products",headers:{...headers,"idempotency-key":"inventory-product-create-0001"},payload:productPayload});
  const product=await createProduct(),productReplay=await createProduct();
  assert.equal(product.statusCode,201);assert.equal(productReplay.statusCode,201);assert.equal(productReplay.headers["idempotency-replayed"],"true");
  const productId=product.json().data.productId as string;
  const createLocation=async(code:string)=>app.inject({method:"POST",url:"/v1/inventory/locations",headers:{...headers,"idempotency-key":"inventory-location-"+code+"-0001"},payload:{organizationId:"org-inventory-a",code,name:"Warehouse "+code,type:"warehouse"}});
  const source=await createLocation("WH-A"),destination=await createLocation("WH-B");
  assert.equal(source.statusCode,201);assert.equal(destination.statusCode,201);
  const sourceId=source.json().data.stockLocationId as string,destinationId=destination.json().data.stockLocationId as string;
  const receiptPayload={productId,stockLocationId:sourceId,movementType:"receipt",quantity:"10.5",unitCode:"EA",source:{type:"goods_receipt",id:"GRN-001"}};
  const receipt=()=>app.inject({method:"POST",url:"/v1/inventory/movements",headers:{...headers,"idempotency-key":"inventory-receipt-0001"},payload:receiptPayload});
  const received=await receipt(),receivedReplay=await receipt();
  assert.equal(received.statusCode,201);assert.equal(receivedReplay.statusCode,201);assert.equal(receivedReplay.headers["idempotency-replayed"],"true");
  const issue=await app.inject({method:"POST",url:"/v1/inventory/movements",headers:{...headers,"idempotency-key":"inventory-issue-0001"},payload:{productId,stockLocationId:sourceId,movementType:"issue",quantity:"4",unitCode:"EA",source:{type:"sale",id:"SALE-001"}}});
  assert.equal(issue.statusCode,201);
  const balance=await app.inject({method:"GET",url:"/v1/inventory/balances?productId="+productId+"&stockLocationId="+sourceId,headers});
  assert.equal(balance.statusCode,200);assert.equal(balance.json().data.quantityOnHand,"6.5");
  const insufficient=await app.inject({method:"POST",url:"/v1/inventory/movements",headers:{...headers,"idempotency-key":"inventory-issue-0002"},payload:{productId,stockLocationId:sourceId,movementType:"issue",quantity:"7",unitCode:"EA",source:{type:"sale",id:"SALE-002"}}});
  assert.equal(insufficient.statusCode,422);assert.equal(insufficient.json().error,"INSUFFICIENT_STOCK");
  const transfer=await app.inject({method:"POST",url:"/v1/inventory/movements",headers:{...headers,"idempotency-key":"inventory-transfer-0001"},payload:{productId,stockLocationId:sourceId,destinationStockLocationId:destinationId,movementType:"transfer",quantity:"2",unitCode:"EA",source:{type:"stock_transfer",id:"TRANSFER-001"}}});
  assert.equal(transfer.statusCode,201);
  const sourceBalance=await app.inject({method:"GET",url:"/v1/inventory/balances?productId="+productId+"&stockLocationId="+sourceId,headers});
  const destinationBalance=await app.inject({method:"GET",url:"/v1/inventory/balances?productId="+productId+"&stockLocationId="+destinationId,headers});
  assert.equal(sourceBalance.json().data.quantityOnHand,"4.5");assert.equal(destinationBalance.json().data.quantityOnHand,"2");
  const forbiddenLocation=await app.inject({method:"POST",url:"/v1/inventory/movements",headers:{...headers,"idempotency-key":"inventory-cross-org-0001"},payload:{productId,stockLocationId:"restricted-stock-location",movementType:"issue",quantity:"1",unitCode:"EA",source:{type:"sale",id:"SALE-003"}}});
  assert.equal(forbiddenLocation.statusCode,403);
  await db.collection("policies").insertOne({tenantId,policyId:"deny-inventory-products",key:"deny-inventory-products",effect:"deny",priority:100,subject:{userId},resource:{resourceType:"inventory_api"},actions:["inventory.products.read"],conditions:{},status:"active"});
  const abacDenied=await app.inject({method:"GET",url:"/v1/inventory/products",headers});
  assert.equal(abacDenied.statusCode,403);assert.equal(abacDenied.json().error,"ABAC_POLICY_DENIED");
  assert.equal(await db.collection("stock_movements").countDocuments({tenantId}),4);
  assert.equal(await db.collection("outbox_events").countDocuments({tenantId}),5);
 }finally{await app.close();await db.dropDatabase();await client.close();}
});
