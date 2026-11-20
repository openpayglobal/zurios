import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {PurchaseOrderReceiptSchema,StockMovementSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";
import {recordStockMovementInSession} from "./inventory-service.js";

export async function receivePurchaseOrder(db:Db,input:unknown,actorId:string,key:string){
 const receipt=PurchaseOrderReceiptSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:receipt.tenantId,actorId,operation:"erp.purchase_order.receive",key,request:receipt},async session=>{
  const order=await db.collection<any>("erp_purchase_orders").findOne({
   tenantId:receipt.tenantId,organizationId:receipt.organizationId,orderNumber:receipt.purchaseOrderId,status:{$in:["approved","partially_received"]}
  },{session});
  if(!order)throw new Error("APPROVED_PURCHASE_ORDER_NOT_FOUND");
  const nextLines=order.lines.map((line:any)=>({...line}));
  for(const received of receipt.lines){
   const line=nextLines.find((candidate:any)=>candidate.sku===received.sku);
   if(!line)throw new Error("PURCHASE_ORDER_RECEIPT_SKU_NOT_ORDERED");
   const alreadyReceived=line.receivedQuantityMilli??0;
   if(alreadyReceived+received.quantityMilli>line.quantityMilli)throw new Error("PURCHASE_ORDER_RECEIPT_EXCEEDS_ORDERED");
   line.receivedQuantityMilli=alreadyReceived+received.quantityMilli;
   const movement=StockMovementSchema.parse({
    tenantId:receipt.tenantId,idempotencyKey:"goods-receipt-"+receipt.receiptId+"-"+received.sku,
    movementId:"goods-receipt-"+receipt.receiptId+"-"+received.sku,movementType:"receipt",
    sku:received.sku,warehouseId:order.warehouseId,quantityMilli:received.quantityMilli,
    unitCostMinor:line.unitPriceMinor,currency:order.currency,referenceType:"purchase_order_receipt",
    referenceId:receipt.receiptId,occurredAt:receipt.receivedAt
   });
   await recordStockMovementInSession(db,session,movement,actorId);
  }
  const fullyReceived=nextLines.every((line:any)=>(line.receivedQuantityMilli??0)>=line.quantityMilli);
  const now=new Date(),version=order.version??0;
  const update=await db.collection("erp_purchase_orders").updateOne(
   {tenantId:receipt.tenantId,organizationId:receipt.organizationId,orderNumber:receipt.purchaseOrderId,status:{$in:["approved","partially_received"]},version},
   {$set:{lines:nextLines,status:fullyReceived?"received":"partially_received",updatedAt:now,lastReceiptId:receipt.receiptId},$inc:{version:1}},{session}
  );
  if(update.matchedCount!==1)throw new Error("PURCHASE_ORDER_RECEIPT_CONCURRENT_MODIFICATION");
  await db.collection("erp_purchase_order_receipts").insertOne({...receipt,receivedAt:new Date(receipt.receivedAt),warehouseId:order.warehouseId,createdAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,receipt.tenantId,actorId,"erp.purchase_order.received","erp_purchase_order",receipt.purchaseOrderId,{organizationId:receipt.organizationId,receiptId:receipt.receiptId,warehouseId:order.warehouseId,lines:receipt.lines,status:fullyReceived?"received":"partially_received"});
  await appendOutboxEvent(db,session,{tenantId:receipt.tenantId,eventType:"erp.purchase_order.received",aggregateType:"purchase_order",aggregateId:receipt.purchaseOrderId,payload:{purchaseOrderId:receipt.purchaseOrderId,organizationId:receipt.organizationId,receiptId:receipt.receiptId,warehouseId:order.warehouseId,lines:receipt.lines,status:fullyReceived?"received":"partially_received"}});
  return {statusCode:201,body:{receiptId:receipt.receiptId,purchaseOrderId:receipt.purchaseOrderId,status:fullyReceived?"received":"partially_received",version:version+1}};
 });
}
