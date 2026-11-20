import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {getOperationalAnalytics} from "./analytics-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Operational analytics is restricted to the selected tenant, organization and period",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_analytics_it_"+Date.now());
 const from="2026-11-01T00:00:00.000Z",to="2026-11-30T23:59:59.999Z";
 const inPeriod=new Date("2026-11-15T12:00:00.000Z");
 try{
  await db.collection("erp_invoices").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",invoiceId:"invoice-1",status:"issued",createdAt:inPeriod},
   {tenantId:"tenant-a",organizationId:"org-a",invoiceId:"invoice-2",status:"paid",createdAt:inPeriod},
   {tenantId:"tenant-a",organizationId:"org-b",invoiceId:"invoice-3",status:"issued",createdAt:inPeriod},
   {tenantId:"tenant-b",organizationId:"org-a",invoiceId:"invoice-4",status:"issued",createdAt:inPeriod},
   {tenantId:"tenant-a",organizationId:"org-a",invoiceId:"invoice-5",status:"issued",createdAt:new Date("2026-10-31T23:59:59.999Z")}
  ]);
  await db.collection("hr_employees").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",employeeId:"employee-1",status:"active",createdAt:inPeriod},
   {tenantId:"tenant-a",organizationId:"org-a",employeeId:"employee-2",status:"inactive",createdAt:inPeriod},
   {tenantId:"tenant-b",organizationId:"org-a",employeeId:"employee-3",status:"active",createdAt:inPeriod}
  ]);
  await db.collection("payment_intents").insertOne({tenantId:"tenant-a",organizationId:"org-a",paymentId:"payment-1",status:"pending",createdAt:inPeriod});
  const report=await getOperationalAnalytics(db,{tenantId:"tenant-a",organizationId:"org-a",from,to});
  assert.equal(report.metrics.invoices,2);
  assert.equal(report.metrics.openInvoices,1);
  assert.equal(report.metrics.employees,2);
  assert.equal(report.metrics.activeEmployees,1);
  assert.equal(report.metrics.pendingPayments,1);
  await assert.rejects(()=>getOperationalAnalytics(db,{tenantId:"tenant-a",organizationId:"org-a",from:to,to:from}));
 }finally{await db.dropDatabase();await client.close();}
});
