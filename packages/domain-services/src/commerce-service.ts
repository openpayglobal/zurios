import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {CommerceProductSchema,CommerceOrderRequestSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createCommerceProduct(db:Db,input:unknown,actorId:string,key:string){
 const product=CommerceProductSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:product.tenantId,actorId,operation:"commerce.product.create",key,request:product},async session=>{
  const now=new Date();
  await db.collection("commerce_products").insertOne({...product,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,product.tenantId,actorId,"commerce.product.created","commerce_product",product.productId,{organizationId:product.organizationId,sku:product.sku,currency:product.currency,unitPriceMinor:product.unitPriceMinor});
  await appendOutboxEvent(db,session,{tenantId:product.tenantId,eventType:"commerce.product.created",aggregateType:"commerce_product",aggregateId:product.productId,payload:{productId:product.productId,organizationId:product.organizationId,sku:product.sku,currency:product.currency}});
  return {statusCode:201,body:{productId:product.productId}};
 });
}
export async function createCommerceOrder(db:Db,input:unknown,actorId:string,key:string){
 const order=CommerceOrderRequestSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:order.tenantId,actorId,operation:"commerce.order.create",key,request:order},async session=>{
  const reservation=await db.collection<any>("inventory_reservations").findOne({
   tenantId:order.tenantId,reservationId:order.reservationId,warehouseId:order.warehouseId,orderId:order.orderId,status:"reserved"
  },{session});
  if(!reservation)throw new Error("COMMERCE_ACTIVE_STOCK_RESERVATION_REQUIRED");
  const products=await db.collection<any>("commerce_products").find({
   tenantId:order.tenantId,organizationId:order.organizationId,sku:{$in:order.lines.map(line=>line.sku)},status:"active"
  },{session}).toArray();
  if(products.length!==order.lines.length)throw new Error("COMMERCE_PRODUCT_NOT_AVAILABLE");
  const productBySku=new Map(products.map(product=>[product.sku,product]));
  const lines=order.lines.map(line=>{
   const product=productBySku.get(line.sku)!;
   const gross=Math.round(line.quantityMilli*product.unitPriceMinor/1000);
   const tax=Math.round(gross*product.taxRateBps/10000);
   return {sku:line.sku,name:product.name,quantityMilli:line.quantityMilli,unitPriceMinor:product.unitPriceMinor,taxRateBps:product.taxRateBps,lineSubtotalMinor:gross,lineTaxMinor:tax};
  });
  const currencies=new Set(products.map(product=>product.currency));
  if(currencies.size!==1)throw new Error("COMMERCE_ORDER_CURRENCY_MISMATCH");
  const currency=products[0].currency as string;
  const subtotalMinor=lines.reduce((sum,line)=>sum+line.lineSubtotalMinor,0);
  const taxMinor=lines.reduce((sum,line)=>sum+line.lineTaxMinor,0);
  const totalMinor=subtotalMinor+taxMinor;
  const now=new Date();
  await db.collection("commerce_orders").insertOne({...order,lines,currency,subtotalMinor,taxMinor,totalMinor,status:"placed",placedAt:now,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,order.tenantId,actorId,"commerce.order.placed","commerce_order",order.orderId,{organizationId:order.organizationId,customerId:order.customerId,reservationId:order.reservationId,totalMinor,currency});
  await appendOutboxEvent(db,session,{tenantId:order.tenantId,eventType:"commerce.order.placed",aggregateType:"commerce_order",aggregateId:order.orderId,payload:{orderId:order.orderId,organizationId:order.organizationId,customerId:order.customerId,reservationId:order.reservationId,totalMinor,currency,lines}});
  return {statusCode:201,body:{orderId:order.orderId,status:"placed",subtotalMinor,taxMinor,totalMinor,currency}};
 });
}
