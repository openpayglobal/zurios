import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createPayrollRun,approvePayrollRun} from "./payroll-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Payroll services reconcile provider-calculated runs and enforce independent approval",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_payroll_it_"+Date.now());
 const tenantId="tenant-payroll-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("hr_employees").createIndex({tenantId:1,organizationId:1,employeeId:1},{unique:true}),
   db.collection("payroll_runs").createIndex({tenantId:1,payrollRunId:1},{unique:true})
  ]);
  await db.collection("hr_employees").insertOne({tenantId,organizationId:"org-payroll-a",employeeId:"employee-001",status:"active"});
  const run={
   tenantId,organizationId:"org-payroll-a",payrollRunId:"payroll-001",
   periodStart:"2026-11-01T00:00:00.000Z",periodEnd:"2026-11-30T23:59:59.999Z",
   jurisdiction:"UG",currency:"UGX",calculationProvider:"approved-external-engine",rulesetVersion:"UG-PAYROLL-2026-11",
   calculatedAt:"2026-11-19T10:00:00.000Z",
   lines:[{employeeId:"employee-001",grossMinor:100000,statutoryDeductionMinor:10000,voluntaryDeductionMinor:5000,employerContributionMinor:8000,netMinor:85000}],
   totalGrossMinor:100000,totalStatutoryDeductionsMinor:10000,totalVoluntaryDeductionsMinor:5000,totalEmployerContributionsMinor:8000,totalNetMinor:85000,status:"draft"
  };
  const created=await createPayrollRun(db,run,"payroll-maker","payroll-create-001");
  assert.deepEqual(created.body,{payrollRunId:"payroll-001",status:"draft",version:0});
  const replay=await createPayrollRun(db,run,"payroll-maker","payroll-create-001");
  assert.equal(replay.replayed,true);
  await assert.rejects(()=>createPayrollRun(db,{...run,payrollRunId:"invalid-payroll",totalNetMinor:84000},"payroll-maker","payroll-invalid"),/ZodError|reconcile/i);
  const approval={tenantId,organizationId:"org-payroll-a",payrollRunId:"payroll-001",reason:"Payroll calculations and employee totals independently reviewed",expectedVersion:0};
  await assert.rejects(()=>approvePayrollRun(db,approval,"payroll-maker","payroll-self-approve"),/PAYROLL_SELF_APPROVAL_DENIED/);
  const approved=await approvePayrollRun(db,approval,"payroll-approver","payroll-approve-001");
  assert.deepEqual(approved.body,{payrollRunId:"payroll-001",status:"approved",version:1});
  const persisted=await db.collection<any>("payroll_runs").findOne({tenantId,payrollRunId:"payroll-001"});
  assert.equal(persisted.status,"approved");
  assert.equal(persisted.approvedByUserId,"payroll-approver");
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=2);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=2);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
