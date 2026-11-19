import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {PaymentIntentSchema,PaymentProviderEventSchema,PaymentRefundRequestSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";
import {allocateInvoicePayment} from "./erp-service.js";

export async function createPaymentIntent(db:Db,input:unknown,actorId:string,key:string){
 const intent=PaymentIntentSchema.parse(input);
 if(intent.referenceType!=="invoice")throw new Error("PAYMENT_REFERENCE_TYPE_NOT_SUPPORTED");
 return runIdempotentMutation(db,{tenantId:intent.tenantId,actorId,operation:"payments.intent.create",key,request:intent},async session=>{
  const provider=await db.collection("payment_provider_configs").findOne({tenantId:intent.tenantId,organizationId:intent.organizationId,providerId:intent.providerId,status:"active"},{session,projection:{_id:1}});
  if(!provider)throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  const invoice=await db.collection<any>("erp_invoices").findOne({tenantId:intent.tenantId,organizationId:intent.organizationId,invoiceId:intent.referenceId},{session});
  if(!invoice||invoice.status==="draft"||invoice.status==="void")throw new Error("INVOICE_NOT_PAYABLE");
  if(invoice.currency!==intent.currency)throw new Error("PAYMENT_CURRENCY_MISMATCH");
  if((invoice.paidMinor??0)+intent.amountMinor>invoice.totalMinor)throw new Error("PAYMENT_EXCEEDS_INVOICE_BALANCE");
  const now=new Date();
  await db.collection("payment_intents").insertOne({...intent,createdAt:now,updatedAt:now,createdBy:actorId,version:0},{session});
  await auditDomainMutation(db,session,intent.tenantId,actorId,"payments.intent.created","payment_intent",intent.paymentId,{organizationId:intent.organizationId,providerId:intent.providerId,referenceType:intent.referenceType,referenceId:intent.referenceId,amountMinor:intent.amountMinor,currency:intent.currency});
  await appendOutboxEvent(db,session,{tenantId:intent.tenantId,eventType:"payments.intent.created",aggregateType:"payment_intent",aggregateId:intent.paymentId,payload:{paymentId:intent.paymentId,organizationId:intent.organizationId,providerId:intent.providerId,amountMinor:intent.amountMinor,currency:intent.currency}});
  return {statusCode:201,body:{paymentId:intent.paymentId,status:"pending",version:0}};
 });
}

export async function recordVerifiedPaymentProviderEvent(
 db:Db,input:unknown,actorId:string,verifySignature:(event:ReturnType<typeof PaymentProviderEventSchema.parse>)=>Promise<boolean>
){
 const event=PaymentProviderEventSchema.parse(input);
 if(!(await verifySignature(event)))throw new Error("PAYMENT_PROVIDER_SIGNATURE_INVALID");
 const result=await runIdempotentMutation(db,{tenantId:event.tenantId,actorId,operation:"payments.provider.event",key:event.providerId+"-"+event.providerEventId,request:event},async session=>{
  const intent=await db.collection<any>("payment_intents").findOne({tenantId:event.tenantId,organizationId:event.organizationId,paymentId:event.paymentId,providerId:event.providerId},{session});
  if(!intent)throw new Error("PAYMENT_INTENT_NOT_FOUND");
  if(intent.amountMinor!==event.amountMinor||intent.currency!==event.currency)throw new Error("PAYMENT_EVENT_AMOUNT_MISMATCH");
  const allowed:Record<string,string[]>={pending:["authorized","captured","failed","cancelled"],authorized:["captured","failed","cancelled"]};
  if(!allowed[intent.status]?.includes(event.eventType))throw new Error("PAYMENT_STATE_TRANSITION_INVALID");
  const now=new Date();
  await db.collection("payment_provider_events").insertOne({...event,occurredAt:new Date(event.occurredAt),receivedAt:now,signatureVerified:true,actorId},{session});
  const update=await db.collection("payment_intents").updateOne(
   {tenantId:event.tenantId,organizationId:event.organizationId,paymentId:event.paymentId,status:intent.status,version:intent.version},
   {$set:{status:event.eventType,providerReference:event.providerReference??intent.providerReference,updatedAt:now,lastProviderEventId:event.providerEventId},$inc:{version:1}},{session}
  );
  if(update.matchedCount!==1)throw new Error("PAYMENT_STATE_CONCURRENT_MODIFICATION");
  await auditDomainMutation(db,session,event.tenantId,actorId,"payments.provider."+event.eventType,"payment_intent",event.paymentId,{organizationId:event.organizationId,providerId:event.providerId,providerEventId:event.providerEventId,amountMinor:event.amountMinor,currency:event.currency});
  await appendOutboxEvent(db,session,{tenantId:event.tenantId,eventType:"payments.provider."+event.eventType,aggregateType:"payment_intent",aggregateId:event.paymentId,payload:{paymentId:event.paymentId,organizationId:event.organizationId,providerId:event.providerId,providerEventId:event.providerEventId,amountMinor:event.amountMinor,currency:event.currency}});
  return {statusCode:200,body:{paymentId:event.paymentId,status:event.eventType,version:intent.version+1}};
 });
 if(event.eventType==="captured"){
  const intent=await db.collection<any>("payment_intents").findOne({tenantId:event.tenantId,organizationId:event.organizationId,paymentId:event.paymentId});
  if(intent?.referenceType==="invoice"){
   await allocateInvoicePayment(db,{tenantId:event.tenantId,actorId,key:"payment-capture-"+event.paymentId,paymentId:event.paymentId,invoiceId:intent.referenceId,amountMinor:event.amountMinor,currency:event.currency});
  }
 }
 return result;
}

export async function requestPaymentRefund(db:Db,input:unknown,actorId:string,key:string){
 const refund=PaymentRefundRequestSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:refund.tenantId,actorId,operation:"payments.refund.request",key,request:refund},async session=>{
  const intent=await db.collection<any>("payment_intents").findOne({tenantId:refund.tenantId,organizationId:refund.organizationId,paymentId:refund.paymentId,status:"captured"},{session});
  if(!intent)throw new Error("CAPTURED_PAYMENT_NOT_FOUND");
  const existing=await db.collection<any>("payment_refund_requests").aggregate([
   {$match:{tenantId:refund.tenantId,paymentId:refund.paymentId,status:{$in:["pending","approved","completed"]}}},
   {$group:{_id:null,total:{$sum:"$amountMinor"}}}
  ],{session}).toArray();
  const alreadyRequested=existing[0]?.total??0;
  if(alreadyRequested+refund.amountMinor>intent.amountMinor)throw new Error("REFUNDS_EXCEED_CAPTURED_PAYMENT");
  const now=new Date();
  await db.collection("payment_refund_requests").insertOne({...refund,createdAt:now,updatedAt:now,requestedByUserId:actorId,version:0},{session});
  await auditDomainMutation(db,session,refund.tenantId,actorId,"payments.refund.requested","payment_refund",refund.refundId,{organizationId:refund.organizationId,paymentId:refund.paymentId,amountMinor:refund.amountMinor,reason:refund.reason});
  await appendOutboxEvent(db,session,{tenantId:refund.tenantId,eventType:"payments.refund.requested",aggregateType:"payment_refund",aggregateId:refund.refundId,payload:{refundId:refund.refundId,organizationId:refund.organizationId,paymentId:refund.paymentId,amountMinor:refund.amountMinor}});
  return {statusCode:202,body:{refundId:refund.refundId,status:"pending"}};
 });
}
