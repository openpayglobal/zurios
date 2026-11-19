import type {Db} from "mongodb";
import type {FastifyPluginAsync,FastifyRequest,FastifyReply} from "fastify";
import {ZodError,z} from "zod";
import {authenticate} from "./auth-middleware.js";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";
import {authorizeDomainResource,type DomainResourceScope} from "./domain-authorization.js";
import {appendAuditEvent,evaluatePolicy} from "@zuri/core-platform";
import {createWarehouse,recordStockMovement,reserveStock,commitReservation,releaseReservation,registerPosTerminal,openCashierShift,closeCashierShift,completePosSale,refundPosSale,acceptOfflinePosCommand,createAccount,createFiscalPeriod,createPurchaseOrder,createInvoice,postJournalEntry,allocateInvoicePayment,createCrmAccount,createCrmContact,createCrmLead,createCrmOpportunity,recordCrmActivity,updateCrmOpportunityStage,createHrEmployee,createHrLeaveRequest,decideHrLeaveRequest,createPayrollRun,approvePayrollRun,createPaymentIntent,requestPaymentRefund,createCommerceProduct,createCommerceOrder,createAsset,createMaintenanceWorkOrder,completeMaintenanceWorkOrder,createProject,createProjectTask,submitTimeEntry,decideTimeEntry,receivePurchaseOrder,createWorkflowDefinition,startWorkflowRun,decideWorkflowTask} from "@zuri/domain-services";
import {StockMovementSchema,StockReservationSchema,WarehouseSchema,PosTerminalSchema,CashierShiftSchema,PosSaleSchema,PosRefundSchema,AccountSchema,FiscalPeriodSchema,PurchaseOrderSchema,InvoiceSchema,JournalEntrySchema,CrmAccountSchema,CrmContactSchema,CrmLeadSchema,CrmOpportunitySchema,CrmActivitySchema,CrmOpportunityStageUpdateSchema,HrEmployeeSchema,HrLeaveRequestSchema,HrLeaveDecisionSchema,PayrollRunSchema,PayrollApprovalSchema,PaymentIntentSchema,PaymentRefundRequestSchema,CommerceProductSchema,CommerceOrderRequestSchema,AssetSchema,MaintenanceWorkOrderSchema,MaintenanceCompletionSchema,ProjectSchema,ProjectTaskSchema,TimeEntrySchema,TimeEntryDecisionSchema,PurchaseOrderReceiptSchema,WorkflowDefinitionSchema,WorkflowRunStartSchema,WorkflowTaskDecisionSchema} from "@zuri/domain-contracts";

type Principal=PlatformPrincipal&{membershipId:string;sessionId:string};
const getPrincipal=(request:FastifyRequest)=>(request as FastifyRequest&{principal:Principal}).principal;
const paramsSchema=z.object({warehouseId:z.string().min(1)});
const reservationParamsSchema=z.object({reservationId:z.string().min(1)});
const balanceQuerySchema=z.object({sku:z.string().min(1).optional(),limit:z.coerce.number().int().min(1).max(500).default(100)});

