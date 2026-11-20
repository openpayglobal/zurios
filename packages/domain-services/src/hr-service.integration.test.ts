import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createHrEmployee,createHrLeaveRequest,decideHrLeaveRequest} from "./hr-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("HR services enforce organization-owned employees and two-person leave approval",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_hr_it_"+Date.now());
 const tenantId="tenant-hr-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("hr_employees").createIndex({tenantId:1,employeeId:1},{unique:true}),
   db.collection("hr_leave_requests").createIndex({tenantId:1,leaveRequestId:1},{unique:true})
  ]);
  await createHrEmployee(db,{
   tenantId,organizationId:"org-hr-a",employeeId:"employee-001",employeeNumber:"EMP-001",userId:"employee-user",
   firstName:"Amina",lastName:"N.",workEmail:"amina.hr@example.test",departmentId:"operations",positionTitle:"Operations Officer",
   employmentType:"permanent",status:"active",startDate:"2025-01-01T00:00:00.000Z"
  },"hr-admin","hr-employee-create-001");
  const request=await createHrLeaveRequest(db,{
   tenantId,organizationId:"org-hr-a",leaveRequestId:"leave-001",employeeId:"employee-001",leaveType:"annual",
   startsAt:"2026-12-01T00:00:00.000Z",endsAt:"2026-12-05T00:00:00.000Z",days:5,status:"pending"
  },"employee-user","hr-leave-request-001");
  assert.equal((request.body as {status:string}).status,"pending");
  await assert.rejects(()=>decideHrLeaveRequest(db,{
   tenantId,organizationId:"org-hr-a",leaveRequestId:"leave-001",decision:"approved",
   reason:"Self approval is not allowed",expectedVersion:0
  },"employee-user","hr-leave-self-approve"),/HR_LEAVE_SELF_APPROVAL_DENIED/);
  const approved=await decideHrLeaveRequest(db,{
   tenantId,organizationId:"org-hr-a",leaveRequestId:"leave-001",decision:"approved",
   reason:"Coverage confirmed and manager approval recorded",expectedVersion:0
  },"hr-manager","hr-leave-approve-001");
  assert.deepEqual(approved.body,{leaveRequestId:"leave-001",status:"approved",version:1});
  const replay=await decideHrLeaveRequest(db,{
   tenantId,organizationId:"org-hr-a",leaveRequestId:"leave-001",decision:"approved",
   reason:"Coverage confirmed and manager approval recorded",expectedVersion:0
  },"hr-manager","hr-leave-approve-001");
  assert.equal(replay.replayed,true);
  await assert.rejects(()=>createHrLeaveRequest(db,{
   tenantId,organizationId:"org-hr-b",leaveRequestId:"leave-cross-org",employeeId:"employee-001",leaveType:"annual",
   startsAt:"2026-12-10T00:00:00.000Z",endsAt:"2026-12-11T00:00:00.000Z",days:2,status:"pending"
  },"employee-user","hr-leave-cross-org"),/HR_ACTIVE_EMPLOYEE_NOT_FOUND/);
  assert.equal(await db.collection("hr_leave_requests").countDocuments({tenantId,organizationId:"org-hr-a",status:"approved"}),1);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=3);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=3);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
