import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {ProjectSchema,ProjectTaskSchema,TimeEntrySchema,TimeEntryDecisionSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createProject(db:Db,input:unknown,actorId:string,key:string){
 const project=ProjectSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:project.tenantId,actorId,operation:"projects.project.create",key,request:project},async session=>{
  const now=new Date();
  await db.collection("projects").insertOne({...project,startsAt:new Date(project.startsAt),...(project.dueAt?{dueAt:new Date(project.dueAt)}:{}),createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,project.tenantId,actorId,"projects.project.created","project",project.projectId,{organizationId:project.organizationId,projectCode:project.projectCode,budgetMinor:project.budgetMinor,currency:project.currency});
  await appendOutboxEvent(db,session,{tenantId:project.tenantId,eventType:"projects.project.created",aggregateType:"project",aggregateId:project.projectId,payload:{projectId:project.projectId,organizationId:project.organizationId,projectCode:project.projectCode,status:project.status}});
  return {statusCode:201,body:{projectId:project.projectId,status:project.status}};
 });
}
export async function createProjectTask(db:Db,input:unknown,actorId:string,key:string){
 const task=ProjectTaskSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:task.tenantId,actorId,operation:"projects.task.create",key,request:task},async session=>{
  const project=await db.collection("projects").findOne({tenantId:task.tenantId,organizationId:task.organizationId,projectId:task.projectId,status:"active"},{session,projection:{_id:1}});
  if(!project)throw new Error("ACTIVE_PROJECT_NOT_FOUND");
  const now=new Date();
  await db.collection("project_tasks").insertOne({...task,...(task.dueAt?{dueAt:new Date(task.dueAt)}:{}),createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,task.tenantId,actorId,"projects.task.created","project_task",task.taskId,{organizationId:task.organizationId,projectId:task.projectId,priority:task.priority});
  await appendOutboxEvent(db,session,{tenantId:task.tenantId,eventType:"projects.task.created",aggregateType:"project_task",aggregateId:task.taskId,payload:{taskId:task.taskId,projectId:task.projectId,organizationId:task.organizationId}});
  return {statusCode:201,body:{taskId:task.taskId,status:"backlog"}};
 });
}
export async function submitTimeEntry(db:Db,input:unknown,actorId:string,key:string){
 const entry=TimeEntrySchema.parse(input);
 return runIdempotentMutation(db,{tenantId:entry.tenantId,actorId,operation:"projects.time_entry.submit",key,request:entry},async session=>{
  const [employee,task]=await Promise.all([
   db.collection("hr_employees").findOne({tenantId:entry.tenantId,organizationId:entry.organizationId,employeeId:entry.employeeId,status:"active"},{session,projection:{_id:1,userId:1}}),
   db.collection("project_tasks").findOne({tenantId:entry.tenantId,organizationId:entry.organizationId,projectId:entry.projectId,taskId:entry.taskId},{session,projection:{_id:1}})
  ]);
  if(!employee)throw new Error("ACTIVE_PROJECT_EMPLOYEE_NOT_FOUND");
  if(!task)throw new Error("PROJECT_TASK_NOT_FOUND");
  const now=new Date();
  await db.collection("time_entries").insertOne({...entry,workDate:new Date(entry.workDate),submittedByUserId:actorId,version:0,createdAt:now,updatedAt:now},{session});
  await auditDomainMutation(db,session,entry.tenantId,actorId,"projects.time_entry.submitted","time_entry",entry.timeEntryId,{organizationId:entry.organizationId,projectId:entry.projectId,taskId:entry.taskId,employeeId:entry.employeeId,minutes:entry.minutes,billable:entry.billable});
  await appendOutboxEvent(db,session,{tenantId:entry.tenantId,eventType:"projects.time_entry.submitted",aggregateType:"time_entry",aggregateId:entry.timeEntryId,payload:{timeEntryId:entry.timeEntryId,organizationId:entry.organizationId,projectId:entry.projectId,employeeId:entry.employeeId,minutes:entry.minutes}});
  return {statusCode:201,body:{timeEntryId:entry.timeEntryId,status:"submitted",version:0}};
 });
}
export async function decideTimeEntry(db:Db,input:unknown,actorId:string,key:string){
 const decision=TimeEntryDecisionSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:decision.tenantId,actorId,operation:"projects.time_entry.decide",key,request:decision},async session=>{
  const entry=await db.collection<any>("time_entries").findOne({tenantId:decision.tenantId,organizationId:decision.organizationId,timeEntryId:decision.timeEntryId},{session});
  if(!entry)throw new Error("TIME_ENTRY_NOT_FOUND");
  if(entry.submittedByUserId===actorId)throw new Error("TIME_ENTRY_SELF_APPROVAL_DENIED");
  if(entry.status!=="submitted")throw new Error("TIME_ENTRY_NOT_SUBMITTED");
  if(entry.version!==decision.expectedVersion)throw new Error("TIME_ENTRY_VERSION_CONFLICT");
  const employee=await db.collection<any>("hr_employees").findOne({tenantId:decision.tenantId,organizationId:decision.organizationId,employeeId:entry.employeeId},{session});
  if(employee?.userId===actorId)throw new Error("TIME_ENTRY_SELF_APPROVAL_DENIED");
  const now=new Date();
  const result=await db.collection("time_entries").updateOne(
   {tenantId:decision.tenantId,organizationId:decision.organizationId,timeEntryId:decision.timeEntryId,status:"submitted",version:decision.expectedVersion},
   {$set:{status:decision.decision,decisionReason:decision.reason,decidedByUserId:actorId,decidedAt:now,updatedAt:now,version:decision.expectedVersion+1}},{session}
  );
  if(result.matchedCount!==1)throw new Error("TIME_ENTRY_VERSION_CONFLICT");
  await auditDomainMutation(db,session,decision.tenantId,actorId,"projects.time_entry."+decision.decision,"time_entry",decision.timeEntryId,{organizationId:decision.organizationId,projectId:entry.projectId,employeeId:entry.employeeId,reason:decision.reason,version:decision.expectedVersion+1});
  await appendOutboxEvent(db,session,{tenantId:decision.tenantId,eventType:"projects.time_entry."+decision.decision,aggregateType:"time_entry",aggregateId:decision.timeEntryId,payload:{timeEntryId:decision.timeEntryId,organizationId:decision.organizationId,decision:decision.decision,version:decision.expectedVersion+1}});
  return {statusCode:200,body:{timeEntryId:decision.timeEntryId,status:decision.decision,version:decision.expectedVersion+1}};
 });
}