async function resolveWarehouseScope(db:Db,tenantId:string,warehouseId:string):Promise<DomainResourceScope|null>{
 const warehouse=await db.collection<{tenantId:string;warehouseId:string;locationId?:string;status:string}>("inventory_warehouses")
  .findOne({tenantId,warehouseId,status:"active"});
 if(!warehouse||!warehouse.locationId)return null;
 const location=await db.collection<{tenantId:string;locationId:string;organizationId:string;status:string}>("locations")
  .findOne({tenantId,locationId:warehouse.locationId,status:"active"});
 if(!location||!location.organizationId)return null;
 const organization=await db.collection("organizations").findOne({tenantId,organizationId:location.organizationId,status:"active"},{projection:{_id:1}});
 if(!organization)return null;
 return {tenantId,organizationId:location.organizationId,locationId:location.locationId};
}
async function resolveLocationScope(db:Db,tenantId:string,locationId:string):Promise<DomainResourceScope|null>{
 const location=await db.collection<{tenantId:string;locationId:string;organizationId:string;status:string}>("locations")
  .findOne({tenantId,locationId,status:"active"});
 if(!location||!location.organizationId)return null;
 const organization=await db.collection("organizations").findOne({tenantId,organizationId:location.organizationId,status:"active"},{projection:{_id:1}});
 if(!organization)return null;
 return {tenantId,organizationId:location.organizationId,locationId:location.locationId};
}
async function resolveOrganizationScope(db:Db,tenantId:string,organizationId:string):Promise<DomainResourceScope|null>{
 const organization=await db.collection("organizations").findOne({tenantId,organizationId,status:"active"},{projection:{_id:1}});
 return organization?{tenantId,organizationId}:null;
}
async function deny(db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,permission:string,scope?:DomainResourceScope){
 try{
  await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId},action:"authorization.denied",resourceType:"domain_api",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{permission,...(scope?.organizationId?{organizationId:scope.organizationId}:{}),...(scope?.locationId?{locationId:scope.locationId}:{})}});
 }catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist domain authorization denial audit");}
 return reply.code(403).send({error:"DOMAIN_RESOURCE_SCOPE_DENIED"});
}
async function permit(db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,permission:string,scope:DomainResourceScope){
 if(!authorizeDomainResource(p,permission,scope))return deny(db,request,reply,p,permission,scope);
 const decision=await evaluatePolicy(db,p.tenantId,{
  subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},
  resource:{...scope,resourceType:"domain_api",path:request.routeOptions.url??"",method:request.method},
  action:permission,environment:{}
 });
 if(!decision.allowed){
  try{await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId},action:"authorization.denied",resourceType:"domain_api",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{permission,reason:decision.reason}});}
  catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist ABAC denial audit");}
  return reply.code(403).send({error:decision.reason==="EXPLICIT_DENY"?"ABAC_POLICY_DENIED":"ABAC_POLICY_NO_MATCHING_ALLOW"});
 }
 return undefined;
}
async function authorizedOrganizationIds(db:Db,request:FastifyRequest,p:Principal,permission:string,organizationIds:string[]):Promise<string[]>{
 const organizations=await db.collection<{tenantId:string;organizationId:string;status:string}>("organizations")
  .find({tenantId:p.tenantId,organizationId:{$in:organizationIds},status:"active"}).toArray();
 const allowed:string[]=[];
 for(const organization of organizations){
  const scope:DomainResourceScope={tenantId:p.tenantId,organizationId:organization.organizationId};
  if(!authorizeDomainResource(p,permission,scope)){
   try{await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId},action:"authorization.denied",resourceType:"domain_api",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{permission,organizationId:organization.organizationId}});}
   catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist domain list denial audit");}
   continue;
  }
  const decision=await evaluatePolicy(db,p.tenantId,{
   subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},
   resource:{...scope,resourceType:"domain_api",path:request.routeOptions.url??"",method:request.method},
   action:permission,environment:{}
  });
  if(decision.allowed)allowed.push(organization.organizationId);
  else{
   try{await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId},action:"authorization.denied",resourceType:"domain_api",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{permission,organizationId:organization.organizationId,reason:decision.reason}});}
   catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist ABAC list denial audit");}
  }
 }
 return allowed;
}
async function authorizedLocationIds(db:Db,request:FastifyRequest,p:Principal,permission:string,locationIds:string[]):Promise<string[]>{
 const locations=await db.collection<{tenantId:string;locationId:string;organizationId:string;status:string}>("locations")
  .find({tenantId:p.tenantId,locationId:{$in:locationIds},status:"active"}).toArray();
 const allowed:string[]=[];
 for(const location of locations){
  const scope:DomainResourceScope={tenantId:p.tenantId,organizationId:location.organizationId,locationId:location.locationId};
  if(!authorizeDomainResource(p,permission,scope)){
   try{await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId},action:"authorization.denied",resourceType:"domain_api",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{permission,locationId:location.locationId}});}
   catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist domain list denial audit");}
   continue;
  }
  const decision=await evaluatePolicy(db,p.tenantId,{
   subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},
   resource:{...scope,resourceType:"domain_api",path:request.routeOptions.url??"",method:request.method},
   action:permission,environment:{}
  });
  if(decision.allowed)allowed.push(location.locationId);
  else{
   try{await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId},action:"authorization.denied",resourceType:"domain_api",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{permission,locationId:location.locationId,reason:decision.reason}});}
   catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist ABAC list denial audit");}
  }
 }
 return allowed;
}
function sendError(error:unknown,reply:FastifyReply){
 if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST",issues:error.issues.map(issue=>({path:issue.path,message:issue.message}))});
 if(error&&typeof error==="object"&&"code" in error&&(error as {code?:number}).code===11000)return reply.code(409).send({error:"RESOURCE_CONFLICT"});
 const code=error instanceof Error?error.message:"";
 if(["INSUFFICIENT_STOCK_ON_HAND","INSUFFICIENT_RESERVED_STOCK","RESERVATION_EXCEEDS_ON_HAND","ACTIVE_RESERVATION_NOT_FOUND","RESERVATION_EXPIRED","SOURCE_WAREHOUSE_NOT_ACTIVE","DESTINATION_WAREHOUSE_NOT_ACTIVE","STOCK_CONCURRENT_MODIFICATION","POS_TERMINAL_SHIFT_ALREADY_OPEN","OPEN_CASHIER_SHIFT_NOT_FOUND","OPEN_CASHIER_SHIFT_REQUIRED","REFUNDS_EXCEED_SALE_TOTAL"].includes(code))return reply.code(409).send({error:code});
 if(code==="RESERVATION_EXPIRY_MUST_BE_FUTURE"||code==="NEW_RESERVATION_MUST_BE_RESERVED")return reply.code(422).send({error:code});
 if(["CRM_OPPORTUNITY_VERSION_CONFLICT","CRM_OPPORTUNITY_STAGE_UNCHANGED","FISCAL_PERIOD_OVERLAP","FISCAL_PERIOD_NOT_OPEN_FOR_POSTING_DATE","JOURNAL_ENTRY_MUST_BE_POSTED","JOURNAL_ACCOUNT_NOT_ACTIVE"].includes(code))return reply.code(409).send({error:code});
 if(["CRM_RELATED_RESOURCE_NOT_FOUND","CRM_OPPORTUNITY_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 if(["HR_LEAVE_VERSION_CONFLICT","HR_LEAVE_REQUEST_NOT_PENDING","HR_LEAVE_SELF_APPROVAL_DENIED"].includes(code))return reply.code(409).send({error:code});
 if(["HR_MANAGER_NOT_FOUND","HR_ACTIVE_EMPLOYEE_NOT_FOUND"].includes(code))return reply.code(422).send({error:code});
 if(code==="HR_LEAVE_REQUEST_NOT_FOUND")return reply.code(404).send({error:code});
 if(["PAYROLL_VERSION_CONFLICT","PAYROLL_RUN_NOT_DRAFT","PAYROLL_SELF_APPROVAL_DENIED"].includes(code))return reply.code(409).send({error:code});
 if(code==="PAYROLL_EMPLOYEE_SCOPE_OR_STATUS_INVALID")return reply.code(422).send({error:code});
 if(code==="PAYROLL_RUN_NOT_FOUND")return reply.code(404).send({error:code});
 if(["PAYMENT_EXCEEDS_INVOICE_BALANCE","REFUNDS_EXCEED_CAPTURED_PAYMENT","PAYMENT_STATE_TRANSITION_INVALID","PAYMENT_EVENT_AMOUNT_MISMATCH"].includes(code))return reply.code(409).send({error:code});
 if(["PURCHASE_ORDER_RECEIPT_EXCEEDS_ORDERED","PURCHASE_ORDER_RECEIPT_SKU_NOT_ORDERED","PURCHASE_ORDER_RECEIPT_CONCURRENT_MODIFICATION"].includes(code))return reply.code(409).send({error:code});
 if(["APPROVED_PURCHASE_ORDER_NOT_FOUND","PURCHASE_ORDER_WAREHOUSE_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 if(["PAYMENT_PROVIDER_NOT_CONFIGURED","PAYMENT_REFERENCE_TYPE_NOT_SUPPORTED"].includes(code))return reply.code(422).send({error:code});
 if(["COMMERCE_ACTIVE_STOCK_RESERVATION_REQUIRED","COMMERCE_PRODUCT_NOT_AVAILABLE","COMMERCE_ORDER_CURRENCY_MISMATCH"].includes(code))return reply.code(422).send({error:code});
 if(["MAINTENANCE_WORK_ORDER_VERSION_CONFLICT","MAINTENANCE_WORK_ORDER_NOT_ACTIVE"].includes(code))return reply.code(409).send({error:code});
 if(["TIME_ENTRY_VERSION_CONFLICT","TIME_ENTRY_NOT_SUBMITTED","TIME_ENTRY_SELF_APPROVAL_DENIED"].includes(code))return reply.code(409).send({error:code});
 if(["ACTIVE_PROJECT_NOT_FOUND","ACTIVE_PROJECT_EMPLOYEE_NOT_FOUND","PROJECT_TASK_NOT_FOUND"].includes(code))return reply.code(422).send({error:code});
 if(["TIME_ENTRY_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 if(["WORKFLOW_TASK_VERSION_CONFLICT","WORKFLOW_TASK_NOT_PENDING","WORKFLOW_SELF_APPROVAL_DENIED","WORKFLOW_DUPLICATE_APPROVAL"].includes(code))return reply.code(409).send({error:code});
 if(["WORKFLOW_TASK_NOT_ASSIGNED"].includes(code))return reply.code(403).send({error:code});
 if(["ACTIVE_WORKFLOW_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 if(["WORKFLOW_TASK_NOT_FOUND","WORKFLOW_RUN_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 if(["ACTIVE_ASSET_NOT_FOUND","MAINTENANCE_WORK_ORDER_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 if(["INVOICE_NOT_PAYABLE","CAPTURED_PAYMENT_NOT_FOUND","PAYMENT_INTENT_NOT_FOUND"].includes(code))return reply.code(404).send({error:code});
 reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});
}
function idempotencyKey(request:FastifyRequest):string|undefined{
 const value=request.headers["idempotency-key"];
 return typeof value==="string"&&value.length>=8&&value.length<=128?value:undefined;
}
export function domainRoutes(db:Db,config:AuthConfig):FastifyPluginAsync{
 return async app=>{
  app.addHook("preHandler",authenticate(db,config));

  app.get("/inventory/warehouses",async(request,reply)=>{
   const p=getPrincipal(request);
   const locations=p.locationIds??[];
   if(!locations.length)return {data:[]};
   const allowedLocations=await authorizedLocationIds(db,request,p,"inventory.warehouse.read",locations);
   if(!allowedLocations.length)return {data:[]};
   const data=await db.collection("inventory_warehouses").find({tenantId:p.tenantId,locationId:{$in:allowedLocations},status:"active"},{projection:{_id:0}}).sort({name:1}).limit(500).toArray();
   return {data};
  });

  app.post("/inventory/warehouses",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=WarehouseSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId});
    if(!body.locationId)return reply.code(422).send({error:"WAREHOUSE_LOCATION_REQUIRED"});
    const scope=await resolveLocationScope(db,p.tenantId,body.locationId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_LOCATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"inventory.warehouse.create",scope);
    if(denied)return denied;
    const result=await createWarehouse(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.get("/inventory/warehouses/:warehouseId/balances",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const {warehouseId}=paramsSchema.parse(request.params);
    const query=balanceQuerySchema.parse(request.query);
    const scope=await resolveWarehouseScope(db,p.tenantId,warehouseId);
    if(!scope)return reply.code(404).send({error:"WAREHOUSE_NOT_FOUND"});
    const denied=await permit(db,request,reply,p,"inventory.stock.read",scope);
    if(denied)return denied;
    const filter={tenantId:p.tenantId,warehouseId,...(query.sku?{sku:query.sku}:{})};
    const data=await db.collection("inventory_stock_balances").find(filter,{projection:{_id:0}}).sort({sku:1}).limit(query.limit).toArray();
    return {data};
   }catch(error){return sendError(error,reply);}
  });

  app.post("/inventory/stock-movements",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=StockMovementSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId,idempotencyKey:key});
    const source=await resolveWarehouseScope(db,p.tenantId,body.warehouseId);
    if(!source)return reply.code(422).send({error:"ACTIVE_SOURCE_WAREHOUSE_REQUIRED"});
    const denied=await permit(db,request,reply,p,"inventory.stock.write",source);
    if(denied)return denied;
    if(body.destinationWarehouseId){
     const destination=await resolveWarehouseScope(db,p.tenantId,body.destinationWarehouseId);
     if(!destination)return reply.code(422).send({error:"ACTIVE_DESTINATION_WAREHOUSE_REQUIRED"});
     const destinationDenied=await permit(db,request,reply,p,"inventory.stock.write",destination);
     if(destinationDenied)return destinationDenied;
    }
    const result=await recordStockMovement(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/inventory/reservations",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=StockReservationSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId,idempotencyKey:key});
    const scope=await resolveWarehouseScope(db,p.tenantId,body.warehouseId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_WAREHOUSE_REQUIRED"});
    const denied=await permit(db,request,reply,p,"inventory.stock.reserve",scope);
    if(denied)return denied;
    const result=await reserveStock(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  const settle=async(request:FastifyRequest,reply:FastifyReply,action:"commit"|"release")=>{
   const p=getPrincipal(request);
   try{
    const {reservationId}=reservationParamsSchema.parse(request.params);
    const key=idempotencyKey(request);
    if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const reservation=await db.collection<{tenantId:string;reservationId:string;warehouseId:string;status:string}>("inventory_reservations")
     .findOne({tenantId:p.tenantId,reservationId});
    if(!reservation)return reply.code(404).send({error:"ACTIVE_RESERVATION_NOT_FOUND"});
    const scope=await resolveWarehouseScope(db,p.tenantId,reservation.warehouseId);
    if(!scope)return reply.code(404).send({error:"WAREHOUSE_NOT_FOUND"});
    const permission=action==="commit"?"inventory.stock.consume":"inventory.stock.release";
    const denied=await permit(db,request,reply,p,permission,scope);
    if(denied)return denied;
    const result=action==="commit"
     ?await commitReservation(db,p.tenantId,reservationId,p.userId,key)
     :await releaseReservation(db,p.tenantId,reservationId,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  };
  app.post("/inventory/reservations/:reservationId/commit",async(request,reply)=>settle(request,reply,"commit"));
  app.post("/inventory/reservations/:reservationId/release",async(request,reply)=>settle(request,reply,"release"));

  app.post("/pos/terminals",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=PosTerminalSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId});
    const scope=await resolveLocationScope(db,p.tenantId,body.locationId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_LOCATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"pos.terminal.create",scope);if(denied)return denied;
    const result=await registerPosTerminal(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/pos/shifts/open",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=CashierShiftSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId});
    const terminal=await db.collection<{tenantId:string;terminalId:string;locationId:string;status:string}>("pos_terminals")
     .findOne({tenantId:p.tenantId,terminalId:body.terminalId,status:"active"});
    if(!terminal)return reply.code(422).send({error:"POS_TERMINAL_NOT_ACTIVE"});
    const scope=await resolveLocationScope(db,p.tenantId,terminal.locationId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_LOCATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"pos.shift.open",scope);if(denied)return denied;
    const result=await openCashierShift(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  const shiftCloseBody=z.object({expectedCashMinor:z.number().int().nonnegative(),countedCashMinor:z.number().int().nonnegative()});
  app.post("/pos/shifts/:shiftId/close",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {shiftId}=z.object({shiftId:z.string().min(1)}).parse(request.params);
    const body=shiftCloseBody.parse(request.body);
    const shift=await db.collection<{tenantId:string;shiftId:string;terminalId:string}>("pos_cashier_shifts").findOne({tenantId:p.tenantId,shiftId});
    if(!shift)return reply.code(404).send({error:"CASHIER_SHIFT_NOT_FOUND"});
    const terminal=await db.collection<{tenantId:string;terminalId:string;locationId:string}>("pos_terminals").findOne({tenantId:p.tenantId,terminalId:shift.terminalId});
    if(!terminal)return reply.code(404).send({error:"POS_TERMINAL_NOT_FOUND"});
    const scope=await resolveLocationScope(db,p.tenantId,terminal.locationId);
    if(!scope)return reply.code(404).send({error:"POS_TERMINAL_NOT_FOUND"});
    const denied=await permit(db,request,reply,p,"pos.shift.close",scope);if(denied)return denied;
    const result=await closeCashierShift(db,p.tenantId,shiftId,p.userId,key,body.expectedCashMinor,body.countedCashMinor);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/pos/sales/complete",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=PosSaleSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId,idempotencyKey:key});
    const terminal=await db.collection<{tenantId:string;terminalId:string;locationId:string;status:string}>("pos_terminals")
     .findOne({tenantId:p.tenantId,terminalId:body.terminalId,status:"active"});
    if(!terminal)return reply.code(422).send({error:"POS_TERMINAL_NOT_ACTIVE"});
    const scope=await resolveLocationScope(db,p.tenantId,terminal.locationId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_LOCATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"pos.sale.complete",scope);if(denied)return denied;
    if(body.reservationId){
     const reservation=await db.collection<{tenantId:string;reservationId:string;warehouseId:string}>("inventory_reservations")
      .findOne({tenantId:p.tenantId,reservationId:body.reservationId,status:"reserved"});
     if(!reservation)return reply.code(422).send({error:"ACTIVE_RESERVATION_NOT_FOUND"});
     const warehouseScope=await resolveWarehouseScope(db,p.tenantId,reservation.warehouseId);
     if(!warehouseScope)return reply.code(422).send({error:"ACTIVE_WAREHOUSE_REQUIRED"});
     const stockDenied=await permit(db,request,reply,p,"inventory.stock.consume",warehouseScope);if(stockDenied)return stockDenied;
    }
    const result=await completePosSale(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/pos/refunds",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=PosRefundSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId,idempotencyKey:key});
    const sale=await db.collection<{tenantId:string;saleId:string;terminalId:string}>("pos_sales")
     .findOne({tenantId:p.tenantId,saleId:body.saleId});
    if(!sale)return reply.code(404).send({error:"POS_SALE_NOT_FOUND"});
    const terminal=await db.collection<{tenantId:string;terminalId:string;locationId:string}>("pos_terminals")
     .findOne({tenantId:p.tenantId,terminalId:sale.terminalId});
    if(!terminal)return reply.code(404).send({error:"POS_TERMINAL_NOT_FOUND"});
    const scope=await resolveLocationScope(db,p.tenantId,terminal.locationId);
    if(!scope)return reply.code(404).send({error:"POS_TERMINAL_NOT_FOUND"});
    const denied=await permit(db,request,reply,p,"pos.refund.complete",scope);if(denied)return denied;
    const result=await refundPosSale(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  const offlineCommandSchema=z.object({
   terminalId:z.string().min(1),commandId:z.string().min(8),sequence:z.number().int().positive(),
   commandType:z.string().min(1).max(80),payload:z.record(z.unknown()),issuedAt:z.string().datetime()
  });
  app.post("/pos/offline-commands",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=offlineCommandSchema.parse(request.body);
    const terminal=await db.collection<{tenantId:string;terminalId:string;locationId:string}>("pos_terminals")
     .findOne({tenantId:p.tenantId,terminalId:body.terminalId});
    if(!terminal)return reply.code(404).send({error:"POS_TERMINAL_NOT_FOUND"});
    const scope=await resolveLocationScope(db,p.tenantId,terminal.locationId);
    if(!scope)return reply.code(404).send({error:"POS_TERMINAL_NOT_FOUND"});
    const denied=await permit(db,request,reply,p,"pos.offline.sync",scope);if(denied)return denied;
    const result=await acceptOfflinePosCommand(db,{...body,tenantId:p.tenantId},p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/erp/accounts",async(request,reply)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"erp.account.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("erp_accounts").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({accountCode:1}).limit(500).toArray()};
  });

  app.post("/erp/accounts",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"erp.account.create",scope);if(denied)return denied;
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const body=AccountSchema.parse({...raw,organizationId});
    const result=await createAccount(db,p.tenantId,p.userId,body,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.get("/erp/fiscal-periods",async(request,reply)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"erp.fiscal_period.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("erp_fiscal_periods").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({startsAt:-1}).limit(200).toArray()};
  });

  app.post("/erp/fiscal-periods",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"erp.fiscal_period.create",scope);if(denied)return denied;
    const body=FiscalPeriodSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createFiscalPeriod(db,p.tenantId,p.userId,body as Record<string,unknown>,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/erp/purchase-orders",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const warehouseId=typeof raw.warehouseId==="string"?raw.warehouseId:"";
    if(!warehouseId)return reply.code(400).send({error:"WAREHOUSE_ID_REQUIRED"});
    const scope=await resolveWarehouseScope(db,p.tenantId,warehouseId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_WAREHOUSE_REQUIRED"});
    const denied=await permit(db,request,reply,p,"erp.purchase_order.create",scope);if(denied)return denied;
    const body=PurchaseOrderSchema.parse({...raw,tenantId:p.tenantId,idempotencyKey:key,organizationId:scope.organizationId});
    const result=await createPurchaseOrder(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.get("/erp/invoices",async(request,reply)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"erp.invoice.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("erp_invoices").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({issuedAt:-1}).limit(500).toArray()};
  });

  app.post("/erp/invoices",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"erp.invoice.create",scope);if(denied)return denied;
    const body=InvoiceSchema.parse({...raw,tenantId:p.tenantId,idempotencyKey:key,organizationId});
    const result=await createInvoice(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/erp/purchase-orders/:purchaseOrderId/receipts",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {purchaseOrderId}=z.object({purchaseOrderId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const order=await db.collection<{tenantId:string;organizationId:string;orderNumber:string;warehouseId:string;status:string}>("erp_purchase_orders")
     .findOne({tenantId:p.tenantId,organizationId,orderNumber:purchaseOrderId,status:{$in:["approved","partially_received"]}});
    if(!order)return reply.code(404).send({error:"APPROVED_PURCHASE_ORDER_NOT_FOUND"});
    const scope=await resolveWarehouseScope(db,p.tenantId,order.warehouseId);
    if(!scope||scope.organizationId!==organizationId)return reply.code(404).send({error:"PURCHASE_ORDER_WAREHOUSE_NOT_FOUND"});
    const denied=await permit(db,request,reply,p,"erp.purchase_order.receive",scope);if(denied)return denied;
    const stockDenied=await permit(db,request,reply,p,"inventory.stock.write",scope);if(stockDenied)return stockDenied;
    const body=PurchaseOrderReceiptSchema.parse({...raw,tenantId:p.tenantId,organizationId,purchaseOrderId});
    const result=await receivePurchaseOrder(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/erp/invoices/:invoiceId/payments",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {invoiceId}=z.object({invoiceId:z.string().min(1)}).parse(request.params);
    const body=z.object({paymentId:z.string().min(1),amountMinor:z.number().int().positive(),currency:z.string().regex(/^[A-Z]{3}$/)}).parse(request.body);
    const invoice=await db.collection<{tenantId:string;invoiceId:string;organizationId?:string}>("erp_invoices").findOne({tenantId:p.tenantId,invoiceId});
    if(!invoice)return reply.code(404).send({error:"INVOICE_NOT_FOUND"});
    if(!invoice.organizationId)return reply.code(403).send({error:"INVOICE_ORGANIZATION_SCOPE_MISSING"});
    const scope=await resolveOrganizationScope(db,p.tenantId,invoice.organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"erp.invoice.payment.allocate",scope);if(denied)return denied;
    const result=await allocateInvoicePayment(db,{tenantId:p.tenantId,actorId:p.userId,key,paymentId:body.paymentId,invoiceId,amountMinor:body.amountMinor,currency:body.currency});
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.post("/erp/journal-entries/post",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const fiscalPeriodId=typeof raw.fiscalPeriodId==="string"?raw.fiscalPeriodId:"";
    if(!fiscalPeriodId)return reply.code(400).send({error:"FISCAL_PERIOD_ID_REQUIRED"});
    const period=await db.collection<{tenantId:string;periodId:string;organizationId?:string}>("erp_fiscal_periods").findOne({tenantId:p.tenantId,periodId:fiscalPeriodId});
    if(!period)return reply.code(422).send({error:"FISCAL_PERIOD_NOT_FOUND"});
    if(!period.organizationId)return reply.code(403).send({error:"FISCAL_PERIOD_ORGANIZATION_SCOPE_MISSING"});
    const scope=await resolveOrganizationScope(db,p.tenantId,period.organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"erp.journal.post",scope);if(denied)return denied;
    const body=JournalEntrySchema.parse({...raw,tenantId:p.tenantId,idempotencyKey:key,organizationId:period.organizationId});
    const result=await postJournalEntry(db,body,p.userId);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  const crmLists=[
   {path:"/crm/accounts",collection:"crm_accounts",permission:"crm.account.read",sort:{name:1}},
   {path:"/crm/contacts",collection:"crm_contacts",permission:"crm.contact.read",sort:{lastName:1,firstName:1}},
   {path:"/crm/leads",collection:"crm_leads",permission:"crm.lead.read",sort:{createdAt:-1}},
   {path:"/crm/opportunities",collection:"crm_opportunities",permission:"crm.opportunity.read",sort:{expectedCloseAt:1}},
   {path:"/crm/activities",collection:"crm_activities",permission:"crm.activity.read",sort:{occurredAt:-1}}
  ] as const;
  for(const item of crmLists){
   app.get(item.path,async(request)=>{
    const p=getPrincipal(request);
    const allowed=await authorizedOrganizationIds(db,request,p,item.permission,p.organizationIds??[]);
    if(!allowed.length)return {data:[]};
    return {data:await db.collection(item.collection).find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort(item.sort).limit(500).toArray()};
   });
  }

  app.post("/crm/accounts",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope:DomainResourceScope={tenantId:p.tenantId,organizationId};
    const denied=await permit(db,request,reply,p,"crm.account.create",scope);if(denied)return denied;
    const body=CrmAccountSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createCrmAccount(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/crm/contacts",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope:DomainResourceScope={tenantId:p.tenantId,organizationId};
    const denied=await permit(db,request,reply,p,"crm.contact.create",scope);if(denied)return denied;
    const body=CrmContactSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createCrmContact(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/crm/leads",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope:DomainResourceScope={tenantId:p.tenantId,organizationId};
    const denied=await permit(db,request,reply,p,"crm.lead.create",scope);if(denied)return denied;
    const body=CrmLeadSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createCrmLead(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/crm/opportunities",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope:DomainResourceScope={tenantId:p.tenantId,organizationId};
    const denied=await permit(db,request,reply,p,"crm.opportunity.create",scope);if(denied)return denied;
    const body=CrmOpportunitySchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createCrmOpportunity(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/crm/activities",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope:DomainResourceScope={tenantId:p.tenantId,organizationId};
    const denied=await permit(db,request,reply,p,"crm.activity.create",scope);if(denied)return denied;
    const body=CrmActivitySchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await recordCrmActivity(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.patch("/crm/opportunities/:opportunityId/stage",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {opportunityId}=z.object({opportunityId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope:DomainResourceScope={tenantId:p.tenantId,organizationId};
    const denied=await permit(db,request,reply,p,"crm.opportunity.stage.update",scope);if(denied)return denied;
    const body=CrmOpportunityStageUpdateSchema.parse({...raw,tenantId:p.tenantId,organizationId,opportunityId});
    const result=await updateCrmOpportunityStage(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.get("/hr/employees",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"hr.employee.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("hr_employees").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({lastName:1,firstName:1}).limit(500).toArray()};
  });
  app.post("/hr/employees",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"hr.employee.create",scope);if(denied)return denied;
    const body=HrEmployeeSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createHrEmployee(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/hr/leave-requests",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"hr.leave.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("hr_leave_requests").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({startsAt:-1}).limit(500).toArray()};
  });
  app.post("/hr/leave-requests",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"hr.leave.request",scope);if(denied)return denied;
    const body=HrLeaveRequestSchema.parse({...raw,tenantId:p.tenantId,organizationId,status:"pending"});
    const result=await createHrLeaveRequest(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  const decideLeave=async(request:FastifyRequest,reply:FastifyReply,decision:"approved"|"rejected")=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {leaveRequestId}=z.object({leaveRequestId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"hr.leave.approve",scope);if(denied)return denied;
    const body=HrLeaveDecisionSchema.parse({...raw,tenantId:p.tenantId,organizationId,leaveRequestId,decision});
    const result=await decideHrLeaveRequest(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  };
  app.post("/hr/leave-requests/:leaveRequestId/approve",async(request,reply)=>decideLeave(request,reply,"approved"));
  app.post("/hr/leave-requests/:leaveRequestId/reject",async(request,reply)=>decideLeave(request,reply,"rejected"));
  app.get("/payroll/runs",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"payroll.run.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("payroll_runs").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({periodStart:-1}).limit(200).toArray()};
  });
  app.post("/payroll/runs",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"payroll.run.create",scope);if(denied)return denied;
    const body=PayrollRunSchema.parse({...raw,tenantId:p.tenantId,organizationId,status:"draft"});
    const result=await createPayrollRun(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/payroll/runs/:payrollRunId/approve",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {payrollRunId}=z.object({payrollRunId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"payroll.run.approve",scope);if(denied)return denied;
    const body=PayrollApprovalSchema.parse({...raw,tenantId:p.tenantId,organizationId,payrollRunId});
    const result=await approvePayrollRun(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/payments/intents",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"payments.intent.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("payment_intents").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({createdAt:-1}).limit(500).toArray()};
  });
  app.post("/payments/intents",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"payments.intent.create",scope);if(denied)return denied;
    const body=PaymentIntentSchema.parse({...raw,tenantId:p.tenantId,organizationId,status:"pending"});
    const result=await createPaymentIntent(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/payments/refund-requests",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"payments.refund.request",scope);if(denied)return denied;
    const body=PaymentRefundRequestSchema.parse({...raw,tenantId:p.tenantId,organizationId,status:"pending"});
    const result=await requestPaymentRefund(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });

  app.get("/commerce/products",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"commerce.product.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("commerce_products").find({tenantId:p.tenantId,organizationId:{$in:allowed},status:"active"},{projection:{_id:0}}).sort({name:1}).limit(500).toArray()};
  });
  app.post("/commerce/products",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"commerce.product.create",scope);if(denied)return denied;
    const body=CommerceProductSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createCommerceProduct(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/commerce/orders",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"commerce.order.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("commerce_orders").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({placedAt:-1}).limit(500).toArray()};
  });
  app.post("/commerce/orders",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const warehouseId=typeof raw.warehouseId==="string"?raw.warehouseId:"";
    if(!warehouseId)return reply.code(400).send({error:"WAREHOUSE_ID_REQUIRED"});
    const scope=await resolveWarehouseScope(db,p.tenantId,warehouseId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_WAREHOUSE_REQUIRED"});
    if(typeof raw.organizationId==="string"&&raw.organizationId!==scope.organizationId)return reply.code(403).send({error:"DOMAIN_RESOURCE_SCOPE_DENIED"});
    const denied=await permit(db,request,reply,p,"commerce.order.create",scope);if(denied)return denied;
    const body=CommerceOrderRequestSchema.parse({...raw,tenantId:p.tenantId,organizationId:scope.organizationId,status:"placed"});
    const result=await createCommerceOrder(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/assets",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"assets.asset.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("assets").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({assetTag:1}).limit(500).toArray()};
  });
  app.post("/assets",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"assets.asset.create",scope);if(denied)return denied;
    const body=AssetSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createAsset(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/assets/maintenance-work-orders",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"assets.work_order.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("maintenance_work_orders").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({scheduledAt:1}).limit(500).toArray()};
  });
  app.post("/assets/maintenance-work-orders",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"assets.work_order.create",scope);if(denied)return denied;
    const body=MaintenanceWorkOrderSchema.parse({...raw,tenantId:p.tenantId,organizationId,status:"open"});
    const result=await createMaintenanceWorkOrder(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/assets/maintenance-work-orders/:workOrderId/complete",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {workOrderId}=z.object({workOrderId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"assets.work_order.complete",scope);if(denied)return denied;
    const body=MaintenanceCompletionSchema.parse({...raw,tenantId:p.tenantId,organizationId,workOrderId});
    const result=await completeMaintenanceWorkOrder(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/projects",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"projects.project.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("projects").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({createdAt:-1}).limit(500).toArray()};
  });
  app.post("/projects",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"projects.project.create",scope);if(denied)return denied;
    const body=ProjectSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createProject(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.post("/projects/:projectId/tasks",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {projectId}=z.object({projectId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"projects.task.create",scope);if(denied)return denied;
    const body=ProjectTaskSchema.parse({...raw,tenantId:p.tenantId,organizationId,projectId,status:"backlog"});
    const result=await createProjectTask(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/projects/:projectId/time-entries",async(request)=>{
   const p=getPrincipal(request);
   const {projectId}=z.object({projectId:z.string().min(1)}).parse(request.params);
   const allowed=await authorizedOrganizationIds(db,request,p,"projects.time_entry.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("time_entries").find({tenantId:p.tenantId,organizationId:{$in:allowed},projectId},{projection:{_id:0}}).sort({workDate:-1}).limit(500).toArray()};
  });
  app.post("/projects/:projectId/time-entries",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {projectId}=z.object({projectId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"projects.time_entry.submit",scope);if(denied)return denied;
    const body=TimeEntrySchema.parse({...raw,tenantId:p.tenantId,organizationId,projectId,status:"submitted"});
    const result=await submitTimeEntry(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  const decideTime=async(request:FastifyRequest,reply:FastifyReply,decision:"approved"|"rejected")=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {timeEntryId}=z.object({timeEntryId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"projects.time_entry.approve",scope);if(denied)return denied;
    const body=TimeEntryDecisionSchema.parse({...raw,tenantId:p.tenantId,organizationId,timeEntryId,decision});
    const result=await decideTimeEntry(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  };
  app.post("/projects/time-entries/:timeEntryId/approve",async(request,reply)=>decideTime(request,reply,"approved"));
  app.post("/projects/time-entries/:timeEntryId/reject",async(request,reply)=>decideTime(request,reply,"rejected"));
  app.get("/workflows",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"workflows.definition.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("workflow_definitions").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({name:1}).limit(300).toArray()};
  });
  app.post("/workflows",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"workflows.definition.create",scope);if(denied)return denied;
    const body=WorkflowDefinitionSchema.parse({...raw,tenantId:p.tenantId,organizationId});
    const result=await createWorkflowDefinition(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  app.get("/workflow-runs",async(request)=>{
   const p=getPrincipal(request);
   const allowed=await authorizedOrganizationIds(db,request,p,"workflows.run.read",p.organizationIds??[]);
   if(!allowed.length)return {data:[]};
   return {data:await db.collection("workflow_runs").find({tenantId:p.tenantId,organizationId:{$in:allowed}},{projection:{_id:0}}).sort({startedAt:-1}).limit(500).toArray()};
  });
  app.post("/workflows/:workflowId/runs",async(request,reply)=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {workflowId}=z.object({workflowId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"workflows.run.start",scope);if(denied)return denied;
    const body=WorkflowRunStartSchema.parse({...raw,tenantId:p.tenantId,organizationId,workflowId});
    const result=await startWorkflowRun(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  });
  const decideWorkflow=async(request:FastifyRequest,reply:FastifyReply,decision:"approved"|"rejected")=>{
   const p=getPrincipal(request);
   try{
    const key=idempotencyKey(request);if(!key)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
    const {taskId}=z.object({taskId:z.string().min(1)}).parse(request.params);
    const raw=request.body&&typeof request.body==="object"?request.body as Record<string,unknown>:{};
    const organizationId=typeof raw.organizationId==="string"?raw.organizationId:"";
    if(!organizationId)return reply.code(400).send({error:"ORGANIZATION_ID_REQUIRED"});
    const scope=await resolveOrganizationScope(db,p.tenantId,organizationId);if(!scope)return reply.code(422).send({error:"ACTIVE_ORGANIZATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"workflows.task.approve",scope);if(denied)return denied;
    const body=WorkflowTaskDecisionSchema.parse({...raw,tenantId:p.tenantId,organizationId,taskId,decision});
    const result=await decideWorkflowTask(db,body,p.userId,key);
    return reply.code(result.statusCode).send(result.body);
   }catch(error){return sendError(error,reply);}
  };
  app.post("/workflow-tasks/:taskId/approve",async(request,reply)=>decideWorkflow(request,reply,"approved"));
  app.post("/workflow-tasks/:taskId/reject",async(request,reply)=>decideWorkflow(request,reply,"rejected"));

 };
}
