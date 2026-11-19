import type {ClientSession,Db} from "mongodb";
import {createHmac} from "node:crypto";
import type {FastifyPluginAsync,FastifyReply,FastifyRequest} from "fastify";
import {ZodError,z} from "zod";
import {appendAuditEvent,appendOutboxEvent,runIdempotentMutation,getStockBalance,evaluatePolicy} from "@zuri/core-platform";
import {createInventoryProduct,createStockLocation,createStockLot,recordStockMovement} from "@zuri/core-platform";
import {authenticate} from "../platform/auth-middleware.js";
import {authorize} from "../platform/authorization.js";
import type {AuthConfig} from "../platform/auth-service.js";
import type {PlatformPrincipal} from "../platform/types.js";

type Principal=PlatformPrincipal&{membershipId:string;sessionId:string};
const principal=(request:FastifyRequest)=>request.principal as Principal;
function hashIp(request:FastifyRequest,secret:string){return createHmac("sha256",secret).update(request.ip).digest("hex");}
function denied(db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,secret:string,code:string){
 void appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:hashIp(request,secret)},action:"authorization.denied",resourceType:"inventory",resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{code}}).catch(error=>request.log.error({err:error},"Inventory denial audit failed"));
 return reply.code(403).send({error:code});
}
function permit(db:Db,config:AuthConfig,permission:string){
 return async(request:FastifyRequest,reply:FastifyReply)=>{
  const p=principal(request);
  if(!authorize(p,{permission,resourceTenantId:p.tenantId}))return denied(db,request,reply,p,config.jwtSecret,"FORBIDDEN");
  const decision=await evaluatePolicy(db,p.tenantId,{
   subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},
   resource:{tenantId:p.tenantId,resourceType:"inventory_api",path:request.routeOptions.url??"",method:request.method},
   action:permission,environment:{}
  });
  if(decision.reason==="EXPLICIT_DENY")return denied(db,request,reply,p,config.jwtSecret,"ABAC_POLICY_DENIED");

 };
}
async function writeAudit(db:Db,request:FastifyRequest,p:Principal,config:AuthConfig,session:ClientSession,action:string,resourceType:string,resourceId:string,metadata:Record<string,unknown>={}){
 await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:hashIp(request,config.jwtSecret),...(typeof request.headers["user-agent"]==="string"?{userAgent:request.headers["user-agent"].slice(0,512)}:{})},action,resourceType,resourceId,outcome:"success",correlationId:request.id,metadata},session);
}
async function readAudit(db:Db,request:FastifyRequest,p:Principal,config:AuthConfig,action:string,resourceType:string,metadata:Record<string,unknown>={}){
 await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:hashIp(request,config.jwtSecret)},action,resourceType,outcome:"success",correlationId:request.id,metadata});
}
async function writeOutbox(db:Db,request:FastifyRequest,p:Principal,session:ClientSession,eventType:string,aggregateType:string,aggregateId:string,payload:Record<string,unknown>){
 await appendOutboxEvent(db,session,{tenantId:p.tenantId,eventType,aggregateType,aggregateId,payload,correlationId:request.id});
}
function fail(error:unknown,reply:FastifyReply){
 if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST",issues:error.issues.map(i=>({path:i.path,message:i.message}))});
 if(error&&typeof error==="object"&&"code" in error&&(error as {code?:number}).code===11000)return reply.code(409).send({error:"RESOURCE_CONFLICT"});
 const code=error instanceof Error?error.message:"";
 if(code==="PRODUCT_NOT_FOUND"||code==="STOCK_LOCATION_NOT_FOUND"||code==="STOCK_LOT_NOT_FOUND")return reply.code(404).send({error:code});
 if(code==="INSUFFICIENT_STOCK"||code==="UNIT_MISMATCH"||code==="LOT_REQUIRED"||code==="ORGANIZATION_NOT_FOUND"||code==="PRODUCT_NOT_LOT_TRACKED"||code==="LOT_EXPIRY_INVALID"||code==="DESTINATION_STOCK_LOCATION_NOT_FOUND"||code==="DESTINATION_STOCK_LOCATION_REQUIRED"||code==="SERIAL_TRACKING_NOT_IMPLEMENTED")return reply.code(422).send({error:code});
 if(code==="STOCK_MOVEMENT_ALREADY_RECORDED"||code.startsWith("IDEMPOTENCY_"))return reply.code(409).send({error:code});
 return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});
}
async function mutate(db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,operation:string,work:(session:ClientSession)=>Promise<{statusCode:number;body:unknown}>,bodyOverride:unknown=request.body){
 const key=request.headers["idempotency-key"];
 if(typeof key!=="string"||key.length<8||key.length>128)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
 try{
  const result=await runIdempotentMutation(db,{tenantId:p.tenantId,actorId:p.userId,operation,key,request:{method:request.method,path:request.routeOptions.url,params:request.params??{},body:bodyOverride??null}},work);
  reply.header("Idempotency-Replayed",result.replayed?"true":"false");
  return reply.code(result.statusCode).send(result.body);
 }catch(error){return fail(error,reply);}
}
const listQuery=z.object({limit:z.coerce.number().int().min(1).max(100).default(50)});
const movementScope=z.object({stockLocationId:z.string().min(1),destinationStockLocationId:z.string().min(1).optional(),movementType:z.enum(["receipt","issue","adjustment_in","adjustment_out","transfer"])});
export function inventoryRoutes(db:Db,config:AuthConfig):FastifyPluginAsync{
 return async app=>{
  app.addHook("preHandler",authenticate(db,config));
  app.get("/inventory/products",{preHandler:permit(db,config,"inventory.products.read")},async(request,reply)=>{
   const query=listQuery.extend({search:z.string().trim().max(80).optional()}).safeParse(request.query);
   if(!query.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   const p=principal(request);
   await readAudit(db,request,p,config,"inventory.products.read","product",{limit:query.data.limit});
   const filter:Record<string,unknown>={tenantId:p.tenantId,status:"active"};
   if(query.data.search){const prefix=query.data.search.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").toUpperCase();filter.skuNormalized={$regex:"^"+prefix};}
   const data=await db.collection("products").find(filter,{projection:{_id:0,tenantId:0}}).sort({name:1}).limit(query.data.limit).toArray();
   return {data};
  });
  app.post("/inventory/products",{preHandler:permit(db,config,"inventory.products.create")},async(request,reply)=>{
   const p=principal(request);
   return mutate(db,request,reply,p,"inventory.products.create",async session=>{
    const product=await createInventoryProduct(db,p.tenantId,p.userId,request.body,session);
    await writeAudit(db,request,p,config,session,"inventory.product.created","product",product.productId,{sku:product.sku});
    await writeOutbox(db,request,p,session,"inventory.product.created","product",product.productId,{productId:product.productId});
    return {statusCode:201,body:{data:product}};
   });
  });
  app.get("/inventory/locations",{preHandler:permit(db,config,"inventory.locations.read")},async request=>{
   const p=principal(request),ids=p.organizationIds??[];
   if(!ids.length)return {data:[]};
   await readAudit(db,request,p,config,"inventory.stock_locations.read","stock_location");
   const data=await db.collection("stock_locations").find({tenantId:p.tenantId,organizationId:{$in:ids},status:"active"},{projection:{_id:0}}).sort({name:1}).toArray();
   return {data};
  });
  app.post("/inventory/locations",{preHandler:permit(db,config,"inventory.locations.create")},async(request,reply)=>{
   const p=principal(request),scope=z.object({organizationId:z.string().min(1)}).safeParse(request.body);
   if(!scope.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   if(!authorize(p,{permission:"inventory.locations.create",resourceTenantId:p.tenantId,organizationId:scope.data.organizationId}))return denied(db,request,reply,p,config.jwtSecret,"ORGANIZATION_SCOPE_DENIED");
   return mutate(db,request,reply,p,"inventory.locations.create",async session=>{
    const location=await createStockLocation(db,p.tenantId,p.userId,request.body,session);
    await writeAudit(db,request,p,config,session,"inventory.stock_location.created","stock_location",location.stockLocationId,{organizationId:location.organizationId});
    await writeOutbox(db,request,p,session,"inventory.stock_location.created","stock_location",location.stockLocationId,{stockLocationId:location.stockLocationId});
    return {statusCode:201,body:{data:location}};
   });
  });
  app.post("/inventory/lots",{preHandler:permit(db,config,"inventory.lots.create")},async(request,reply)=>{
   const p=principal(request);
   return mutate(db,request,reply,p,"inventory.lots.create",async session=>{
    const lot=await createStockLot(db,p.tenantId,p.userId,request.body,session);
    await writeAudit(db,request,p,config,session,"inventory.stock_lot.created","stock_lot",lot.lotId,{productId:lot.productId});
    await writeOutbox(db,request,p,session,"inventory.stock_lot.created","stock_lot",lot.lotId,{lotId:lot.lotId,productId:lot.productId});
    return {statusCode:201,body:{data:lot}};
   });
  });
  app.post("/inventory/movements",{preHandler:permit(db,config,"inventory.movements.create")},async(request,reply)=>{
   const p=principal(request),scope=movementScope.safeParse(request.body);
   if(!scope.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   const source=await db.collection("stock_locations").findOne({tenantId:p.tenantId,stockLocationId:scope.data.stockLocationId,status:"active"});
   if(!source)return reply.code(404).send({error:"STOCK_LOCATION_NOT_FOUND"});
   if(!authorize(p,{permission:"inventory.movements.create",resourceTenantId:p.tenantId,organizationId:source.organizationId}))return denied(db,request,reply,p,config.jwtSecret,"STOCK_LOCATION_SCOPE_DENIED");
   if(scope.data.destinationStockLocationId){
    const destination=await db.collection("stock_locations").findOne({tenantId:p.tenantId,stockLocationId:scope.data.destinationStockLocationId,status:"active"});
    if(!destination)return reply.code(404).send({error:"DESTINATION_STOCK_LOCATION_NOT_FOUND"});
    if(!authorize(p,{permission:"inventory.movements.create",resourceTenantId:p.tenantId,organizationId:destination.organizationId}))return denied(db,request,reply,p,config.jwtSecret,"DESTINATION_LOCATION_SCOPE_DENIED");
   }
   if(scope.data.movementType==="transfer"){
    const permission="inventory.transfers.create";
    if(!authorize(p,{permission,resourceTenantId:p.tenantId,organizationId:source.organizationId})||
      !scope.data.destinationStockLocationId||
      !authorize(p,{permission,resourceTenantId:p.tenantId,organizationId:(await db.collection("stock_locations").findOne({tenantId:p.tenantId,stockLocationId:scope.data.destinationStockLocationId,status:"active"}))!.organizationId}))
      return denied(db,request,reply,p,config.jwtSecret,"FORBIDDEN");
    const decision=await evaluatePolicy(db,p.tenantId,{subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},resource:{tenantId:p.tenantId,resourceType:"inventory_transfer",path:request.routeOptions.url??"",method:request.method},action:permission,environment:{}});
    if(decision.reason==="EXPLICIT_DENY")return denied(db,request,reply,p,config.jwtSecret,"ABAC_POLICY_DENIED");
   }
   if(scope.data.movementType.startsWith("adjustment_")){
    const permission="inventory.adjustments.approve";
    if(!authorize(p,{permission,resourceTenantId:p.tenantId,organizationId:source.organizationId}))return denied(db,request,reply,p,config.jwtSecret,"FORBIDDEN");
    const decision=await evaluatePolicy(db,p.tenantId,{subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},resource:{tenantId:p.tenantId,resourceType:"inventory_adjustment",path:request.routeOptions.url??"",method:request.method},action:permission,environment:{}});
    if(decision.reason==="EXPLICIT_DENY")return denied(db,request,reply,p,config.jwtSecret,"ABAC_POLICY_DENIED");
   }
   const idempotencyKey=request.headers["idempotency-key"];
   if(typeof idempotencyKey!=="string"||idempotencyKey.length<8||idempotencyKey.length>128)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
   const input={...(request.body as Record<string,unknown>),idempotencyKey};
   return mutate(db,request,reply,p,"inventory.movements.create",async session=>{
    const result=await recordStockMovement(db,p.tenantId,p.userId,input,session);
    const aggregateId=result.transferId??result.movements[0]!.movementId;
    await writeAudit(db,request,p,config,session,"inventory.stock_movement.recorded",result.transferId?"stock_transfer":"stock_movement",aggregateId,{movementCount:result.movements.length,movementType:scope.data.movementType});
    await writeOutbox(db,request,p,session,"inventory.stock_movement.recorded",result.transferId?"stock_transfer":"stock_movement",aggregateId,{movementIds:result.movements.map(m=>m.movementId),transferId:result.transferId});
    return {statusCode:201,body:{data:{...result,movements:result.movements.map(m=>({...m,quantity:m.quantity.toString()}))}}};
   },input);
  });
  app.get("/inventory/balances",{preHandler:permit(db,config,"inventory.balances.read")},async(request,reply)=>{
   const query=z.object({productId:z.string().min(1),stockLocationId:z.string().min(1),lotId:z.string().optional()}).safeParse(request.query);
   if(!query.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   const p=principal(request),location=await db.collection("stock_locations").findOne({tenantId:p.tenantId,stockLocationId:query.data.stockLocationId,status:"active"});
   if(!location)return reply.code(404).send({error:"STOCK_LOCATION_NOT_FOUND"});
   if(!authorize(p,{permission:"inventory.balances.read",resourceTenantId:p.tenantId,organizationId:location.organizationId}))return denied(db,request,reply,p,config.jwtSecret,"STOCK_LOCATION_SCOPE_DENIED");
   await readAudit(db,request,p,config,"inventory.stock_balance.read","stock_balance",{productId:query.data.productId,stockLocationId:query.data.stockLocationId});
   return {data:await getStockBalance(db,p.tenantId,query.data.productId,query.data.stockLocationId,query.data.lotId)};
  });
  app.get("/inventory/movements",{preHandler:permit(db,config,"inventory.movements.read")},async(request,reply)=>{
   const query=listQuery.extend({productId:z.string().optional(),stockLocationId:z.string().optional()}).safeParse(request.query);
   if(!query.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   const p=principal(request),orgs=p.organizationIds??[];
   if(!orgs.length)return {data:[]};
   await readAudit(db,request,p,config,"inventory.stock_movements.read","stock_movement",{limit:query.data.limit});
   const filter:Record<string,unknown>={tenantId:p.tenantId,organizationId:{$in:orgs}};
   if(query.data.productId)filter.productId=query.data.productId;
   if(query.data.stockLocationId)filter.stockLocationId=query.data.stockLocationId;
   const rows=await db.collection("stock_movements").find(filter,{projection:{_id:0}}).sort({occurredAt:-1}).limit(query.data.limit).toArray();
   return {data:rows.map(row=>({...row,quantity:(row.quantity as {toString():string}).toString()}))};
  });
 };
}
