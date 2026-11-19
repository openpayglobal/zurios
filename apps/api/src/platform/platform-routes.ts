import type {ClientSession,Db,Filter} from "mongodb";
import {createHmac} from "node:crypto";
import type {AuditEventDocument,SessionDocument} from "@zuri/core-platform";
import type {FastifyPluginAsync,FastifyReply,FastifyRequest} from "fastify";
import {ZodError} from "zod";
import {createOrganizationSchema,createLocationSchema,createMembershipSchema,createRoleSchema,upsertPolicySchema,featureFlagSchema,policyKeyParamsSchema,featureFlagKeyParamsSchema,sessionIdParamsSchema,sessionsQuerySchema,auditEventsQuerySchema} from "./platform-schemas.js";
import {
 coreCollections,createOrganization,createLocation,createMembership,createRole,
 upsertPolicy,setFeatureFlag,appendAuditEvent,appendOutboxEvent,runIdempotentMutation,evaluatePolicy
} from "@zuri/core-platform";
import {authenticate} from "./auth-middleware.js";
import {authorize} from "./authorization.js";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";

type Principal=PlatformPrincipal&{membershipId:string;sessionId:string};
type MutationResult={statusCode:number;body:unknown};
const principal=(request:FastifyRequest)=>(request as FastifyRequest&{principal:Principal}).principal;
const orgs=(p:PlatformPrincipal)=>p.organizationIds??(p.organizationId?[p.organizationId]:[]);
const locations=(p:PlatformPrincipal)=>p.locationIds??[];
const scoped=<T extends {tenantId:string}>(tenantId:string,extra:Filter<T>={}):Filter<T>=>({$and:[{tenantId},extra]} as Filter<T>);
function hashIp(request:FastifyRequest,secret:string){return createHmac("sha256",secret).update(request.ip).digest("hex");}
function fail(error:unknown,reply:FastifyReply){
 if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST",issues:error.issues.map(i=>({path:i.path,message:i.message}))});
 const code=error instanceof Error?error.message:"";
 if(error&&typeof error==="object"&&"code" in error&&(error as {code?:number}).code===11000)return reply.code(409).send({error:"RESOURCE_CONFLICT"});
 if(["MEMBERSHIP_ALREADY_EXISTS","DUPLICATE_ORGANIZATION_SCOPE","DUPLICATE_LOCATION_SCOPE","DUPLICATE_ROLE_ASSIGNMENT","IDEMPOTENCY_KEY_REUSED","IDEMPOTENCY_IN_PROGRESS"].includes(code))return reply.code(409).send({error:code});
 if(code==="SESSION_NOT_FOUND")return reply.code(404).send({error:code});
 if(["PARENT_ORGANIZATION_NOT_FOUND","ORGANIZATION_NOT_FOUND","PARENT_LOCATION_NOT_FOUND","ACTIVE_USER_REQUIRED","TENANT_NOT_ACTIVE","INVALID_ORGANIZATION_SCOPE","INVALID_LOCATION_SCOPE","INVALID_LOCATION_ORGANIZATION_SCOPE","INVALID_ROLE_ASSIGNMENT"].includes(code))return reply.code(422).send({error:code});
 return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});
}
async function denied(db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,ipHashSecret:string,code:string,resourceType="authorization"){
 try{await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:hashIp(request,ipHashSecret),...(typeof request.headers["user-agent"]==="string"?{userAgent:request.headers["user-agent"].slice(0,512)}:{})},action:"authorization.denied",resourceType,resourceId:request.routeOptions.url,outcome:"denied",correlationId:request.id,metadata:{code,...(p.emergencyGrantIds?.length?{emergencyGrantIds:p.emergencyGrantIds}:{})}});}
 catch(error){request.log.error({err:error,correlationId:request.id},"Failed to persist denied-action audit event");}
 return reply.code(403).send({error:code});
}
async function auditFailure(db:Db,request:FastifyRequest,p:Principal,ipHashSecret:string,operation:string,error:unknown){
 const errorCode=error instanceof Error&&/^[A-Z0-9_]{3,100}$/.test(error.message)?error.message:"MUTATION_FAILED";
 await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:hashIp(request,ipHashSecret),...(typeof request.headers["user-agent"]==="string"?{userAgent:request.headers["user-agent"].slice(0,512)}:{})},action:`${operation}.failed`,resourceType:"platform_api",resourceId:request.routeOptions.url,outcome:"failure",correlationId:request.id,metadata:{operation,errorCode,...(p.emergencyGrantIds?.length?{emergencyGrantIds:p.emergencyGrantIds}:{})}});
}
function permit(db:Db,ipHashSecret:string,permission:string){return async(request:FastifyRequest,reply:FastifyReply)=>{
 const p=principal(request);
 if(!authorize(p,{permission,resourceTenantId:p.tenantId}))return denied(db,request,reply,p,ipHashSecret,"FORBIDDEN");
 const decision=await evaluatePolicy(db,p.tenantId,{
  subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},
  resource:{tenantId:p.tenantId,resourceType:"platform_api",path:request.routeOptions.url??"",method:request.method},
  action:permission,environment:{}
 });
 if(!decision.allowed)return denied(db,request,reply,p,ipHashSecret,decision.reason==="EXPLICIT_DENY"?"ABAC_POLICY_DENIED":"ABAC_POLICY_NO_MATCHING_ALLOW");
};}
async function audit(db:Db,p:Principal,request:FastifyRequest,ipHashSecret:string,action:string,type:string,id:string|undefined,session:ClientSession){
 await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:hashIp(request,ipHashSecret),...(typeof request.headers["user-agent"]==="string"?{userAgent:request.headers["user-agent"].slice(0,512)}:{})},action,resourceType:type,...(id?{resourceId:id}:{}),outcome:"success",correlationId:request.id,metadata:{...(p.emergencyGrantIds?.length?{emergencyGrantIds:p.emergencyGrantIds}:{})}},session);
}
async function mutate(
 db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,ipHashSecret:string,operation:string,
 work:(session:ClientSession)=>Promise<MutationResult>
){
 const key=request.headers["idempotency-key"];
 if(typeof key!=="string"||key.length<8||key.length>128)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
 try{
  const result=await runIdempotentMutation(db,{
   tenantId:p.tenantId,actorId:p.userId,operation,key,
   request:{method:request.method,path:request.routeOptions.url,params:request.params??{},body:request.body??null}
  },work);
  reply.header("Idempotency-Replayed",result.replayed?"true":"false");
  return reply.code(result.statusCode).send(result.body);
 }catch(error){try{await auditFailure(db,request,p,ipHashSecret,operation,error);}catch(auditError){request.log.error({err:auditError,correlationId:request.id},"Failed to persist mutation-failure audit event");}return fail(error,reply);}
}
async function emit(db:Db,p:Principal,request:FastifyRequest,session:ClientSession,eventType:string,aggregateType:string,aggregateId:string,payload:Record<string,unknown>){
 await appendOutboxEvent(db,session,{tenantId:p.tenantId,eventType,aggregateType,aggregateId,payload,correlationId:request.id});
}
export function platformRoutes(db:Db,config:AuthConfig):FastifyPluginAsync{
 return async app=>{
  const c=coreCollections(db);
  app.addHook("preHandler",authenticate(db,config));
  app.addHook("onSend",async(request,reply,payload)=>{if(!request.url.startsWith("/v1/")){reply.header("Deprecation","true");reply.header("Sunset","Wed, 30 Jun 2027 23:59:59 GMT");reply.header("Link",'</v1/platform>; rel="successor-version"');}return payload;});
  app.get("/platform/tenant",{preHandler:permit(db,config.jwtSecret,"platform.tenant.read")},async request=>{
   const p=principal(request);return {data:await c.tenants.findOne({tenantId:p.tenantId},{projection:{_id:0}})};
  });
  app.get("/platform/organizations",{preHandler:permit(db,config.jwtSecret,"platform.organizations.read")},async request=>{
   const p=principal(request),ids=orgs(p);if(!ids.length)return {data:[]};
   return {data:await c.organizations.find(scoped(p.tenantId,{organizationId:{$in:ids}}),{projection:{_id:0}}).sort({name:1}).toArray()};
  });
  app.post("/platform/organizations",{preHandler:permit(db,config.jwtSecret,"platform.organizations.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=createOrganizationSchema.parse(request.body);
    if(b.parentOrganizationId&&!orgs(p).includes(b.parentOrganizationId))return denied(db,request,reply,p,config.jwtSecret,"ORGANIZATION_SCOPE_DENIED","organization");
    if(!b.parentOrganizationId&&!p.permissions.includes("platform.organizations.create.root"))return denied(db,request,reply,p,config.jwtSecret,"ROOT_ORGANIZATION_CREATION_DENIED","organization");
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.organizations.create",async session=>{
     const result=await createOrganization(db,p.tenantId,p.userId,b,session);
     await audit(db,p,request,config.jwtSecret,"platform.organization.created","organization",result.organizationId,session);
     await emit(db,p,request,session,"platform.organization.created","organization",result.organizationId,{organizationId:result.organizationId});
     return {statusCode:201,body:{data:result}};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/locations",{preHandler:permit(db,config.jwtSecret,"platform.locations.read")},async request=>{
   const p=principal(request),ids=locations(p);if(!ids.length)return {data:[]};
   return {data:await c.locations.find(scoped(p.tenantId,{locationId:{$in:ids}}),{projection:{_id:0}}).sort({name:1}).toArray()};
  });
  app.post("/platform/locations",{preHandler:permit(db,config.jwtSecret,"platform.locations.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=createLocationSchema.parse(request.body);
    if(!orgs(p).includes(b.organizationId))return reply.code(403).send({error:"ORGANIZATION_SCOPE_DENIED"});
    if(b.parentLocationId&&!locations(p).includes(b.parentLocationId))return denied(db,request,reply,p,config.jwtSecret,"LOCATION_SCOPE_DENIED","location");
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.locations.create",async session=>{
     const result=await createLocation(db,p.tenantId,p.userId,b,session);
     await audit(db,p,request,config.jwtSecret,"platform.location.created","location",result.locationId,session);
     await emit(db,p,request,session,"platform.location.created","location",result.locationId,{locationId:result.locationId,organizationId:result.organizationId});
     return {statusCode:201,body:{data:result}};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/memberships",{preHandler:permit(db,config.jwtSecret,"platform.memberships.read")},async request=>{
   const p=principal(request),ids=orgs(p);if(!ids.length)return {data:[]};
   const rows=await c.memberships.find(scoped(p.tenantId,{organizationIds:{$in:ids}}),{projection:{_id:0}}).sort({createdAt:-1}).limit(200).toArray();
   const visibleOrganizations=new Set(ids),visibleLocations=new Set(locations(p));
   return {data:rows.map(row=>({...row,organizationIds:row.organizationIds.filter(id=>visibleOrganizations.has(id)),locationIds:row.locationIds.filter(id=>visibleLocations.has(id))}))};
  });
  app.post("/platform/memberships",{preHandler:permit(db,config.jwtSecret,"platform.memberships.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=createMembershipSchema.parse(request.body);
    if(b.organizationIds.some(x=>!orgs(p).includes(x))||b.locationIds.some(x=>!locations(p).includes(x)))return denied(db,request,reply,p,config.jwtSecret,"MEMBERSHIP_SCOPE_DENIED","membership");
    if(b.roleIds.length&&!p.permissions.includes("platform.memberships.assign.roles"))return denied(db,request,reply,p,config.jwtSecret,"ROLE_ASSIGNMENT_NOT_PERMITTED","membership");
    if(b.roleIds.length){
     const assignedRoles=await c.roles.find({tenantId:p.tenantId,roleId:{$in:b.roleIds},status:"active"}).toArray();
     const assignedPermissions=new Set(assignedRoles.flatMap(role=>role.permissionKeys));
     const escalates=[...assignedPermissions].some(permission=>!p.permissions.includes(permission));
     if(escalates&&!p.permissions.includes("platform.memberships.assign.privileged"))return denied(db,request,reply,p,config.jwtSecret,"ROLE_ASSIGNMENT_PRIVILEGE_ESCALATION_DENIED","membership");
    }
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.memberships.create",async session=>{
     const result=await createMembership(db,p.tenantId,p.userId,b,session);
     await audit(db,p,request,config.jwtSecret,"platform.membership.created","membership",result.membershipId,session);
     await emit(db,p,request,session,"platform.membership.created","membership",result.membershipId,{membershipId:result.membershipId,userId:result.userId});
     return {statusCode:201,body:{data:result}};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/roles",{preHandler:permit(db,config.jwtSecret,"platform.roles.read")},async request=>{
   const p=principal(request);return {data:await c.roles.find({tenantId:p.tenantId,status:"active"},{projection:{_id:0}}).sort({name:1}).toArray()};
  });
  app.post("/platform/roles",{preHandler:permit(db,config.jwtSecret,"platform.roles.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=createRoleSchema.parse(request.body);
    if(b.isSystem&&!p.permissions.includes("platform.roles.create.system"))return denied(db,request,reply,p,config.jwtSecret,"SYSTEM_ROLE_CREATION_DENIED","role");
    if(b.permissionKeys.some(permission=>!p.permissions.includes(permission))&&!p.permissions.includes("platform.roles.grant.privileged"))return denied(db,request,reply,p,config.jwtSecret,"ROLE_PERMISSION_ESCALATION_DENIED","role");
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.roles.create",async session=>{
     const result=await createRole(db,p.tenantId,p.userId,b,session);
     await audit(db,p,request,config.jwtSecret,"platform.role.created","role",result.roleId,session);
     await emit(db,p,request,session,"platform.role.created","role",result.roleId,{roleId:result.roleId,key:result.key});
     return {statusCode:201,body:{data:result}};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/policies",{preHandler:permit(db,config.jwtSecret,"platform.policies.read")},async request=>{
   const p=principal(request);return {data:await c.policies.find({tenantId:p.tenantId},{projection:{_id:0}}).sort({priority:-1}).toArray()};
  });
  app.put("/platform/policies/:key",{preHandler:permit(db,config.jwtSecret,"platform.policies.write")},async(request,reply)=>{
   const p=principal(request);try{
    const params=policyKeyParamsSchema.parse(request.params);
    const b=upsertPolicySchema.parse(request.body);
    if(b.effect==="allow"&&!p.permissions.includes("platform.policies.write.allow"))return denied(db,request,reply,p,config.jwtSecret,"POLICY_ALLOW_NOT_PERMITTED","policy");
    if(b.effect==="deny"&&!p.permissions.includes("platform.policies.write.deny"))return denied(db,request,reply,p,config.jwtSecret,"POLICY_DENY_NOT_PERMITTED","policy");
    if(!Object.keys(b.subject).length&&!Object.keys(b.resource).length&&!Object.keys(b.conditions).length&&!p.permissions.includes("platform.policies.write.global"))return denied(db,request,reply,p,config.jwtSecret,"GLOBAL_POLICY_NOT_PERMITTED","policy");
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.policies.upsert",async session=>{
     const result=await upsertPolicy(db,p.tenantId,p.userId,{...b,key:params.key},session);
     await audit(db,p,request,config.jwtSecret,"platform.policy.upserted","policy",result?.policyId,session);
     await emit(db,p,request,session,"platform.policy.upserted","policy",params.key,{key:params.key,effect:b.effect});
     return {statusCode:200,body:{data:result}};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/feature-flags",{preHandler:permit(db,config.jwtSecret,"platform.feature-flags.read")},async request=>{
   const p=principal(request);return {data:await c.featureFlags.find({tenantId:p.tenantId},{projection:{_id:0}}).sort({key:1}).toArray()};
  });
  app.put("/platform/feature-flags/:key",{preHandler:permit(db,config.jwtSecret,"platform.feature-flags.write")},async(request,reply)=>{
   const p=principal(request);try{
    const params=featureFlagKeyParamsSchema.parse(request.params);
    const b=featureFlagSchema.parse(request.body);
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.feature-flags.upsert",async session=>{
     const result=await setFeatureFlag(db,p.tenantId,p.userId,{...b,key:params.key},session);
     await audit(db,p,request,config.jwtSecret,"platform.feature-flag.updated","feature_flag",params.key,session);
     await emit(db,p,request,session,"platform.feature-flag.updated","feature_flag",params.key,{key:params.key,enabled:b.enabled});
     return {statusCode:200,body:{data:result}};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/sessions",{preHandler:permit(db,config.jwtSecret,"platform.sessions.read")},async request=>{
   const p=principal(request),q=sessionsQuerySchema.parse(request.query);
   const all=p.permissions.includes("platform.sessions.read.all"),userId=all?q.userId??undefined:p.userId;
   const filter:Filter<SessionDocument>={tenantId:p.tenantId,...(userId?{userId}:{}),...(q.activeOnly?{revokedAt:{$exists:false}}:{})};
   return {data:await c.sessions.find(filter,{projection:{_id:0,refreshTokenHash:0,refreshTokenHistory:0}}).sort({lastUsedAt:-1}).limit(200).toArray()};
  });
  app.post("/platform/sessions/:sessionId/revoke",{preHandler:permit(db,config.jwtSecret,"platform.sessions.revoke")},async(request,reply)=>{
   const p=principal(request);try{
    const {sessionId}=sessionIdParamsSchema.parse(request.params);
    const filter={tenantId:p.tenantId,sessionId,...(p.permissions.includes("platform.sessions.revoke.all")?{}:{userId:p.userId}),revokedAt:{$exists:false}};
    return await mutate(db,request,reply,p,config.jwtSecret,"platform.sessions.revoke",async session=>{
     const now=new Date(),result=await c.sessions.updateOne(filter,{$set:{revokedAt:now,updatedAt:now,updatedBy:p.userId}},{session});
     if(!result.matchedCount)throw new Error("SESSION_NOT_FOUND");
     await audit(db,p,request,config.jwtSecret,"platform.session.revoked","session",sessionId,session);
     await emit(db,p,request,session,"platform.session.revoked","session",sessionId,{sessionId});
     return {statusCode:204,body:null};
    });
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/audit-events",{preHandler:permit(db,config.jwtSecret,"platform.audit.read")},async request=>{
   const p=principal(request),q=auditEventsQuerySchema.parse(request.query);
   const filter:Filter<AuditEventDocument>={tenantId:p.tenantId,...(q.action?{action:q.action}:{})};
   return {data:await c.auditEvents.find(filter,{projection:{_id:0}}).sort({occurredAt:-1}).limit(q.limit).toArray()};
  });
 };
}
