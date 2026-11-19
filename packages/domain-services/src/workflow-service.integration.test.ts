import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createWorkflowDefinition,startWorkflowRun,decideWorkflowTask} from "./workflow-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("Workflow approvals support assigned multi-approver tasks and requester separation",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_workflows_it_"+Date.now());
 const tenantId="tenant-workflows-a";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("workflow_definitions").createIndex({tenantId:1,workflowId:1},{unique:true}),
   db.collection("workflow_runs").createIndex({tenantId:1,runId:1},{unique:true}),
   db.collection("workflow_tasks").createIndex({tenantId:1,taskId:1},{unique:true})
  ]);
  const definition=await createWorkflowDefinition(db,{
   tenantId,organizationId:"org-workflows-a",workflowId:"workflow-001",name:"Purchase approval",
   triggerType:"manual",steps:[{stepId:"finance-review",stepType:"approval",assigneeUserIds:["approver-a","approver-b"],requiredApprovals:2}],
   version:1,status:"active"
  },"workflow-admin","workflow-definition-001");
  assert.equal((definition.body as {status:string}).status,"active");
  const started=await startWorkflowRun(db,{
   tenantId,organizationId:"org-workflows-a",runId:"workflow-run-001",workflowId:"workflow-001",context:{purchaseOrderId:"PO-001"}
  },"requester-user","workflow-run-start-001");
  assert.equal((started.body as {taskCount:number}).taskCount,1);
  const decision={tenantId,organizationId:"org-workflows-a",taskId:"workflow-run-001-finance-review",decision:"approved" as const,reason:"Finance review completed with supporting documents",expectedVersion:0};
  await assert.rejects(()=>decideWorkflowTask(db,decision,"requester-user","workflow-self-approval"),/WORKFLOW_SELF_APPROVAL_DENIED/);
  await assert.rejects(()=>decideWorkflowTask(db,decision,"approver-c","workflow-unassigned"),/WORKFLOW_TASK_NOT_ASSIGNED/);
  const first=await decideWorkflowTask(db,decision,"approver-a","workflow-approval-a");
  assert.deepEqual(first.body,{taskId:"workflow-run-001-finance-review",runId:"workflow-run-001",taskStatus:"pending",runStatus:"running",approvals:1,version:1});
  await assert.rejects(()=>decideWorkflowTask(db,{...decision,expectedVersion:1},"approver-a","workflow-duplicate-approval"),/WORKFLOW_DUPLICATE_APPROVAL/);
  const second=await decideWorkflowTask(db,{...decision,expectedVersion:1},"approver-b","workflow-approval-b");
  assert.equal((second.body as {taskStatus:string}).taskStatus,"approved");
  assert.equal((second.body as {runStatus:string}).runStatus,"completed");
  const run=await db.collection<any>("workflow_runs").findOne({tenantId,runId:"workflow-run-001"});
  assert.equal(run.status,"completed");
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=4);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=4);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
