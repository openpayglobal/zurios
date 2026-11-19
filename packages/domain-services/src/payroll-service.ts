import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {PayrollRunSchema,PayrollApprovalSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createPayrollRun(db:Db,input:unknown,actorId:string,key:string){
 const run=PayrollRunSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:run.tenantId,actorId,operation:"payroll.run.create",key,request:run},async session=>{
  const employeeIds=run.lines.map(line=>line.employeeId);
  const employees=await db.collection("hr_employees").find({
   tenantId:run.tenantId,organizationId:run.organizationId,employeeId:{$in:employeeIds},status:"active"
  },{session,projection:{employeeId:1}}).toArray();
  if(employees.length!==employeeIds.length)throw new Error("PAYROLL_EMPLOYEE_SCOPE_OR_STATUS_INVALID");
  const now=new Date();
  await db.collection("payroll_runs").insertOne({...run,periodStart:new Date(run.periodStart),periodEnd:new Date(run.periodEnd),calculatedAt:new Date(run.calculatedAt),
   createdAt:now,updatedAt:now,createdByUserId:actorId,version:0},{session});
  await auditDomainMutation(db,session,run.tenantId,actorId,"payroll.run.created","payroll_run",run.payrollRunId,{
   organizationId:run.organizationId,jurisdiction:run.jurisdiction,currency:run.currency,rulesetVersion:run.rulesetVersion,
   employeeCount:run.lines.length,totalGrossMinor:run.totalGrossMinor,totalNetMinor:run.totalNetMinor
  });
  await appendOutboxEvent(db,session,{tenantId:run.tenantId,eventType:"payroll.run.created",aggregateType:"payroll_run",aggregateId:run.payrollRunId,
   payload:{payrollRunId:run.payrollRunId,organizationId:run.organizationId,employeeCount:run.lines.length,currency:run.currency,totalNetMinor:run.totalNetMinor}});
  return {statusCode:201,body:{payrollRunId:run.payrollRunId,status:"draft",version:0}};
 });
}
export async function approvePayrollRun(db:Db,input:unknown,actorId:string,key:string){
 const approval=PayrollApprovalSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:approval.tenantId,actorId,operation:"payroll.run.approve",key,request:approval},async session=>{
  const run=await db.collection<any>("payroll_runs").findOne({tenantId:approval.tenantId,organizationId:approval.organizationId,payrollRunId:approval.payrollRunId},{session});
  if(!run)throw new Error("PAYROLL_RUN_NOT_FOUND");
  if(run.createdByUserId===actorId)throw new Error("PAYROLL_SELF_APPROVAL_DENIED");
  if(run.status!=="draft")throw new Error("PAYROLL_RUN_NOT_DRAFT");
  if(run.version!==approval.expectedVersion)throw new Error("PAYROLL_VERSION_CONFLICT");
  const now=new Date();
  const result=await db.collection("payroll_runs").updateOne(
   {tenantId:approval.tenantId,organizationId:approval.organizationId,payrollRunId:approval.payrollRunId,status:"draft",version:approval.expectedVersion},
   {$set:{status:"approved",approvedByUserId:actorId,approvalReason:approval.reason,approvedAt:now,updatedAt:now,version:approval.expectedVersion+1}},{session}
  );
  if(result.matchedCount!==1)throw new Error("PAYROLL_VERSION_CONFLICT");
  await auditDomainMutation(db,session,approval.tenantId,actorId,"payroll.run.approved","payroll_run",approval.payrollRunId,{organizationId:approval.organizationId,reason:approval.reason,version:approval.expectedVersion+1});
  await appendOutboxEvent(db,session,{tenantId:approval.tenantId,eventType:"payroll.run.approved",aggregateType:"payroll_run",aggregateId:approval.payrollRunId,
   payload:{payrollRunId:approval.payrollRunId,organizationId:approval.organizationId,approvedByUserId:actorId,version:approval.expectedVersion+1}});
  return {statusCode:200,body:{payrollRunId:approval.payrollRunId,status:"approved",version:approval.expectedVersion+1}};
 });
}
