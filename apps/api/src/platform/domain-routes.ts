import type {Db} from "mongodb";
import type {FastifyPluginAsync,FastifyRequest,FastifyReply} from "fastify";
import {ZodError,z} from "zod";
import {authenticate} from "./auth-middleware.js";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";
import {authorizeDomainResource,type DomainResourceScope} from "./domain-authorization.js";
import {appendAuditEvent,evaluatePolicy} from "@zuri/core-platform";
import {createWarehouse,recordStockMovement,reserveStock,commitReservation,releaseReservation} from "@zuri/domain-services";
import {StockMovementSchema,StockReservationSchema,WarehouseSchema} from "@zuri/domain-contracts";

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
 return {tenantId,organizationId:location.organizationId,locationId:location.locationId};
}
async function resolveLocationScope(db:Db,tenantId:string,locationId:string):Promise<DomainResourceScope|null>{
 const location=await db.collection<{tenantId:string;locationId:string;organizationId:string;status:string}>("locations")
  .findOne({tenantId,locationId,status:"active"});
 if(!location||!location.organizationId)return null;
 return {tenantId,organizationId:location.organizationId,locationId:location.locationId};
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
 if(["INSUFFICIENT_STOCK_ON_HAND","INSUFFICIENT_RESERVED_STOCK","RESERVATION_EXCEEDS_ON_HAND","ACTIVE_RESERVATION_NOT_FOUND","RESERVATION_EXPIRED","SOURCE_WAREHOUSE_NOT_ACTIVE","DESTINATION_WAREHOUSE_NOT_ACTIVE","STOCK_CONCURRENT_MODIFICATION"].includes(code))return reply.code(409).send({error:code});
 if(code==="RESERVATION_EXPIRY_MUST_BE_FUTURE"||code==="NEW_RESERVATION_MUST_BE_RESERVED")return reply.code(422).send({error:code});
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
    const body=WarehouseSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId});
    if(!body.locationId)return reply.code(422).send({error:"WAREHOUSE_LOCATION_REQUIRED"});
    const scope=await resolveLocationScope(db,p.tenantId,body.locationId);
    if(!scope)return reply.code(422).send({error:"ACTIVE_LOCATION_REQUIRED"});
    const denied=await permit(db,request,reply,p,"inventory.warehouse.create",scope);
    if(denied)return denied;
    const result=await createWarehouse(db,body,p.userId);
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
    const body=StockMovementSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId});
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
    const body=StockReservationSchema.parse({...((request.body&&typeof request.body==="object")?request.body:{}),tenantId:p.tenantId});
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
 };
}
