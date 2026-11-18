import type {Db,Filter} from "mongodb";
import {createHash} from "node:crypto";
import type {AuditEventDocument,SessionDocument} from "@zuri/core-platform";
import type {FastifyPluginAsync,FastifyReply,FastifyRequest} from "fastify";
import {z,ZodError} from "zod";
import {coreCollections,createOrganization,createLocation,createMembership,createRole,upsertPolicy,setFeatureFlag,appendAuditEvent} from "@zuri/core-platform";
import {authenticate} from "./auth-middleware.js";
import {authorize} from "./authorization.js";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";

type Principal=PlatformPrincipal&{membershipId:string;sessionId:string};
const principal=(request:FastifyRequest)=>(request as FastifyRequest&{principal:Principal}).principal;
const orgs=(p:PlatformPrincipal)=>p.organizationIds??(p.organizationId?[p.organizationId]:[]);
const locations=(p:PlatformPrincipal)=>p.locationIds??[];
const scoped=<T extends {tenantId:string}>(tenantId:string,extra:Filter<T>={}):Filter<T>=>({$and:[{tenantId},extra]} as Filter<T>);
function fail(error:unknown,reply:FastifyReply){
 if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST",issues:error.issues.map(i=>({path:i.path,message:i.message}))});
 const code=error instanceof Error?error.message:"";
 if(["MEMBERSHIP_ALREADY_EXISTS","DUPLICATE_ORGANIZATION_SCOPE","DUPLICATE_LOCATION_SCOPE","DUPLICATE_ROLE_ASSIGNMENT"].includes(code))return reply.code(409).send({error:code});
 if(["PARENT_ORGANIZATION_NOT_FOUND","ORGANIZATION_NOT_FOUND","PARENT_LOCATION_NOT_FOUND","ACTIVE_USER_REQUIRED","TENANT_NOT_ACTIVE","INVALID_ORGANIZATION_SCOPE","INVALID_LOCATION_SCOPE","INVALID_ROLE_ASSIGNMENT"].includes(code))return reply.code(422).send({error:code});
 return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});
}
function permit(permission:string){return async(request:FastifyRequest,reply:FastifyReply)=>{const p=principal(request);if(!authorize(p,{permission,resourceTenantId:p.tenantId}))return reply.code(403).send({error:"FORBIDDEN"});};}
async function audit(db:Db,p:Principal,request:FastifyRequest,action:string,type:string,id:string|undefined){
 await appendAuditEvent(db,{tenantId:p.tenantId,actor:{userId:p.userId,ipHash:createHash("sha256").update(request.ip).digest("hex"),...(typeof request.headers["user-agent"]==="string"?{userAgent:request.headers["user-agent"].slice(0,512)}:{})},action,resourceType:type,...(id?{resourceId:id}:{}),outcome:"success",correlationId:request.id,metadata:{}});
}
export function platformRoutes(db:Db,config:AuthConfig):FastifyPluginAsync{
 return async app=>{
  const c=coreCollections(db);
  app.addHook("preHandler",authenticate(db,config));
  app.get("/platform/tenant",{preHandler:permit("platform.tenant.read")},async request=>{
   const p=principal(request);return {data:await c.tenants.findOne({tenantId:p.tenantId},{projection:{_id:0}})};
  });
  app.get("/platform/organizations",{preHandler:permit("platform.organizations.read")},async request=>{
   const p=principal(request),ids=orgs(p);if(!ids.length)return {data:[]};
   return {data:await c.organizations.find(scoped(p.tenantId,{organizationId:{$in:ids}}),{projection:{_id:0}}).sort({name:1}).toArray()};
  });
  app.post("/platform/organizations",{preHandler:permit("platform.organizations.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=z.object({code:z.string(),name:z.string(),type:z.enum(["group","company","business_unit","department","branch"]),parentOrganizationId:z.string().optional()}).parse(request.body);
    if(b.parentOrganizationId&&!orgs(p).includes(b.parentOrganizationId))return reply.code(403).send({error:"ORGANIZATION_SCOPE_DENIED"});
    if(!b.parentOrganizationId&&!p.permissions.includes("platform.organizations.create.root"))return reply.code(403).send({error:"ROOT_ORGANIZATION_CREATION_DENIED"});
    const result=await createOrganization(db,p.tenantId,p.userId,b);await audit(db,p,request,"platform.organization.created","organization",result.organizationId);
    return reply.code(201).send({data:result});
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/locations",{preHandler:permit("platform.locations.read")},async request=>{
   const p=principal(request),ids=locations(p);if(!ids.length)return {data:[]};
   return {data:await c.locations.find(scoped(p.tenantId,{locationId:{$in:ids}}),{projection:{_id:0}}).sort({name:1}).toArray()};
  });
  app.post("/platform/locations",{preHandler:permit("platform.locations.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=z.object({organizationId:z.string(),code:z.string(),name:z.string(),type:z.enum(["site","store","warehouse","office","other"]),parentLocationId:z.string().optional(),timezone:z.string().optional(),address:z.record(z.string()).optional()}).parse(request.body);
    if(!orgs(p).includes(b.organizationId))return reply.code(403).send({error:"ORGANIZATION_SCOPE_DENIED"});
    if(b.parentLocationId&&!locations(p).includes(b.parentLocationId))return reply.code(403).send({error:"LOCATION_SCOPE_DENIED"});
    const result=await createLocation(db,p.tenantId,p.userId,b);await audit(db,p,request,"platform.location.created","location",result.locationId);
    return reply.code(201).send({data:result});
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/memberships",{preHandler:permit("platform.memberships.read")},async request=>{
   const p=principal(request),ids=orgs(p);if(!ids.length)return {data:[]};
   return {data:await c.memberships.find(scoped(p.tenantId,{organizationIds:{$in:ids}}),{projection:{_id:0}}).sort({createdAt:-1}).limit(200).toArray()};
  });
  app.post("/platform/memberships",{preHandler:permit("platform.memberships.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=z.object({userId:z.string(),organizationIds:z.array(z.string()).min(1),locationIds:z.array(z.string()).default([]),roleIds:z.array(z.string()).default([])}).parse(request.body);
    if(b.organizationIds.some(x=>!orgs(p).includes(x))||b.locationIds.some(x=>!locations(p).includes(x)))return reply.code(403).send({error:"MEMBERSHIP_SCOPE_DENIED"});
    const result=await createMembership(db,p.tenantId,p.userId,b);await audit(db,p,request,"platform.membership.created","membership",result.membershipId);
    return reply.code(201).send({data:result});
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/roles",{preHandler:permit("platform.roles.read")},async request=>{
   const p=principal(request);return {data:await c.roles.find({tenantId:p.tenantId,status:"active"},{projection:{_id:0}}).sort({name:1}).toArray()};
  });
  app.post("/platform/roles",{preHandler:permit("platform.roles.create")},async(request,reply)=>{
   const p=principal(request);try{
    const b=z.object({key:z.string(),name:z.string(),description:z.string().optional(),permissionKeys:z.array(z.string()).max(500),isSystem:z.boolean().default(false)}).parse(request.body);
    const result=await createRole(db,p.tenantId,p.userId,b);await audit(db,p,request,"platform.role.created","role",result.roleId);
    return reply.code(201).send({data:result});
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/policies",{preHandler:permit("platform.policies.read")},async request=>{
   const p=principal(request);return {data:await c.policies.find({tenantId:p.tenantId},{projection:{_id:0}}).sort({priority:-1}).toArray()};
  });
  app.put("/platform/policies/:key",{preHandler:permit("platform.policies.write")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({key:z.string().min(2).max(100)}).parse(request.params);
    const b=z.object({effect:z.enum(["allow","deny"]),priority:z.number().int().min(0).max(10000),subject:z.record(z.unknown()).default({}),resource:z.record(z.unknown()).default({}),actions:z.array(z.string()).min(1),conditions:z.record(z.unknown()).default({})}).parse(request.body);
    const result=await upsertPolicy(db,p.tenantId,p.userId,{...b,key:params.key});await audit(db,p,request,"platform.policy.upserted","policy",result?.policyId);
    return {data:result};
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/feature-flags",{preHandler:permit("platform.feature-flags.read")},async request=>{
   const p=principal(request);return {data:await c.featureFlags.find({tenantId:p.tenantId},{projection:{_id:0}}).sort({key:1}).toArray()};
  });
  app.put("/platform/feature-flags/:key",{preHandler:permit("platform.feature-flags.write")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({key:z.string().min(2).max(100)}).parse(request.params);
    const b=z.object({enabled:z.boolean(),description:z.string().max(500).optional(),environments:z.array(z.string()).default(["development"]),rules:z.array(z.record(z.unknown())).default([])}).parse(request.body);
    const result=await setFeatureFlag(db,p.tenantId,p.userId,{...b,key:params.key});await audit(db,p,request,"platform.feature-flag.updated","feature_flag",params.key);
    return {data:result};
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/sessions",{preHandler:permit("platform.sessions.read")},async request=>{
   const p=principal(request),q=z.object({userId:z.string().optional(),activeOnly:z.coerce.boolean().default(true)}).parse(request.query);
   const all=p.permissions.includes("platform.sessions.read.all"),userId=all?q.userId??undefined:p.userId;
   const filter:Filter<SessionDocument>={tenantId:p.tenantId,...(userId?{userId}:{}),...(q.activeOnly?{revokedAt:{$exists:false}}:{})};
   return {data:await c.sessions.find(filter,{projection:{_id:0,refreshTokenHash:0,refreshTokenHistory:0}}).sort({lastUsedAt:-1}).limit(200).toArray()};
  });
  app.post("/platform/sessions/:sessionId/revoke",{preHandler:permit("platform.sessions.revoke")},async(request,reply)=>{
   const p=principal(request);try{
    const {sessionId}=z.object({sessionId:z.string().min(1)}).parse(request.params);
    const filter={tenantId:p.tenantId,sessionId,...(p.permissions.includes("platform.sessions.revoke.all")?{}:{userId:p.userId}),revokedAt:{$exists:false}};
    const result=await c.sessions.updateOne(filter,{$set:{revokedAt:new Date(),updatedAt:new Date(),updatedBy:p.userId}});
    if(!result.matchedCount)return reply.code(404).send({error:"SESSION_NOT_FOUND"});
    await audit(db,p,request,"platform.session.revoked","session",sessionId);return reply.code(204).send();
   }catch(e){return fail(e,reply);}
  });
  app.get("/platform/audit-events",{preHandler:permit("platform.audit.read")},async request=>{
   const p=principal(request),q=z.object({action:z.string().optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).parse(request.query);
   const filter:Filter<AuditEventDocument>={tenantId:p.tenantId,...(q.action?{action:q.action}:{})};
   return {data:await c.auditEvents.find(filter,{projection:{_id:0}}).sort({occurredAt:-1}).limit(q.limit).toArray()};
  });
 };
}
