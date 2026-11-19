import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createProject,createProjectTask,submitTimeEntry,decideTimeEntry} from "./project-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Projects and timesheets enforce employee/task ownership and independent approval",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_projects_it_"+Date.now());
 const tenantId="tenant-projects-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("projects").createIndex({tenantId:1,projectId:1},{unique:true}),
   db.collection("project_tasks").createIndex({tenantId:1,taskId:1},{unique:true}),
   db.collection("time_entries").createIndex({tenantId:1,timeEntryId:1},{unique:true})
  ]);
  await db.collection("hr_employees").insertOne({tenantId,organizationId:"org-projects-a",employeeId:"employee-001",userId:"employee-user",status:"active"});
  const project=await createProject(db,{
   tenantId,organizationId:"org-projects-a",projectId:"project-001",projectCode:"PRJ-001",name:"Customer rollout",
   managerUserId:"project-manager",startsAt:"2026-11-01T00:00:00.000Z",dueAt:"2026-12-31T00:00:00.000Z",
   budgetMinor:5000000,currency:"UGX",status:"active"
  },"project-manager","project-create-001");
  assert.equal((project.body as {projectId:string}).projectId,"project-001");
  const task=await createProjectTask(db,{
   tenantId,organizationId:"org-projects-a",projectId:"project-001",taskId:"task-001",name:"Implementation workshop",
   priority:"high",estimatedMinutes:480,status:"backlog"
  },"project-manager","project-task-create-001");
  assert.equal((task.body as {status:string}).status,"backlog");
  const entry=await submitTimeEntry(db,{
   tenantId,organizationId:"org-projects-a",timeEntryId:"time-entry-001",projectId:"project-001",taskId:"task-001",
   employeeId:"employee-001",workDate:"2026-11-19T00:00:00.000Z",minutes:240,billable:true,description:"Delivered implementation workshop",status:"submitted"
  },"employee-user","time-entry-submit-001");
  assert.equal((entry.body as {status:string}).status,"submitted");
  const decision={tenantId,organizationId:"org-projects-a",timeEntryId:"time-entry-001",decision:"approved" as const,reason:"Project manager reviewed and approved the submitted time",expectedVersion:0};
  await assert.rejects(()=>decideTimeEntry(db,decision,"employee-user","time-entry-self-approve"),/TIME_ENTRY_SELF_APPROVAL_DENIED/);
  const approved=await decideTimeEntry(db,decision,"project-manager","time-entry-approve-001");
  assert.deepEqual(approved.body,{timeEntryId:"time-entry-001",status:"approved",version:1});
  const replay=await decideTimeEntry(db,decision,"project-manager","time-entry-approve-001");
  assert.equal(replay.replayed,true);
  await assert.rejects(()=>decideTimeEntry(db,{...decision,decision:"rejected"},"project-manager","time-entry-stale"),/TIME_ENTRY_NOT_SUBMITTED|TIME_ENTRY_VERSION_CONFLICT/);
  assert.equal(await db.collection("time_entries").countDocuments({tenantId,organizationId:"org-projects-a",status:"approved"}),1);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=4);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=4);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
