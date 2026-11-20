import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {WorkflowDefinitionSchema,WorkflowRunStartSchema,WorkflowTaskDecisionSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createWorkflowDefinition(db:Db,input:unknown,actorId:string,key:string){
 const definition=WorkflowDefinitionSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:definition.tenantId,actorId,operation:"workflows.definition.create",key,request:definition},async session=>{
  const now=new Date();
  await db.collection("workflow_definitions").insertOne({...definition,createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,definition.tenantId,actorId,"workflows.definition.created","workflow_definition",definition.workflowId,{organizationId:definition.organizationId,version:definition.version,triggerType:definition.triggerType,stepCount:definition.steps.length});
  await appendOutboxEvent(db,session,{tenantId:definition.tenantId,eventType:"workflows.definition.created",aggregateType:"workflow_definition",aggregateId:definition.workflowId,payload:{workflowId:definition.workflowId,organizationId:definition.organizationId,version:definition.version}});
  return {statusCode:201,body:{workflowId:definition.workflowId,status:definition.status,version:definition.version}};
 });
}
export async function startWorkflowRun(db:Db,input:unknown,actorId:string,key:string){
 const start=WorkflowRunStartSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:start.tenantId,actorId,operation:"workflows.run.start",key,request:start},async session=>{
  const definition=await db.collection<any>("workflow_definitions").findOne({tenantId:start.tenantId,organizationId:start.organizationId,workflowId:start.workflowId,status:"active"},{session});
  if(!definition)throw new Error("ACTIVE_WORKFLOW_NOT_FOUND");
  const now=new Date();
  await db.collection("workflow_runs").insertOne({...start,status:"running",requestedByUserId:actorId,workflowVersion:definition.version,startedAt:now,createdAt:now,updatedAt:now},{session});
  const tasks=definition.steps.map((step:any,index:number)=>({
   tenantId:start.tenantId,organizationId:start.organizationId,taskId:start.runId+"-"+step.stepId,runId:start.runId,workflowId:start.workflowId,
   stepId:step.stepId,stepIndex:index,stepType:step.stepType,assigneeUserIds:step.assigneeUserIds??[],
   requiredApprovals:step.requiredApprovals??1,approvals:[],status:index===0?"pending":"queued",version:0,createdAt:now,updatedAt:now
  }));
  await db.collection("workflow_tasks").insertMany(tasks,{session});
  await auditDomainMutation(db,session,start.tenantId,actorId,"workflows.run.started","workflow_run",start.runId,{organizationId:start.organizationId,workflowId:start.workflowId,taskCount:tasks.length});
  await appendOutboxEvent(db,session,{tenantId:start.tenantId,eventType:"workflows.run.started",aggregateType:"workflow_run",aggregateId:start.runId,payload:{runId:start.runId,organizationId:start.organizationId,workflowId:start.workflowId,taskCount:tasks.length}});
  return {statusCode:201,body:{runId:start.runId,workflowId:start.workflowId,status:"running",taskCount:tasks.length}};
 });
}
export async function decideWorkflowTask(db:Db,input:unknown,actorId:string,key:string){
 const decision=WorkflowTaskDecisionSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:decision.tenantId,actorId,operation:"workflows.task.decide",key,request:decision},async session=>{
  const task=await db.collection<any>("workflow_tasks").findOne({tenantId:decision.tenantId,organizationId:decision.organizationId,taskId:decision.taskId},{session});
  if(!task)throw new Error("WORKFLOW_TASK_NOT_FOUND");
  const run=await db.collection<any>("workflow_runs").findOne({tenantId:decision.tenantId,organizationId:decision.organizationId,runId:task.runId},{session});
  if(!run)throw new Error("WORKFLOW_RUN_NOT_FOUND");
  if(run.requestedByUserId===actorId)throw new Error("WORKFLOW_SELF_APPROVAL_DENIED");
  if(task.assigneeUserIds?.length&&!task.assigneeUserIds.includes(actorId))throw new Error("WORKFLOW_TASK_NOT_ASSIGNED");
  if(task.status!=="pending")throw new Error("WORKFLOW_TASK_NOT_PENDING");
  if(task.version!==decision.expectedVersion)throw new Error("WORKFLOW_TASK_VERSION_CONFLICT");
  const approvals=[...(task.approvals??[])];
  if(decision.decision==="approved"){
   if(approvals.includes(actorId))throw new Error("WORKFLOW_DUPLICATE_APPROVAL");
   approvals.push(actorId);
  }
  const nextStatus=decision.decision==="rejected"?"rejected":approvals.length>=task.requiredApprovals?"approved":"pending";
  const now=new Date();
  const result=await db.collection("workflow_tasks").updateOne(
   {tenantId:decision.tenantId,organizationId:decision.organizationId,taskId:decision.taskId,status:"pending",version:decision.expectedVersion},
   {$set:{status:nextStatus,approvals,decisionReason:decision.reason,updatedAt:now,lastDecidedByUserId:actorId},$inc:{version:1}},{session}
  );
  if(result.matchedCount!==1)throw new Error("WORKFLOW_TASK_VERSION_CONFLICT");
  let runStatus:"running"|"completed"|"rejected"="running";
  if(decision.decision==="rejected"){
   runStatus="rejected";
   await db.collection("workflow_tasks").updateMany({tenantId:decision.tenantId,organizationId:decision.organizationId,runId:task.runId,status:"queued"},
    {$set:{status:"cancelled",updatedAt:now}},{session});
  }else if(nextStatus==="approved"){
   const nextTask=await db.collection<any>("workflow_tasks").find({tenantId:decision.tenantId,organizationId:decision.organizationId,runId:task.runId,stepIndex:{$gt:task.stepIndex},status:"queued"},{session}).sort({stepIndex:1}).limit(1).next();
   if(nextTask){
    await db.collection("workflow_tasks").updateOne({tenantId:decision.tenantId,organizationId:decision.organizationId,taskId:nextTask.taskId,status:"queued"},
     {$set:{status:"pending",activatedAt:now,updatedAt:now}},{session});
    await appendOutboxEvent(db,session,{tenantId:decision.tenantId,eventType:"workflows.task.activated",aggregateType:"workflow_task",aggregateId:nextTask.taskId,payload:{taskId:nextTask.taskId,runId:task.runId,organizationId:decision.organizationId,stepIndex:nextTask.stepIndex}});
   }else{
    const remaining=await db.collection("workflow_tasks").countDocuments({tenantId:decision.tenantId,organizationId:decision.organizationId,runId:task.runId,status:{$ne:"approved"}},{session});
    if(remaining===0)runStatus="completed";
   }
  }
  await db.collection("workflow_runs").updateOne({tenantId:decision.tenantId,organizationId:decision.organizationId,runId:task.runId,status:"running"},
   {$set:{status:runStatus,updatedAt:now,...(runStatus==="completed"||runStatus==="rejected"?{completedAt:now}:{})}},{session});
  await auditDomainMutation(db,session,decision.tenantId,actorId,"workflows.task."+decision.decision,"workflow_task",decision.taskId,{organizationId:decision.organizationId,runId:task.runId,approvals,requiredApprovals:task.requiredApprovals,taskStatus:nextStatus,runStatus,reason:decision.reason});
  await appendOutboxEvent(db,session,{tenantId:decision.tenantId,eventType:"workflows.task."+decision.decision,aggregateType:"workflow_task",aggregateId:decision.taskId,payload:{taskId:decision.taskId,runId:task.runId,organizationId:decision.organizationId,taskStatus:nextStatus,runStatus,approvals}});
  return {statusCode:200,body:{taskId:decision.taskId,runId:task.runId,taskStatus:nextStatus,runStatus,approvals:approvals.length,version:decision.expectedVersion+1}};
 });
}
