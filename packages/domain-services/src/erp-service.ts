import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {auditDomainMutation} from "./audit.js";
import {AccountSchema,FiscalPeriodSchema,InvoiceSchema,JournalEntrySchema,PurchaseOrderSchema} from "@zuri/domain-contracts";

export async function createAccount(db:Db,tenantId:string,actorId:string,input:unknown,idempotencyKey?:string){
 const account=AccountSchema.parse(input);
 return runIdempotentMutation(db,{tenantId,actorId,operation:"erp.account.create",key:idempotencyKey??"account-"+tenantId+"-"+account.accountCode,request:account},async session=>{
  const now=new Date();
  await db.collection("erp_accounts").insertOne({tenantId,...account,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,tenantId,actorId,"erp.account.created","erp_account",account.accountCode);
  return {statusCode:201,body:{accountCode:account.accountCode}};
 });
}
export async function createFiscalPeriod(db:Db,tenantId:string,actorId:string,input:Record<string,unknown>,idempotencyKey?:string){
 const period=FiscalPeriodSchema.parse({...input,tenantId});
 return runIdempotentMutation(db,{tenantId,actorId,operation:"erp.fiscal_period.create",key:idempotencyKey??"period-"+tenantId+"-"+period.periodId,request:period},async session=>{
  const overlap=await db.collection("erp_fiscal_periods").findOne({tenantId,startsAt:{$lte:new Date(period.endsAt)},endsAt:{$gte:new Date(period.startsAt)}},{session});
  if(overlap)throw new Error("FISCAL_PERIOD_OVERLAP");
  await db.collection("erp_fiscal_periods").insertOne({...period,startsAt:new Date(period.startsAt),endsAt:new Date(period.endsAt),createdAt:new Date(),createdBy:actorId},{session});
  await auditDomainMutation(db,session,tenantId,actorId,"erp.fiscal_period.created","erp_fiscal_period",period.periodId);
  return {statusCode:201,body:{periodId:period.periodId}};
 });
}
export async function createPurchaseOrder(db:Db,input:unknown,actorId:string){
 const order=PurchaseOrderSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:order.tenantId,actorId,operation:"erp.purchase_order.create",key:order.idempotencyKey,request:order},async session=>{
  const now=new Date();
  await db.collection("erp_purchase_orders").insertOne({...order,orderedAt:new Date(order.orderedAt),...(order.expectedAt?{expectedAt:new Date(order.expectedAt)}:{}),createdAt:now,updatedAt:now,createdBy:actorId,version:0},{session});
  await auditDomainMutation(db,session,order.tenantId,actorId,"erp.purchase_order.created","erp_purchase_order",order.orderNumber,{supplierId:order.supplierId,totalMinor:order.totalMinor,currency:order.currency});
  if(order.status==="submitted")await appendOutboxEvent(db,session,{tenantId:order.tenantId,eventType:"erp.purchase_order.submitted",aggregateType:"purchase_order",aggregateId:order.orderNumber,payload:{orderNumber:order.orderNumber,supplierId:order.supplierId,warehouseId:order.warehouseId,totalMinor:order.totalMinor,currency:order.currency}});
  return {statusCode:201,body:{orderNumber:order.orderNumber}};
 });
}
export async function createInvoice(db:Db,input:unknown,actorId:string){
 const invoice=InvoiceSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:invoice.tenantId,actorId,operation:"erp.invoice.create",key:invoice.idempotencyKey,request:invoice},async session=>{
  const now=new Date();
  await db.collection("erp_invoices").insertOne({...invoice,issuedAt:new Date(invoice.issuedAt),dueAt:new Date(invoice.dueAt),paidMinor:0,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,invoice.tenantId,actorId,"erp.invoice.created","erp_invoice",invoice.invoiceId,{invoiceType:invoice.invoiceType,totalMinor:invoice.totalMinor,currency:invoice.currency});
  if(invoice.status==="issued")await appendOutboxEvent(db,session,{tenantId:invoice.tenantId,eventType:"erp.invoice.issued",aggregateType:"invoice",aggregateId:invoice.invoiceId,payload:{invoiceId:invoice.invoiceId,invoiceNumber:invoice.invoiceNumber,invoiceType:invoice.invoiceType,totalMinor:invoice.totalMinor,currency:invoice.currency}});
  return {statusCode:201,body:{invoiceId:invoice.invoiceId}};
 });
}
export async function postJournalEntry(db:Db,input:unknown,actorId:string){
 const entry=JournalEntrySchema.parse(input);
 if(entry.status!=="posted")throw new Error("JOURNAL_ENTRY_MUST_BE_POSTED");
 return runIdempotentMutation(db,{tenantId:entry.tenantId,actorId,operation:"erp.journal.post",key:entry.idempotencyKey,request:entry},async session=>{
  const postedAt=entry.postedAt?new Date(entry.postedAt):new Date();
  const period=await db.collection<any>("erp_fiscal_periods").findOne({tenantId:entry.tenantId,periodId:entry.fiscalPeriodId,status:"open",startsAt:{$lte:postedAt},endsAt:{$gte:postedAt}},{session});
  if(!period)throw new Error("FISCAL_PERIOD_NOT_OPEN_FOR_POSTING_DATE");
  const codes=[...new Set(entry.lines.map(line=>line.accountCode))];
  const accounts=await db.collection("erp_accounts").find({tenantId:entry.tenantId,accountCode:{$in:codes},status:"active"},{session}).toArray();
  if(accounts.length!==codes.length)throw new Error("JOURNAL_ACCOUNT_NOT_ACTIVE");
  const now=new Date();
  await db.collection("erp_journal_entries").insertOne({...entry,postedAt,createdAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,entry.tenantId,actorId,"erp.journal.posted","erp_journal_entry",entry.entryNumber,{fiscalPeriodId:entry.fiscalPeriodId,currency:entry.currency});
  await appendOutboxEvent(db,session,{tenantId:entry.tenantId,eventType:"erp.journal.posted",aggregateType:"journal_entry",aggregateId:entry.entryNumber,payload:{entryNumber:entry.entryNumber,fiscalPeriodId:entry.fiscalPeriodId,sourceType:entry.sourceType,sourceId:entry.sourceId,currency:entry.currency,lines:entry.lines}});
  return {statusCode:201,body:{entryNumber:entry.entryNumber,status:"posted"}};
 });
}
export async function allocateInvoicePayment(db:Db,input:{tenantId:string;actorId:string;key:string;paymentId:string;invoiceId:string;amountMinor:number;currency:string}){
 const d=input;
 if(!Number.isSafeInteger(d.amountMinor)||d.amountMinor<=0)throw new Error("INVALID_PAYMENT_AMOUNT");
 return runIdempotentMutation(db,{tenantId:d.tenantId,actorId:d.actorId,operation:"erp.invoice.payment.allocate",key:d.key,request:{paymentId:d.paymentId,invoiceId:d.invoiceId,amountMinor:d.amountMinor,currency:d.currency}},async session=>{
  const invoice=await db.collection<any>("erp_invoices").findOne({tenantId:d.tenantId,invoiceId:d.invoiceId},{session});
  if(!invoice||invoice.status==="void"||invoice.status==="draft")throw new Error("INVOICE_NOT_PAYABLE");
  if(invoice.currency!==d.currency)throw new Error("PAYMENT_CURRENCY_MISMATCH");
  const paid=invoice.paidMinor??0;
  if(paid+d.amountMinor>invoice.totalMinor)throw new Error("PAYMENT_EXCEEDS_INVOICE_BALANCE");
  const now=new Date(),nextPaid=paid+d.amountMinor,status=nextPaid===invoice.totalMinor?"paid":"partially_paid";
  await db.collection("erp_payment_allocations").insertOne({tenantId:d.tenantId,paymentId:d.paymentId,invoiceId:d.invoiceId,amountMinor:d.amountMinor,currency:d.currency,allocatedAt:now,createdBy:d.actorId},{session});
  const update=await db.collection("erp_invoices").updateOne({tenantId:d.tenantId,invoiceId:d.invoiceId,paidMinor:paid},{$set:{paidMinor:nextPaid,status,updatedAt:now}},{session});
  if(update.matchedCount!==1)throw new Error("INVOICE_PAYMENT_CONCURRENT_MODIFICATION");
  await auditDomainMutation(db,session,d.tenantId,d.actorId,"erp.invoice.payment_allocated","erp_payment_allocation",d.paymentId,{invoiceId:d.invoiceId,amountMinor:d.amountMinor,currency:d.currency});
  await appendOutboxEvent(db,session,{tenantId:d.tenantId,eventType:"erp.invoice.payment_allocated",aggregateType:"invoice",aggregateId:d.invoiceId,payload:{paymentId:d.paymentId,invoiceId:d.invoiceId,amountMinor:d.amountMinor,currency:d.currency,paidMinor:nextPaid,status}});
  return {statusCode:201,body:{invoiceId:d.invoiceId,paidMinor:nextPaid,status}};
 });
}
