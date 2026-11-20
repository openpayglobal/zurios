import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createPaymentIntent,recordVerifiedPaymentProviderEvent,requestPaymentRefund} from "./payment-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Payments require configured providers and verified events before invoice reconciliation",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_payments_it_"+Date.now());
 const tenantId="tenant-payments-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("payment_intents").createIndex({tenantId:1,paymentId:1},{unique:true}),
   db.collection("payment_provider_events").createIndex({tenantId:1,providerId:1,providerEventId:1},{unique:true}),
   db.collection("erp_payment_allocations").createIndex({tenantId:1,paymentId:1,invoiceId:1},{unique:true})
  ]);
  await db.collection("payment_provider_configs").insertOne({tenantId,organizationId:"org-payments-a",providerId:"test-provider",status:"active"});
  await db.collection("erp_invoices").insertOne({tenantId,organizationId:"org-payments-a",invoiceId:"invoice-payments-001",currency:"UGX",totalMinor:50000,paidMinor:0,status:"issued"});
  const intent=await createPaymentIntent(db,{
   tenantId,organizationId:"org-payments-a",paymentId:"payment-001",providerId:"test-provider",
   referenceType:"invoice",referenceId:"invoice-payments-001",amountMinor:50000,currency:"UGX",status:"pending"
  },"payments-user","payment-intent-001");
  assert.equal((intent.body as {status:string}).status,"pending");
  const eventBase={tenantId,organizationId:"org-payments-a",providerId:"test-provider",paymentId:"payment-001",amountMinor:50000,currency:"UGX",occurredAt:"2026-11-19T10:00:00.000Z"};
  await assert.rejects(()=>recordVerifiedPaymentProviderEvent(db,{...eventBase,providerEventId:"event-invalid",eventType:"captured"},"payments-user",async()=>false),/PAYMENT_PROVIDER_SIGNATURE_INVALID/);
  const authorized=await recordVerifiedPaymentProviderEvent(db,{...eventBase,providerEventId:"event-authorized",eventType:"authorized"},"payments-user",async()=>true);
  assert.equal((authorized.body as {status:string}).status,"authorized");
  const captured=await recordVerifiedPaymentProviderEvent(db,{...eventBase,providerEventId:"event-captured",eventType:"captured",providerReference:"provider-ref-001"},"payments-user",async()=>true);
  assert.equal((captured.body as {status:string}).status,"captured");
  const replay=await recordVerifiedPaymentProviderEvent(db,{...eventBase,providerEventId:"event-captured",eventType:"captured",providerReference:"provider-ref-001"},"payments-user",async()=>true);
  assert.equal(replay.replayed,true);
  const invoice=await db.collection<any>("erp_invoices").findOne({tenantId,invoiceId:"invoice-payments-001"});
  assert.equal(invoice.paidMinor,50000);
  assert.equal(invoice.status,"paid");
  const refund=await requestPaymentRefund(db,{
   tenantId,organizationId:"org-payments-a",refundId:"refund-001",paymentId:"payment-001",amountMinor:10000,reason:"Customer returned one item",status:"pending"
  },"payments-user","payment-refund-001");
  assert.equal((refund.body as {status:string}).status,"pending");
  await assert.rejects(()=>requestPaymentRefund(db,{
   tenantId,organizationId:"org-payments-a",refundId:"refund-too-large",paymentId:"payment-001",amountMinor:45000,reason:"Additional refund request",status:"pending"
  },"payments-user","payment-refund-002"),/REFUNDS_EXCEED_CAPTURED_PAYMENT/);
  assert.equal(await db.collection("payment_provider_events").countDocuments({tenantId}),2);
  assert.ok(await db.collection("erp_payment_allocations").countDocuments({tenantId})===1);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=4);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=4);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
