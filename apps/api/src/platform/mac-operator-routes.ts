import {createHash,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import type {Db} from "mongodb";
import type {FastifyPluginAsync,FastifyReply,FastifyRequest} from "fastify";
import {SignJWT,jwtVerify} from "jose";
import {z,ZodError} from "zod";
import {decryptMfaSecret,encryptMfaSecret,generateTotpSecret,hashOpaqueToken,hashPassword,verifyPassword,verifyTotpCode} from "./auth-crypto.js";
import {authorizePlatformOperator,type PlatformOperatorPrincipal} from "./operator-authorization.js";

export type MacOperatorConfig={
  issuer:string;
  audience:string;
  jwtSecret?:string;
  bootstrapToken?:string;
  mfaEncryptionKey:string;
  sessionTtlSeconds:number;
};
type MacPrincipal=PlatformOperatorPrincipal&{email:string;status:"active"};
declare module "fastify"{interface FastifyRequest{macOperator?:MacPrincipal;}}
const bootstrapSchema=z.object({email:z.string().email().max(254),displayName:z.string().trim().min(2).max(120),password:z.string().min(12).max(128)});
const confirmSchema=z.object({email:z.string().email().max(254),code:z.string().regex(/^\d{6}$/)});
const loginSchema=confirmSchema.extend({password:z.string().min(1).max(128)});
const refreshSchema=z.object({sessionId:z.string().uuid(),refreshToken:z.string().min(40).max(200)});
const key=(config:MacOperatorConfig)=>new TextEncoder().encode(config.jwtSecret??"");
const normalized=(email:string)=>email.trim().toLowerCase();
const hashIp=(request:FastifyRequest)=>createHash("sha256").update(request.ip).digest("hex");
function sameSecret(actual:string|undefined,expected:string|undefined):boolean{
 if(!actual||!expected)return false;
 const a=Buffer.from(actual),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function authUnavailable(config:MacOperatorConfig){return !config.jwtSecret||!config.mfaEncryptionKey;}
function bootstrapUnavailable(config:MacOperatorConfig){return authUnavailable(config)||!config.bootstrapToken;}
async function enforceMacRateLimit(db:Db,request:FastifyRequest,identity:string){
 const bucket=Math.floor(Date.now()/60_000),keyValue=createHash("sha256").update(identity+"|"+request.ip+"|"+bucket).digest("hex");
 await db.collection("mac_auth_rate_limits").updateOne({key:keyValue},{$inc:{count:1},$setOnInsert:{expiresAt:new Date((bucket+2)*60_000)}},{upsert:true});
 const row=await db.collection("mac_auth_rate_limits").findOne({key:keyValue});
 if((row?.count??0)>8)throw new Error("MAC_AUTH_RATE_LIMITED");
}
function publicOperator(row:any){return {operatorId:row.operatorId,email:row.emailNormalized,displayName:row.displayName,permissions:row.permissions,status:row.status,mfaEnabled:row.mfaEnabled===true};}
async function writeAdminAudit(db:Db,input:{actorId?:string;action:string;resourceType:string;resourceId?:string;outcome:"success"|"denied"|"failure";request:FastifyRequest;metadata?:Record<string,unknown>}){
 await db.collection("admin_audit_events").insertOne({
  eventId:randomUUID(),occurredAt:new Date(),actor:{...(input.actorId?{operatorId:input.actorId}:{}),ipHash:hashIp(input.request),userAgent:typeof input.request.headers["user-agent"]==="string"?input.request.headers["user-agent"].slice(0,512):undefined},
  action:input.action,resourceType:input.resourceType,...(input.resourceId?{resourceId:input.resourceId}:{}),outcome:input.outcome,correlationId:input.request.id,metadata:input.metadata??{}
 });
}
async function issueSession(db:Db,config:MacOperatorConfig,operator:any,request:FastifyRequest){
 const now=new Date(),sessionId=randomUUID(),refreshToken=randomBytes(48).toString("base64url"),expiresAt=new Date(now.getTime()+config.sessionTtlSeconds*1000);
 const session={sessionId,operatorId:operator.operatorId,refreshTokenHash:hashOpaqueToken(refreshToken),permissions:operator.permissions,tenantIds:operator.tenantIds??[],mfaVerifiedAt:now,createdAt:now,lastUsedAt:now,expiresAt};
 await db.collection("platform_operator_sessions").insertOne(session);
 try{await writeAdminAudit(db,{actorId:operator.operatorId,action:"mac.auth.login",resourceType:"platform_operator_session",resourceId:sessionId,outcome:"success",request});}
 catch(error){await db.collection("platform_operator_sessions").deleteOne({sessionId,operatorId:operator.operatorId});throw error;}
 const accessToken=await new SignJWT({operatorId:operator.operatorId,sessionId})
  .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience).setSubject(operator.operatorId).setIssuedAt().setExpirationTime("10m").sign(key(config));
 return {accessToken,refreshToken,sessionId,expiresAt,tokenType:"Bearer" as const,operator:publicOperator(operator)};
}
function authenticateMac(db:Db,config:MacOperatorConfig){
 return async(request:FastifyRequest,reply:FastifyReply)=>{
  if(authUnavailable(config))return reply.code(503).send({error:"MAC_AUTH_NOT_CONFIGURED"});
  const header=request.headers.authorization;
  if(typeof header!=="string"||!header.startsWith("Bearer "))return reply.code(401).send({error:"UNAUTHENTICATED"});
  try{
   const {payload}=await jwtVerify(header.slice(7),key(config),{issuer:config.issuer,audience:config.audience,algorithms:["HS256"]});
   const operatorId=payload.sub,sessionId=payload.sessionId;
   if(typeof operatorId!=="string"||typeof sessionId!=="string"||payload.operatorId!==operatorId)throw new Error("INVALID_MAC_CLAIMS");
   const now=new Date();
   const [operator,session]=await Promise.all([
    db.collection("platform_operators").findOne({operatorId,status:"active",mfaEnabled:true}),
    db.collection("platform_operator_sessions").findOne({operatorId,sessionId,revokedAt:{$exists:false},expiresAt:{$gt:now}})
   ]);
   if(!operator||!session)throw new Error("INACTIVE_MAC_SESSION");
   await db.collection("platform_operator_sessions").updateOne({sessionId,operatorId,revokedAt:{$exists:false}},{$set:{lastUsedAt:now}});
   request.macOperator={operatorId,sessionId,permissions:operator.permissions??[],tenantIds:operator.tenantIds??[],mfaVerifiedAt:session.mfaVerifiedAt,email:operator.emailNormalized,status:"active"};
  }catch{return reply.code(401).send({error:"UNAUTHENTICATED"});}
 };
}
const configurableMfaWindowSeconds=8*60*60;
export function macOperatorRoutes(db:Db,config:MacOperatorConfig):FastifyPluginAsync{
 return async app=>{
  const authenticated=authenticateMac(db,config);
  const permission=(name:string)=>async(request:FastifyRequest,reply:FastifyReply)=>{
   const principal=request.macOperator;
   const decision=authorizePlatformOperator(principal,{permission:name,mfaMaxAgeSeconds:configurableMfaWindowSeconds});
   if(!decision.allowed){
    try{await writeAdminAudit(db,{...(principal?.operatorId?{actorId:principal.operatorId}:{}),action:"mac.authorization.denied",resourceType:"route",...(request.routeOptions.url?{resourceId:request.routeOptions.url}:{}),outcome:"denied",request,metadata:{permission:name,reason:decision.reason}});}catch(error){request.log.error({err:error},"Failed to persist MAC authorization audit");}
    return reply.code(403).send({error:"FORBIDDEN",reason:decision.reason});
   }
  };
  app.post("/mac/auth/bootstrap",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(bootstrapUnavailable(config))return reply.code(503).send({error:"MAC_AUTH_NOT_CONFIGURED"});
   if(!sameSecret(request.headers["x-mac-bootstrap-token"] as string|undefined,config.bootstrapToken))return reply.code(401).send({error:"UNAUTHENTICATED"});
   try{
    const body=bootstrapSchema.parse(request.body),collection=db.collection("platform_operators");
    await enforceMacRateLimit(db,request,"bootstrap");
    if(await collection.estimatedDocumentCount()>0)return reply.code(409).send({error:"BOOTSTRAP_CLOSED"});
    const email=normalized(body.email),operatorId=randomUUID(),secret=generateTotpSecret(),now=new Date();
    const permissions=["mac.overview.read","mac.tenants.read","mac.audit.read","mac.operators.manage","mac.security.read"];
    await collection.insertOne({operatorId,emailNormalized:email,displayName:body.displayName,passwordHash:await hashPassword(body.password),permissions,tenantIds:[],status:"pending_mfa",bootstrapOwner:true,mfaEnabled:false,pendingMfaSecretEncrypted:encryptMfaSecret(secret,config.mfaEncryptionKey),createdAt:now,updatedAt:now});
    await writeAdminAudit(db,{actorId:operatorId,action:"mac.auth.bootstrap.started",resourceType:"platform_operator",resourceId:operatorId,outcome:"success",request});
    const label=encodeURIComponent(email),issuer=encodeURIComponent("Zuri OS MAC");
    return reply.code(201).send({operatorId,email,totpSecret:secret,otpauthUrl:`otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,nextStep:"Confirm the authenticator code using /mac/auth/bootstrap/confirm. The secret is shown only once."});
   }catch(error){if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST"});if(error instanceof Error&&error.message==="MAC_AUTH_RATE_LIMITED")return reply.code(429).send({error:"RATE_LIMITED"});if((error as any)?.code===11000)return reply.code(409).send({error:"OPERATOR_ALREADY_EXISTS"});request.log.error({err:error},"MAC bootstrap failed");return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});}
  });
  app.post("/mac/auth/bootstrap/confirm",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(bootstrapUnavailable(config))return reply.code(503).send({error:"MAC_AUTH_NOT_CONFIGURED"});
   if(!sameSecret(request.headers["x-mac-bootstrap-token"] as string|undefined,config.bootstrapToken))return reply.code(401).send({error:"UNAUTHENTICATED"});
   try{
    const body=confirmSchema.parse(request.body),email=normalized(body.email),collection=db.collection("platform_operators");
    const operator=await collection.findOne({emailNormalized:email,status:"pending_mfa",mfaEnabled:false});
    if(!operator?.pendingMfaSecretEncrypted)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const secret=decryptMfaSecret(operator.pendingMfaSecretEncrypted,config.mfaEncryptionKey),step=verifyTotpCode(secret,body.code);
    if(step===null)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const activated=await collection.updateOne({operatorId:operator.operatorId,status:"pending_mfa",mfaEnabled:false},{$set:{status:"active",mfaEnabled:true,mfaSecretEncrypted:operator.pendingMfaSecretEncrypted,mfaLastUsedStep:step,updatedAt:new Date()},$unset:{pendingMfaSecretEncrypted:""}});
    if(!activated.modifiedCount)return reply.code(409).send({error:"BOOTSTRAP_ALREADY_COMPLETED"});
    const active=await collection.findOne({operatorId:operator.operatorId});
    const session=await issueSession(db,config,active,request);
    return reply.code(201).send(session);
   }catch(error){if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST"});request.log.error({err:error},"MAC bootstrap confirmation failed");return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});}
  });
  app.post("/mac/auth/login",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(authUnavailable(config))return reply.code(503).send({error:"MAC_AUTH_NOT_CONFIGURED"});
   try{
    const body=loginSchema.parse(request.body),email=normalized(body.email);
    await enforceMacRateLimit(db,request,email);
    const operator=await db.collection("platform_operators").findOne({emailNormalized:email,status:"active",mfaEnabled:true});
    if(!operator?.passwordHash||!await verifyPassword(body.password,operator.passwordHash)||!operator.mfaSecretEncrypted)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const secret=decryptMfaSecret(operator.mfaSecretEncrypted,config.mfaEncryptionKey),step=verifyTotpCode(secret,body.code);
    if(step===null)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const consumed=await db.collection("platform_operators").updateOne({operatorId:operator.operatorId,$or:[{mfaLastUsedStep:{$lt:step}},{mfaLastUsedStep:{$exists:false}}]},{$set:{mfaLastUsedStep:step,updatedAt:new Date()}});
    if(!consumed.modifiedCount)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    return await issueSession(db,config,operator,request);
   }catch(error){if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST"});if(error instanceof Error&&error.message==="MAC_AUTH_RATE_LIMITED")return reply.code(429).send({error:"RATE_LIMITED"});request.log.error({err:error},"MAC login failed");return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});}
  });
  app.post("/mac/auth/refresh",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(authUnavailable(config))return reply.code(503).send({error:"MAC_AUTH_NOT_CONFIGURED"});
   try{
    const body=refreshSchema.parse(request.body),sessions=db.collection("platform_operator_sessions"),now=new Date();
    const session=await sessions.findOne({sessionId:body.sessionId,refreshTokenHash:hashOpaqueToken(body.refreshToken),revokedAt:{$exists:false},expiresAt:{$gt:now}});
    if(!session)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const operator=await db.collection("platform_operators").findOne({operatorId:session.operatorId,status:"active",mfaEnabled:true});
    if(!operator)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const nextToken=randomBytes(48).toString("base64url"),nextHash=hashOpaqueToken(nextToken);
    const rotated=await sessions.updateOne({sessionId:body.sessionId,refreshTokenHash:hashOpaqueToken(body.refreshToken),revokedAt:{$exists:false},expiresAt:{$gt:now}},{$set:{refreshTokenHash:nextHash,lastUsedAt:now}});
    if(!rotated.modifiedCount)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    const accessToken=await new SignJWT({operatorId:operator.operatorId,sessionId:session.sessionId}).setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience).setSubject(operator.operatorId).setIssuedAt().setExpirationTime("10m").sign(key(config));
    await writeAdminAudit(db,{actorId:operator.operatorId,action:"mac.auth.refresh",resourceType:"platform_operator_session",resourceId:session.sessionId,outcome:"success",request});
    return {accessToken,refreshToken:nextToken,sessionId:session.sessionId,expiresAt:session.expiresAt,tokenType:"Bearer" as const,operator:publicOperator(operator)};
   }catch(error){if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST"});request.log.error({err:error},"MAC refresh failed");return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});}
  });
  app.post("/mac/auth/logout",{preHandler:authenticated},async(request,reply)=>{
   const principal=request.macOperator!,now=new Date();
   const result=await db.collection("platform_operator_sessions").updateOne({sessionId:principal.sessionId,operatorId:principal.operatorId,revokedAt:{$exists:false}},{$set:{revokedAt:now,revokedReason:"operator_logout"}});
   await writeAdminAudit(db,{actorId:principal.operatorId,action:"mac.auth.logout",resourceType:"platform_operator_session",resourceId:principal.sessionId,outcome:"success",request});
   return reply.code(result.modifiedCount?204:404).send();
  });
  app.get("/mac/auth/me",{preHandler:authenticated},async request=>({operator:publicOperator(await db.collection("platform_operators").findOne({operatorId:request.macOperator!.operatorId}))}));
  app.get("/mac/operators",{preHandler:[authenticated,permission("mac.operators.manage")]},async request=>{
   await writeAdminAudit(db,{actorId:request.macOperator!.operatorId,action:"mac.operators.read",resourceType:"platform_operator_inventory",outcome:"success",request});
   const items=await db.collection("platform_operators").find({},{projection:{_id:0,operatorId:1,emailNormalized:1,displayName:1,permissions:1,tenantIds:1,status:1,mfaEnabled:1,createdAt:1,updatedAt:1}}).sort({emailNormalized:1}).limit(100).toArray();
   return {data:items.map(publicOperator)};
  });
  app.get("/mac/sessions",{preHandler:[authenticated,permission("mac.operators.manage")]},async request=>{
   await writeAdminAudit(db,{actorId:request.macOperator!.operatorId,action:"mac.sessions.read",resourceType:"platform_operator_session_inventory",outcome:"success",request});
   const items=await db.collection("platform_operator_sessions").find({expiresAt:{$gt:new Date()}},{projection:{_id:0,sessionId:1,operatorId:1,createdAt:1,lastUsedAt:1,expiresAt:1,revokedAt:1,revokedReason:1}}).sort({createdAt:-1}).limit(100).toArray();
   return {data:items};
  });
  app.post("/mac/sessions/:sessionId/revoke",{preHandler:[authenticated,permission("mac.operators.manage")]},async(request,reply)=>{
   const paramsResult=z.object({sessionId:z.string().uuid()}).safeParse(request.params);
   const bodyResult=z.object({reason:z.string().trim().min(10).max(300)}).safeParse(request.body);
   if(!paramsResult.success||!bodyResult.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   const params=paramsResult.data,body=bodyResult.data;
   const principal=request.macOperator!;
   if(params.sessionId===principal.sessionId)return reply.code(409).send({error:"USE_LOGOUT_FOR_CURRENT_SESSION"});
   const result=await db.collection("platform_operator_sessions").updateOne({sessionId:params.sessionId,revokedAt:{$exists:false},expiresAt:{$gt:new Date()}},{$set:{revokedAt:new Date(),revokedReason:"operator_revoked",revokedBy:principal.operatorId}});
   if(!result.modifiedCount)return reply.code(404).send({error:"SESSION_NOT_FOUND"});
   await writeAdminAudit(db,{actorId:principal.operatorId,action:"mac.sessions.revoke",resourceType:"platform_operator_session",resourceId:params.sessionId,outcome:"success",request,metadata:{reason:body.reason}});
   return reply.code(204).send();
  });
  app.get("/mac/overview",{preHandler:[authenticated,permission("mac.overview.read")]},async request=>{
   await writeAdminAudit(db,{actorId:request.macOperator!.operatorId,action:"mac.overview.read",resourceType:"platform_overview",outcome:"success",request});
   const [tenants,operators,sessions]=await Promise.all([
    db.collection("tenants").estimatedDocumentCount(),db.collection("platform_operators").countDocuments({status:"active"}),db.collection("platform_operator_sessions").countDocuments({revokedAt:{$exists:false},expiresAt:{$gt:new Date()}})
   ]);
   return {data:{tenants,activePlatformOperators:operators,activeOperatorSessions:sessions,providerConnections:"not_configured",deploymentTelemetry:"not_connected",generatedAt:new Date().toISOString()}};
  });
  app.get("/mac/tenants",{preHandler:[authenticated,permission("mac.tenants.read")]},async(request,reply)=>{
   const parsed=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),after:z.string().optional()}).safeParse(request.query);
   if(!parsed.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   await writeAdminAudit(db,{actorId:request.macOperator!.operatorId,action:"mac.tenants.read",resourceType:"tenant_inventory",outcome:"success",request});
   const query=parsed.data;
   const filter=query.after?{tenantId:{$gt:query.after}}:{};
   const rows=await db.collection("tenants").find(filter,{projection:{_id:0,tenantId:1,slug:1,name:1,status:1,createdAt:1,updatedAt:1}}).sort({tenantId:1}).limit(query.limit+1).toArray();
   const hasMore=rows.length>query.limit,items=rows.slice(0,query.limit);
   return {data:items,page:{hasMore,nextCursor:hasMore?items[items.length-1]?.tenantId:null}};
  });
  app.get("/mac/audit",{preHandler:[authenticated,permission("mac.audit.read")]},async(request,reply)=>{
   const parsed=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),before:z.coerce.date().optional()}).safeParse(request.query);
   if(!parsed.success)return reply.code(400).send({error:"INVALID_REQUEST"});
   await writeAdminAudit(db,{actorId:request.macOperator!.operatorId,action:"mac.audit.read",resourceType:"admin_audit_events",outcome:"success",request});
   const query=parsed.data;
   const filter=query.before?{occurredAt:{$lt:query.before}}:{};
   const items=await db.collection("admin_audit_events").find(filter,{projection:{_id:0}}).sort({occurredAt:-1}).limit(query.limit).toArray();
   return {data:items};
  });
 };
}
