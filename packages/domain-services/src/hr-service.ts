import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {HrEmployeeSchema,HrLeaveRequestSchema,HrLeaveDecisionSchema} from "@zuri/domain-contracts";
import {auditDomainMutation} from "./audit.js";

export async function createHrEmployee(db:Db,input:unknown,actorId:string,key:string){
 const employee=HrEmployeeSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:employee.tenantId,actorId,operation:"hr.employee.create",key,request:employee},async session=>{
  if(employee.managerEmployeeId){
   const manager=await db.collection("hr_employees").findOne({tenantId:employee.tenantId,organizationId:employee.organizationId,employeeId:employee.managerEmployeeId,status:"active"},{session,projection:{_id:1}});
   if(!manager)throw new Error("HR_MANAGER_NOT_FOUND");
  }
  const now=new Date();
  await db.collection("hr_employees").insertOne({...employee,startDate:new Date(employee.startDate),...(employee.endDate?{endDate:new Date(employee.endDate)}:{}),createdAt:now,updatedAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,employee.tenantId,actorId,"hr.employee.created","hr_employee",employee.employeeId,{organizationId:employee.organizationId,employeeNumber:employee.employeeNumber,employmentType:employee.employmentType});
  await appendOutboxEvent(db,session,{tenantId:employee.tenantId,eventType:"hr.employee.created",aggregateType:"hr_employee",aggregateId:employee.employeeId,payload:{employeeId:employee.employeeId,organizationId:employee.organizationId,departmentId:employee.departmentId,status:employee.status}});
  return {statusCode:201,body:{employeeId:employee.employeeId}};
 });
}
export async function createHrLeaveRequest(db:Db,input:unknown,actorId:string,key:string){
 const leave=HrLeaveRequestSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:leave.tenantId,actorId,operation:"hr.leave.request.create",key,request:leave},async session=>{
  const employee=await db.collection<{tenantId:string;organizationId:string;employeeId:string;userId?:string;status:string}>("hr_employees")
   .findOne({tenantId:leave.tenantId,organizationId:leave.organizationId,employeeId:leave.employeeId,status:"active"},{session});
  if(!employee)throw new Error("HR_ACTIVE_EMPLOYEE_NOT_FOUND");
  const now=new Date();
  await db.collection("hr_leave_requests").insertOne({...leave,startsAt:new Date(leave.startsAt),endsAt:new Date(leave.endsAt),requestedByUserId:actorId,version:0,createdAt:now,updatedAt:now},{session});
  await auditDomainMutation(db,session,leave.tenantId,actorId,"hr.leave.requested","hr_leave_request",leave.leaveRequestId,{organizationId:leave.organizationId,employeeId:leave.employeeId,leaveType:leave.leaveType,days:leave.days});
  await appendOutboxEvent(db,session,{tenantId:leave.tenantId,eventType:"hr.leave.requested",aggregateType:"hr_leave_request",aggregateId:leave.leaveRequestId,payload:{leaveRequestId:leave.leaveRequestId,organizationId:leave.organizationId,employeeId:leave.employeeId,leaveType:leave.leaveType,days:leave.days}});
  return {statusCode:201,body:{leaveRequestId:leave.leaveRequestId,status:"pending"}};
 });
}
export async function decideHrLeaveRequest(db:Db,input:unknown,actorId:string,key:string){
 const decision=HrLeaveDecisionSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:decision.tenantId,actorId,operation:"hr.leave.request.decide",key,request:decision},async session=>{
  const leave=await db.collection<any>("hr_leave_requests").findOne({tenantId:decision.tenantId,organizationId:decision.organizationId,leaveRequestId:decision.leaveRequestId},{session});
  if(!leave)throw new Error("HR_LEAVE_REQUEST_NOT_FOUND");
  if(leave.requestedByUserId===actorId)throw new Error("HR_LEAVE_SELF_APPROVAL_DENIED");
  if(leave.version!==decision.expectedVersion)throw new Error("HR_LEAVE_VERSION_CONFLICT");
  if(leave.status!=="pending")throw new Error("HR_LEAVE_REQUEST_NOT_PENDING");
  const employee=await db.collection<any>("hr_employees").findOne({tenantId:decision.tenantId,organizationId:decision.organizationId,employeeId:leave.employeeId},{session});
  if(employee?.userId===actorId)throw new Error("HR_LEAVE_SELF_APPROVAL_DENIED");
  const now=new Date();
  const result=await db.collection("hr_leave_requests").updateOne(
   {tenantId:decision.tenantId,organizationId:decision.organizationId,leaveRequestId:decision.leaveRequestId,status:"pending",version:decision.expectedVersion},
   {$set:{status:decision.decision,decisionReason:decision.reason,decidedByUserId:actorId,decidedAt:now,version:decision.expectedVersion+1,updatedAt:now}},{session}
  );
  if(result.matchedCount!==1)throw new Error("HR_LEAVE_VERSION_CONFLICT");
  await auditDomainMutation(db,session,decision.tenantId,actorId,"hr.leave."+decision.decision,"hr_leave_request",decision.leaveRequestId,{organizationId:decision.organizationId,employeeId:leave.employeeId,reason:decision.reason,version:decision.expectedVersion+1});
  await appendOutboxEvent(db,session,{tenantId:decision.tenantId,eventType:"hr.leave."+decision.decision,aggregateType:"hr_leave_request",aggregateId:decision.leaveRequestId,payload:{leaveRequestId:decision.leaveRequestId,organizationId:decision.organizationId,employeeId:leave.employeeId,decision:decision.decision,version:decision.expectedVersion+1}});
  return {statusCode:200,body:{leaveRequestId:decision.leaveRequestId,status:decision.decision,version:decision.expectedVersion+1}};
 });
}
