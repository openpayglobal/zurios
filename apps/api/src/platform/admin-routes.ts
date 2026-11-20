import {createHmac,randomUUID} from "node:crypto";
import type {ClientSession,Db,Document,Filter} from "mongodb";
import type {FastifyPluginAsync,FastifyReply,FastifyRequest} from "fastify";
import {ZodError,z} from "zod";
import {
 coreCollections,evaluatePolicy,runIdempotentMutation,appendAuditEvent,appendOutboxEvent,
 provisionTenant,createOrganization,createRole,createUser,createMembership,setMembershipStatus,
 createApprovalRequest,approveApprovalRequest,rejectApprovalRequest,completeApprovalRequest,
 upsertPolicy,setFeatureFlag,createBreakGlassGrant,revokeBreakGlassGrant,setTenantStatus,setOrganizationStatus,setLocationStatus,
 type AuditEventDocument,type ApprovalRequestDocument,BREAK_GLASS_ALLOWED_PERMISSIONS
} from "@zuri/core-platform";
import {encryptInvitationToken} from "./auth-crypto.js";
import {issueMembershipInvitation} from "./auth-service.js";
import {authenticate} from "./auth-middleware.js";
import {authorize} from "./authorization.js";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";
import {upsertPolicySchema,featureFlagSchema} from "./platform-schemas.js";
import {reasonSchema,approvalScopeSchema,inviteUserSchema,createApprovalRequestSchema,approvalDecisionSchema,policySimulationSchema,createAuditExportSchema,breakGlassRevokeSchema,configurationUpdateSchema,provisionTenantSchema,lifecycleRequestSchema,tenantLifecycleRequestSchema} from "./admin-schemas.js";

type Principal=PlatformPrincipal&{membershipId:string;sessionId:string};
type MutationResult={statusCode:number;body:unknown};
const principal=(request:FastifyRequest)=>(request as FastifyRequest&{principal:Principal}).principal;
const orgIds=(p:Principal)=>p.organizationIds??(p.organizationId?[p.organizationId]:[]);
const locIds=(p:Principal)=>p.locationIds??[];
const hashIp=(request:FastifyRequest,secret:string)=>createHmac("sha256",secret).update(request.ip).digest("hex");
function fail(error:unknown,reply:FastifyReply){
 if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_REQUEST",issues:error.issues.map(issue=>({path:issue.path,message:issue.message}))});
 const code=error instanceof Error?error.message:"";
 if(error&&typeof error==="object"&&"code" in error&&(error as {code?:number}).code===11000)return reply.code(409).send({error:"RESOURCE_CONFLICT"});
 if(/NOT_FOUND/.test(code))return reply.code(404).send({error:code});
 if(/CONFLICT|ALREADY_EXISTS|SELF_APPROVAL|IDEMPOTENCY/.test(code))return reply.code(409).send({error:code});
 if(/DENIED|NOT_PERMITTED|ESCALATION|FORBIDDEN/.test(code))return reply.code(403).send({error:code});
 if(/INVALID|REQUIRED|EXPIRED|NOT_ACTIVE|NOT_PENDING|STATE_|ELIGIBLE|DEPENDENCIES/.test(code))return reply.code(422).send({error:code});
 return reply.code(500).send({error:"INTERNAL_SERVER_ERROR"});
}
async function writeAudit(db:Db,tenantId:string,p:Principal,request:FastifyRequest,secret:string,action:string,resourceType:string,resourceId:string|undefined,outcome:"success"|"denied"|"failure",metadata:Record<string,unknown>={},session?:ClientSession){
 await appendAuditEvent(db,{tenantId,actor:{userId:p.userId,ipHash:hashIp(request,secret),...(typeof request.headers["user-agent"]==="string"?{userAgent:request.headers["user-agent"].slice(0,512)}:{})},action,resourceType,...(resourceId?{resourceId}:{}),outcome,correlationId:request.id,metadata:{...metadata,...(p.emergencyGrantIds?.length?{emergencyGrantIds:p.emergencyGrantIds}:{})}},session);
}
async function checkTenantPermission(db:Db,secret:string,permission:string,request:FastifyRequest,reply:FastifyReply,p:Principal):Promise<boolean>{
 if(!authorize(p,{permission,resourceTenantId:p.tenantId})){
  await writeAudit(db,p.tenantId,p,request,secret,"authorization.denied","platform_admin",request.routeOptions.url,"denied",{permission});
  reply.code(403).send({error:"FORBIDDEN"});return false;
 }
 const decision=await evaluatePolicy(db,p.tenantId,{subject:{userId:p.userId,roleKeys:p.roleKeys,...p.attributes},resource:{tenantId:p.tenantId,resourceType:"platform_admin",path:request.routeOptions.url??"",method:request.method},action:permission,environment:{}});
 if(decision.reason==="EXPLICIT_DENY"){
  await writeAudit(db,p.tenantId,p,request,secret,"authorization.denied","platform_admin",request.routeOptions.url,"denied",{permission,code:"ABAC_POLICY_DENIED"});
  reply.code(403).send({error:"ABAC_POLICY_DENIED"});return false;
 }
 return true;
}
async function checkPlatformPermission(db:Db,secret:string,permission:string,request:FastifyRequest,reply:FastifyReply,p:Principal):Promise<boolean>{
 if(!p.platformPermissions?.includes(permission)){
  await writeAudit(db,p.tenantId,p,request,secret,"authorization.denied","platform_admin",request.routeOptions.url,"denied",{permission,scope:"platform"});
  reply.code(403).send({error:"PLATFORM_PERMISSION_REQUIRED"});return false;
 }
 const decision=await evaluatePolicy(db,"platform",{subject:{userId:p.userId},resource:{resourceType:"platform_admin",path:request.routeOptions.url??"",method:request.method},action:permission,environment:{}});
 if(decision.reason==="EXPLICIT_DENY"){
  await writeAudit(db,"platform",p,request,secret,"authorization.denied","platform_admin",request.routeOptions.url,"denied",{permission,scope:"platform",code:"ABAC_POLICY_DENIED"});
  reply.code(403).send({error:"ABAC_POLICY_DENIED"});return false;
 }
 return true;
}
function tenantGuard(db:Db,secret:string,permission:string){
 return async(request:FastifyRequest,reply:FastifyReply)=>checkTenantPermission(db,secret,permission,request,reply,principal(request));
}
function platformGuard(db:Db,secret:string,permission:string){
 return async(request:FastifyRequest,reply:FastifyReply)=>checkPlatformPermission(db,secret,permission,request,reply,principal(request));
}
async function mutate(db:Db,request:FastifyRequest,reply:FastifyReply,p:Principal,secret:string,scopeTenantId:string,operation:string,work:(session:ClientSession)=>Promise<MutationResult>){
 const key=request.headers["idempotency-key"];
 if(typeof key!=="string"||key.length<8||key.length>128)return reply.code(400).send({error:"IDEMPOTENCY_KEY_REQUIRED"});
 try{
  const result=await runIdempotentMutation(db,{tenantId:scopeTenantId,actorId:p.userId,operation,key,request:{method:request.method,path:request.url,params:request.params??{},body:request.body??null}},work);
  reply.header("Idempotency-Replayed",result.replayed?"true":"false");
  return reply.code(result.statusCode).send(result.body);
 }catch(error){
  try{await writeAudit(db,scopeTenantId,p,request,secret,operation+".failed","platform_admin",request.routeOptions.url,"failure",{errorCode:error instanceof Error?error.message:"MUTATION_FAILED"});}
  catch(auditError){request.log.error({err:auditError,correlationId:request.id},"Failed to persist administration failure audit");}
  return fail(error,reply);
 }
}
async function emit(db:Db,session:ClientSession,tenantId:string,request:FastifyRequest,eventType:string,aggregateType:string,aggregateId:string,payload:Record<string,unknown>){
 await appendOutboxEvent(db,session,{tenantId,eventType,aggregateType,aggregateId,payload,correlationId:request.id});
}

function validateApprovalPayload(action:string,payload:unknown){
 if(action==="membership.suspend"||action==="membership.reactivate"||action==="membership.revoke"||action==="organization.deactivate"||action==="location.deactivate")return z.object({}).strict().parse(payload??{});
 if(action==="policy.apply")return z.object({key:z.string().min(2).max(100),...upsertPolicySchema.shape}).parse(payload);
 if(action==="feature_flag.set")return z.object({key:z.string().min(2).max(100),...featureFlagSchema.shape}).parse(payload);
 if(action==="break_glass.grant")return z.object({
  userId:z.string().min(1),permissionKeys:z.array(z.string().min(1).refine(value=>BREAK_GLASS_ALLOWED_PERMISSIONS.includes(value as typeof BREAK_GLASS_ALLOWED_PERMISSIONS[number]))).min(1).max(20),
  organizationIds:z.array(z.string().min(1)).default([]),locationIds:z.array(z.string().min(1)).default([]),
  durationMinutes:z.number().int().min(1).max(60)
 }).refine(value=>value.organizationIds.length>0||value.locationIds.length>0,{message:"Break-glass scope is required"}).parse(payload);
 if(action.startsWith("tenant."))return z.object({}).strict().parse(payload??{});
 throw new Error("APPROVAL_ACTION_NOT_ALLOWED");
}
async function executeApprovedAction(db:Db,session:ClientSession,request:ApprovalRequestDocument,actorId:string){
 switch(request.action){
  case "membership.suspend":return setMembershipStatus(db,request.tenantId,request.targetId,"suspended",actorId,session);
  case "membership.reactivate":return setMembershipStatus(db,request.tenantId,request.targetId,"active",actorId,session);
  case "membership.revoke":return setMembershipStatus(db,request.tenantId,request.targetId,"revoked",actorId,session);
  case "organization.deactivate":return setOrganizationStatus(db,request.tenantId,request.targetId,"inactive",actorId,session);
  case "location.deactivate":return setLocationStatus(db,request.tenantId,request.targetId,"inactive",actorId,session);
  case "policy.apply":{
   const d=request.payload as {key:string;effect:"allow"|"deny";priority:number;subject:Record<string,unknown>;resource:Record<string,unknown>;actions:string[];conditions:Record<string,unknown>};
   return upsertPolicy(db,request.tenantId,actorId,d,session);
  }
  case "feature_flag.set":{
   const d=request.payload as {key:string;enabled:boolean;description?:string;environments:string[];rules:Record<string,unknown>[]};
   return setFeatureFlag(db,request.tenantId,actorId,d,session);
  }
  case "break_glass.grant":{
   const d=request.payload as {userId:string;permissionKeys:string[];organizationIds:string[];locationIds:string[];durationMinutes:number};
   const user=await coreCollections(db).users.findOne({userId:d.userId,status:"active"},{session});
   if(!user)throw new Error("BREAK_GLASS_USER_NOT_ACTIVE");
   if(d.organizationIds.length&&await coreCollections(db).organizations.countDocuments({tenantId:request.tenantId,organizationId:{$in:d.organizationIds},status:"active"},{session})!==d.organizationIds.length)throw new Error("INVALID_BREAK_GLASS_ORGANIZATION_SCOPE");
   if(d.locationIds.length&&await coreCollections(db).locations.countDocuments({tenantId:request.tenantId,locationId:{$in:d.locationIds},status:"active"},{session})!==d.locationIds.length)throw new Error("INVALID_BREAK_GLASS_LOCATION_SCOPE");
   return createBreakGlassGrant(db,session,{tenantId:request.tenantId,...d,reason:request.reason,requestedBy:request.requestedBy,approvedBy:actorId});
  }
  case "tenant.activate":return setTenantStatus(db,request.targetId,"active",actorId,session);
  case "tenant.suspend":return setTenantStatus(db,request.targetId,"suspended",actorId,session);
  case "tenant.close":return setTenantStatus(db,request.targetId,"closed",actorId,session);
  default:throw new Error("APPROVAL_ACTION_NOT_ALLOWED");
 }
}
export function adminRoutes(db:Db,config:AuthConfig):FastifyPluginAsync{
 return async app=>{
  const c=coreCollections(db);
  app.addHook("preHandler",authenticate(db,config));
  app.get("/platform/admin/overview",{preHandler:tenantGuard(db,config.jwtSecret,"platform.admin.overview.read")},async request=>{
   const p=principal(request),tenantId=p.tenantId,now=new Date(),dayAgo=new Date(now.getTime()-24*60*60_000),tenantWide=p.permissions.includes("platform.admin.overview.read.all");
   const visibleOrganizations=orgIds(p),visibleLocations=locIds(p);
   const membershipFilter:Filter<Document>={tenantId,status:"active",...(tenantWide?{}:{organizationIds:{$in:visibleOrganizations}})};
   const [tenant,organizations,locations,memberships,users,roles,pendingApprovals,activeSessions,recentAudit,pendingOutbox,deadLetters]=await Promise.all([
    c.tenants.findOne({tenantId},{projection:{_id:0}}),
    c.organizations.countDocuments({tenantId,status:"active",...(tenantWide?{}:{organizationId:{$in:visibleOrganizations}})}),
    c.locations.countDocuments({tenantId,status:"active",...(tenantWide?{}:{locationId:{$in:visibleLocations}})}),
    c.memberships.countDocuments(membershipFilter),c.memberships.distinct("userId",membershipFilter),
    tenantWide?c.roles.countDocuments({tenantId,status:"active"}):Promise.resolve(null),
    tenantWide?db.collection("approval_requests").countDocuments({tenantId,status:"pending",expiresAt:{$gt:now}}):Promise.resolve(null),
    tenantWide?c.sessions.countDocuments({tenantId,revokedAt:{$exists:false},expiresAt:{$gt:now}}):Promise.resolve(null),
    tenantWide?c.auditEvents.countDocuments({tenantId,occurredAt:{$gte:dayAgo}}):Promise.resolve(null),
    tenantWide?db.collection("outbox_events").countDocuments({tenantId,status:{$in:["pending","processing"]}}):Promise.resolve(null),
    tenantWide?db.collection("outbox_events").countDocuments({tenantId,status:"dead_letter"}):Promise.resolve(null)
   ]);
   return {data:{tenant,scope:tenantWide?"tenant":"assigned-organizations",counts:{organizations,locations,memberships,users:users.length,roles,activeSessions},governance:tenantWide?{pendingApprovals,recentAuditEvents:recentAudit}:null,events:tenantWide?{pending:pendingOutbox,deadLettered:deadLetters}:null,generatedAt:now}};
  });
  app.get("/platform/admin/users",{preHandler:tenantGuard(db,config.jwtSecret,"platform.users.read")},async(request,reply)=>{
   try{
    const query=z.object({q:z.string().max(80).optional(),status:z.enum(["invited","active","suspended","locked"]).optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).parse(request.query);
    const p=principal(request),visibleOrgIds=orgIds(p),all=p.permissions.includes("platform.users.read.all");
    if(!all&&!visibleOrgIds.length)return {data:[]};
    const membershipFilter:Filter<Document>={tenantId:p.tenantId,status:{$in:["invited","active","suspended"]},...(all?{}:{organizationIds:{$in:visibleOrgIds}})};
    const memberships=await c.memberships.find(membershipFilter,{projection:{_id:0}}).sort({createdAt:-1}).limit(500).toArray();
    const userIds=[...new Set(memberships.map(m=>m.userId))];if(!userIds.length)return {data:[]};
    const escaped=query.q?.replaceAll("\\","\\\\").replaceAll(".","\\.").replaceAll("*","\\*").replaceAll("+","\\+").replaceAll("?","\\?").replaceAll("^","\\^").replaceAll("$","\\$").replaceAll("{","\\{").replaceAll("}","\\}").replaceAll("(","\\(").replaceAll(")","\\)").replaceAll("|","\\|");
    const search=escaped?new RegExp(escaped,"i"):undefined;
    const userFilter:Filter<Document>={userId:{$in:userIds},...(query.status?{status:query.status}:{}),...(search?{$or:[{emailNormalized:search},{displayName:search}]}:{})};
    const users=await c.users.find(userFilter,{projection:{_id:0,passwordHash:0,mfaSecretEncrypted:0,pendingMfaSecretEncrypted:0,mfaRecoveryCodeHashes:0,mfaLastUsedStep:0,invitationTokenHash:0,invitationExpiresAt:0,emailVerificationTokenHash:0,emailVerificationExpiresAt:0,passwordResetTokenHash:0,passwordResetExpiresAt:0,failedLoginCount:0,lockedUntil:0}}).sort({displayName:1}).limit(query.limit).toArray();
    const byUser=new Map<string,typeof memberships>();for(const membership of memberships){const list=byUser.get(membership.userId)??[];list.push(membership);byUser.set(membership.userId,list);}
    const visibleLocations=new Set(locIds(p));
    return {data:users.map(user=>({...user,memberships:(byUser.get(user.userId)??[]).map(m=>({...m,organizationIds:all?m.organizationIds:m.organizationIds.filter(id=>visibleOrgIds.includes(id)),locationIds:all?m.locationIds:m.locationIds.filter(id=>visibleLocations.has(id))}))}))};
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/users/invitations",{preHandler:tenantGuard(db,config.jwtSecret,"platform.users.invite")},async(request,reply)=>{
   const p=principal(request);if(!config.mfaEncryptionKey)return reply.code(503).send({error:"INVITATION_ENCRYPTION_NOT_CONFIGURED"});
   try{
    const body=inviteUserSchema.parse(request.body);
    if(body.organizationIds.some(id=>!orgIds(p).includes(id))||body.locationIds.some(id=>!locIds(p).includes(id)))return reply.code(403).send({error:"INVITATION_SCOPE_DENIED"});
    if(body.roleIds.length&&!p.permissions.includes("platform.memberships.assign.roles"))return reply.code(403).send({error:"ROLE_ASSIGNMENT_NOT_PERMITTED"});
    const assignedRoles=body.roleIds.length?await c.roles.find({tenantId:p.tenantId,roleId:{$in:body.roleIds},status:"active"}).toArray():[];
    const escalation=assignedRoles.some(role=>role.permissionKeys.some(permission=>!p.permissions.includes(permission)));
    if(escalation&&!p.permissions.includes("platform.memberships.assign.privileged"))return reply.code(403).send({error:"ROLE_ASSIGNMENT_PRIVILEGE_ESCALATION_DENIED"});
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.users.invite",async session=>{
     const email=body.email.trim().toLowerCase(),existing=await c.users.findOne({emailNormalized:email},{session});
     if(existing&&!(existing.status==="active"||existing.status==="invited"))throw new Error("USER_NOT_ELIGIBLE_FOR_INVITATION");
     const user=existing??await createUser(db,p.userId,{email,displayName:body.displayName,...(body.phoneE164?{phoneE164:body.phoneE164}:{})},session);
     const membership=await createMembership(db,p.tenantId,p.userId,{userId:user.userId,organizationIds:body.organizationIds,locationIds:body.locationIds,roleIds:body.roleIds},session,{allowInvitedUser:true,forceInvited:true});
     const token=await issueMembershipInvitation(db,membership.membershipId,7*24*60*60,session);
     const encryptedToken=encryptInvitationToken(token,config.mfaEncryptionKey);
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"identity.membership.invitation.created","membership",membership.membershipId,"success",{reason:body.reason,emailDomain:email.split("@")[1]},session);
     await emit(db,session,p.tenantId,request,"identity.membership.invitation.requested","membership",membership.membershipId,{membershipId:membership.membershipId,userId:user.userId,recipientEmail:email,displayName:body.displayName,encryptedInvitationToken:encryptedToken,deliveryChannel:"email"});
     return {statusCode:202,body:{data:{userId:user.userId,membershipId:membership.membershipId,status:"invited",deliveryStatus:"queued"}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/users/invitations/:membershipId/resend",{preHandler:tenantGuard(db,config.jwtSecret,"platform.users.invite")},async(request,reply)=>{
   const p=principal(request);if(!config.mfaEncryptionKey)return reply.code(503).send({error:"INVITATION_ENCRYPTION_NOT_CONFIGURED"});
   try{
    const params=z.object({membershipId:z.string().min(1)}).parse(request.params),body=lifecycleRequestSchema.parse(request.body);
    const membership=await c.memberships.findOne({tenantId:p.tenantId,membershipId:params.membershipId,status:"invited"});
    if(!membership)return reply.code(404).send({error:"INVITED_MEMBERSHIP_NOT_FOUND"});
    const user=await c.users.findOne({userId:membership.userId,status:{$in:["active","invited"]}});
    if(!user)return reply.code(422).send({error:"INVITED_USER_NOT_ELIGIBLE"});
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.users.invitation.resend",async session=>{
     const token=await issueMembershipInvitation(db,params.membershipId,7*24*60*60,session);
     const encryptedToken=encryptInvitationToken(token,config.mfaEncryptionKey);
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"identity.membership.invitation.resent","membership",params.membershipId,"success",{reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"identity.membership.invitation.requested","membership",params.membershipId,{membershipId:params.membershipId,userId:user.userId,recipientEmail:user.emailNormalized,displayName:user.displayName,encryptedInvitationToken:encryptedToken,deliveryChannel:"email"});
     return {statusCode:202,body:{data:{membershipId:params.membershipId,status:"invited",deliveryStatus:"queued"}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/approvals",async(request,reply)=>{
   const p=principal(request);try{
    const query=z.object({scope:approvalScopeSchema.default("tenant"),status:z.enum(["pending","approved","rejected","executed","expired"]).optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).parse(request.query);
    const scopeTenantId=query.scope==="platform"?"platform":p.tenantId;
    if(query.scope==="platform"&&!await checkPlatformPermission(db,config.jwtSecret,"platform.approvals.read",request,reply,p))return;
    if(query.scope==="tenant"&&!await checkTenantPermission(db,config.jwtSecret,"platform.approvals.read",request,reply,p))return;
    return {data:await db.collection<ApprovalRequestDocument>("approval_requests").find({tenantId:scopeTenantId,...(query.status?{status:query.status}:{})}).sort({createdAt:-1}).limit(query.limit).toArray()};
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/approvals",{preHandler:tenantGuard(db,config.jwtSecret,"platform.approvals.create")},async(request,reply)=>{
   const p=principal(request);try{
    const body=createApprovalRequestSchema.parse(request.body);
    const payload=validateApprovalPayload(body.action,body.payload);
    const requestPermission=body.action.startsWith("membership.")?"platform.memberships.manage.request":body.action==="organization.deactivate"?"platform.organizations.manage.request":body.action==="location.deactivate"?"platform.locations.manage.request":body.action==="policy.apply"?"platform.policies.write.request":body.action==="feature_flag.set"?"platform.feature-flags.write.request":"platform.breakglass.request";
    if(!p.permissions.includes(requestPermission))return reply.code(403).send({error:"APPROVAL_REQUEST_NOT_PERMITTED"});
    if(body.action.startsWith("membership.")&&body.targetType!=="membership")return reply.code(400).send({error:"INVALID_APPROVAL_TARGET"});
    if(body.action==="organization.deactivate"&&body.targetType!=="organization")return reply.code(400).send({error:"INVALID_APPROVAL_TARGET"});
    if(body.action==="location.deactivate"&&body.targetType!=="location")return reply.code(400).send({error:"INVALID_APPROVAL_TARGET"});
    if(body.action==="policy.apply"&&(body.targetType!=="policy"||body.targetId!==(payload as {key:string}).key))return reply.code(400).send({error:"INVALID_APPROVAL_TARGET"});
    if(body.action==="feature_flag.set"&&(body.targetType!=="feature_flag"||body.targetId!==(payload as {key:string}).key))return reply.code(400).send({error:"INVALID_APPROVAL_TARGET"});
    if(body.action==="break_glass.grant"&&(body.targetType!=="user"||body.targetId!==(payload as {userId:string}).userId))return reply.code(400).send({error:"INVALID_APPROVAL_TARGET"});

    if(body.action.startsWith("tenant."))return reply.code(403).send({error:"PLATFORM_SCOPE_REQUIRED"});
    if(body.action.startsWith("membership.")&&!await c.memberships.findOne({tenantId:p.tenantId,membershipId:body.targetId}))return reply.code(404).send({error:"MEMBERSHIP_NOT_FOUND"});
    if(body.action==="organization.deactivate"&&((!p.permissions.includes("platform.organizations.manage.all")&&!orgIds(p).includes(body.targetId))||!await c.organizations.findOne({tenantId:p.tenantId,organizationId:body.targetId,status:"active"})))return reply.code(404).send({error:"ORGANIZATION_NOT_FOUND_IN_SCOPE"});
    if(body.action==="location.deactivate"&&((!p.permissions.includes("platform.locations.manage.all")&&!locIds(p).includes(body.targetId))||!await c.locations.findOne({tenantId:p.tenantId,locationId:body.targetId,status:"active"})))return reply.code(404).send({error:"LOCATION_NOT_FOUND_IN_SCOPE"});
    if(body.action==="break_glass.grant"){
     const bg=payload as {userId:string;organizationIds:string[];locationIds:string[]};
     if(bg.organizationIds.some(id=>!orgIds(p).includes(id))||bg.locationIds.some(id=>!locIds(p).includes(id)))return reply.code(403).send({error:"BREAK_GLASS_SCOPE_DENIED"});
     if(!await c.users.findOne({userId:bg.userId,status:"active"}))return reply.code(422).send({error:"BREAK_GLASS_USER_NOT_ACTIVE"});
     if(bg.organizationIds.length&&await c.organizations.countDocuments({tenantId:p.tenantId,organizationId:{$in:bg.organizationIds},status:"active"})!==bg.organizationIds.length)return reply.code(422).send({error:"INVALID_BREAK_GLASS_ORGANIZATION_SCOPE"});
     if(bg.locationIds.length&&await c.locations.countDocuments({tenantId:p.tenantId,locationId:{$in:bg.locationIds},status:"active"})!==bg.locationIds.length)return reply.code(422).send({error:"INVALID_BREAK_GLASS_LOCATION_SCOPE"});
    }
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.approvals.create",async session=>{
     const result=await createApprovalRequest(db,session,{tenantId:p.tenantId,scope:"tenant",action:body.action,targetType:body.targetType,targetId:body.targetId,payload,reason:body.reason,requestedBy:p.userId,correlationId:request.id,ttlSeconds:body.ttlSeconds});
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"platform.approval.requested","approval",result.requestId,"success",{action:body.action,targetType:body.targetType,targetId:body.targetId,reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"platform.approval.requested","approval",result.requestId,{requestId:result.requestId,action:body.action});
     return {statusCode:201,body:{data:result}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/approvals/:requestId/approve",async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({requestId:z.string().min(1)}).parse(request.params),query=z.object({scope:approvalScopeSchema.default("tenant")}).parse(request.query),body=approvalDecisionSchema.parse(request.body);
    const scopeTenantId=query.scope==="platform"?"platform":p.tenantId;
    if(query.scope==="platform"&&!await checkPlatformPermission(db,config.jwtSecret,"platform.approvals.approve",request,reply,p))return;
    if(query.scope==="tenant"&&!await checkTenantPermission(db,config.jwtSecret,"platform.approvals.approve",request,reply,p))return;
    return await mutate(db,request,reply,p,config.jwtSecret,scopeTenantId,"platform.approvals.approve",async session=>{
     const approval=await approveApprovalRequest(db,session,{tenantId:scopeTenantId,requestId:params.requestId,approverId:p.userId,reason:body.reason});
     if(query.scope==="tenant"&&approval.scope!=="tenant")throw new Error("APPROVAL_SCOPE_MISMATCH");
     if(query.scope==="platform"&&approval.scope!=="platform")throw new Error("APPROVAL_SCOPE_MISMATCH");
     if(approval.action==="membership.suspend"||approval.action==="membership.reactivate"||approval.action==="membership.revoke"){
      if(!p.permissions.includes("platform.memberships.manage"))throw new Error("MEMBERSHIP_MANAGEMENT_NOT_PERMITTED");
     }else if(approval.action==="policy.apply"){
      if(!p.permissions.includes("platform.policies.write"))throw new Error("POLICY_WRITE_NOT_PERMITTED");
      const policy=approval.payload as {effect:"allow"|"deny";subject:Record<string,unknown>;resource:Record<string,unknown>;conditions:Record<string,unknown>};
      if(policy.effect==="allow"&&!p.permissions.includes("platform.policies.write.allow"))throw new Error("POLICY_ALLOW_NOT_PERMITTED");
      if(policy.effect==="deny"&&!p.permissions.includes("platform.policies.write.deny"))throw new Error("POLICY_DENY_NOT_PERMITTED");
      if(!Object.keys(policy.subject).length&&!Object.keys(policy.resource).length&&!Object.keys(policy.conditions).length&&!p.permissions.includes("platform.policies.write.global"))throw new Error("GLOBAL_POLICY_NOT_PERMITTED");
     }else if(approval.action==="feature_flag.set"&&!p.permissions.includes("platform.feature-flags.write"))throw new Error("FEATURE_FLAG_WRITE_NOT_PERMITTED");
     else if(approval.action==="break_glass.grant"&&!p.permissions.includes("platform.breakglass.grant"))throw new Error("BREAK_GLASS_GRANT_NOT_PERMITTED");
     else if(approval.action.startsWith("tenant.")&&!p.platformPermissions?.includes("platform.tenants.lifecycle.approve"))throw new Error("PLATFORM_TENANT_LIFECYCLE_NOT_PERMITTED");
     const result=await executeApprovedAction(db,session,approval,p.userId);
     await completeApprovalRequest(db,session,scopeTenantId,params.requestId,p.userId);
     await writeAudit(db,scopeTenantId,p,request,config.jwtSecret,"platform.approval.executed","approval",params.requestId,"success",{action:approval.action,requestedBy:approval.requestedBy,approvedBy:p.userId,reason:body.reason},session);
     await emit(db,session,scopeTenantId,request,"platform.approval.executed","approval",params.requestId,{requestId:params.requestId,action:approval.action});
     return {statusCode:200,body:{data:{requestId:params.requestId,status:"executed",result}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/approvals/:requestId/reject",async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({requestId:z.string().min(1)}).parse(request.params),query=z.object({scope:approvalScopeSchema.default("tenant")}).parse(request.query),body=approvalDecisionSchema.parse(request.body);
    const scopeTenantId=query.scope==="platform"?"platform":p.tenantId;
    if(query.scope==="platform"&&!p.platformPermissions?.includes("platform.approvals.approve"))return reply.code(403).send({error:"PLATFORM_PERMISSION_REQUIRED"});
    if(query.scope==="tenant"&&!p.permissions.includes("platform.approvals.approve"))return reply.code(403).send({error:"FORBIDDEN"});
    return await mutate(db,request,reply,p,config.jwtSecret,scopeTenantId,"platform.approvals.reject",async session=>{
     const result=await rejectApprovalRequest(db,session,{tenantId:scopeTenantId,requestId:params.requestId,reviewerId:p.userId,reason:body.reason});
     await writeAudit(db,scopeTenantId,p,request,config.jwtSecret,"platform.approval.rejected","approval",params.requestId,"success",{requestedBy:result.requestedBy,reason:body.reason},session);
     await emit(db,session,scopeTenantId,request,"platform.approval.rejected","approval",params.requestId,{requestId:params.requestId,action:result.action});
     return {statusCode:200,body:{data:{requestId:params.requestId,status:"rejected"}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/policies/simulate",{preHandler:tenantGuard(db,config.jwtSecret,"platform.policies.simulate")},async(request,reply)=>{
   try{
    const body=policySimulationSchema.parse(request.body);
    const p=principal(request);
    return {data:await evaluatePolicy(db,p.tenantId,{subject:{userId:p.userId,...body.subject},resource:{tenantId:p.tenantId,...body.resource},action:body.action,environment:body.environment})};
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/audit-events",{preHandler:tenantGuard(db,config.jwtSecret,"platform.audit.read")},async(request,reply)=>{
   try{
    const q=z.object({action:z.string().optional(),actorUserId:z.string().optional(),resourceType:z.string().optional(),outcome:z.enum(["success","denied","failure"]).optional(),correlationId:z.string().optional(),from:z.string().datetime().optional(),to:z.string().datetime().optional(),limit:z.coerce.number().int().min(1).max(200).default(50)}).parse(request.query);
    const p=principal(request),filter:Filter<AuditEventDocument>={tenantId:p.tenantId,...(q.action?{action:q.action}:{}),...(q.actorUserId?{"actor.userId":q.actorUserId}:{}),...(q.resourceType?{resourceType:q.resourceType}:{}),...(q.outcome?{outcome:q.outcome}:{}),...(q.correlationId?{correlationId:q.correlationId}:{}),...(q.from||q.to?{occurredAt:{...(q.from?{$gte:new Date(q.from)}:{}),...(q.to?{$lte:new Date(q.to)}:{})}}:{})};
    return {data:await c.auditEvents.find(filter,{projection:{_id:0}}).sort({occurredAt:-1}).limit(q.limit).toArray()};
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/audit-exports",{preHandler:tenantGuard(db,config.jwtSecret,"platform.audit.export")},async(request,reply)=>{
   try{
    const p=principal(request),query=z.object({limit:z.coerce.number().int().min(1).max(100).default(25)}).parse(request.query);
    return {data:await db.collection("audit_export_jobs").find({tenantId:p.tenantId},{projection:{_id:0}}).sort({createdAt:-1}).limit(query.limit).toArray()};
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/audit-exports",{preHandler:tenantGuard(db,config.jwtSecret,"platform.audit.export")},async(request,reply)=>{
   const p=principal(request);try{
    const body=createAuditExportSchema.parse(request.body);
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.audit.export.request",async session=>{
     const now=new Date(),jobId="aex_"+randomUUID(),doc={jobId,tenantId:p.tenantId,filters:body.filters,reason:body.reason,requestedBy:p.userId,status:"queued",createdAt:now,updatedAt:now};
     await db.collection("audit_export_jobs").insertOne(doc,{session});
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"platform.audit.export.requested","audit_export",jobId,"success",{reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"platform.audit.export.requested","audit_export",jobId,{jobId,filters:body.filters});
     return {statusCode:202,body:{data:{jobId,status:"queued"}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/break-glass",{preHandler:tenantGuard(db,config.jwtSecret,"platform.breakglass.read")},async request=>{
   const p=principal(request);return {data:await db.collection("break_glass_grants").find({tenantId:p.tenantId}).sort({createdAt:-1}).limit(100).toArray()};
  });
  app.post("/platform/admin/break-glass/:grantId/revoke",{preHandler:tenantGuard(db,config.jwtSecret,"platform.breakglass.revoke")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({grantId:z.string().min(1)}).parse(request.params),body=breakGlassRevokeSchema.parse(request.body);
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.breakglass.revoke",async session=>{
     await revokeBreakGlassGrant(db,session,p.tenantId,params.grantId,p.userId);
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"platform.breakglass.revoked","break_glass_grant",params.grantId,"success",{reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"platform.breakglass.revoked","break_glass_grant",params.grantId,{grantId:params.grantId});
     return {statusCode:200,body:{data:{grantId:params.grantId,status:"revoked"}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/configuration",{preHandler:tenantGuard(db,config.jwtSecret,"platform.configuration.read")},async request=>{
   const p=principal(request);return {data:await db.collection("tenant_config").find({tenantId:p.tenantId},{projection:{_id:0}}).sort({key:1}).toArray()};
  });
  app.put("/platform/admin/configuration/:key",{preHandler:tenantGuard(db,config.jwtSecret,"platform.configuration.write")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({key:z.enum(["defaultLocale","defaultCurrency","timezone","displayName"])}).parse(request.params);
    const body=configurationUpdateSchema.parse(request.body);
    const valueSchemas:Record<string,z.ZodTypeAny>={defaultLocale:z.string().min(2).max(20),defaultCurrency:z.string().length(3).transform(v=>v.toUpperCase()),timezone:z.string().min(1).max(80),displayName:z.string().min(2).max(100)};
    const value=valueSchemas[params.key]!.parse(body.value);
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.configuration.update",async session=>{
     const now=new Date(),result=await db.collection("tenant_config").findOneAndUpdate({tenantId:p.tenantId,key:params.key},{$set:{value,updatedAt:now,updatedBy:p.userId},$setOnInsert:{tenantId:p.tenantId,key:params.key,createdAt:now,createdBy:p.userId},$inc:{version:1}},{upsert:true,returnDocument:"after",session});
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"platform.configuration.updated","tenant_config",params.key,"success",{reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"platform.configuration.updated","tenant_config",params.key,{key:params.key,version:result?.version??1});
     return {statusCode:200,body:{data:result}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/tenants",{preHandler:platformGuard(db,config.jwtSecret,"platform.tenants.read")},async(request,reply)=>{
   try{
    const query=z.object({status:z.enum(["provisioning","active","suspended","closed"]).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(request.query);
    return {data:await c.tenants.find(query.status?{status:query.status}:{},{projection:{_id:0}}).sort({createdAt:-1}).limit(query.limit).toArray()};
   }catch(error){return fail(error,reply);}
  });
  app.get("/platform/admin/access-requests",{preHandler:platformGuard(db,config.jwtSecret,"platform.tenants.read")},async(request,reply)=>{
   try{
    const query=z.object({status:z.enum(["pending","reviewed","approved","declined"]).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).parse(request.query);
    return {data:await db.collection("access_requests").find(query.status?{status:query.status}:{},{projection:{_id:0}}).sort({requestedAt:-1}).limit(query.limit).toArray()};
   }catch(error){return fail(error,reply);}
  });
  app.patch("/platform/admin/access-requests/:requestId",{preHandler:platformGuard(db,config.jwtSecret,"platform.tenants.provision")},async(request,reply)=>{
   const p=principal(request);
   try{
    const params=z.object({requestId:z.string().uuid()}).parse(request.params);
    const body=z.object({status:z.enum(["reviewed","approved","declined"]),reason:z.string().trim().min(20).max(500)}).parse(request.body);
    return await mutate(db,request,reply,p,config.jwtSecret,"platform","platform.access-requests.review",async session=>{
     const result=await db.collection("access_requests").updateOne(
      {requestId:params.requestId,status:"pending"},
      {$set:{status:body.status,reviewedAt:new Date(),reviewedBy:p.userId,reviewReason:body.reason,updatedAt:new Date()}},
      {session}
     );
     if(!result.modifiedCount)throw new Error("ACCESS_REQUEST_NOT_PENDING");
     await appendAuditEvent(db,{tenantId:"platform",actor:{userId:p.userId},action:"platform.access_request.reviewed",resourceType:"access_request",resourceId:params.requestId,outcome:"success",metadata:{status:body.status,reason:body.reason}},session);
     await appendOutboxEvent(db,session,{tenantId:"platform",eventType:"platform.access_request.reviewed",aggregateType:"access_request",aggregateId:params.requestId,payload:{requestId:params.requestId,status:body.status}});
     return {statusCode:200,body:{data:{requestId:params.requestId,status:body.status}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/tenants",{preHandler:platformGuard(db,config.jwtSecret,"platform.tenants.provision")},async(request,reply)=>{
   const p=principal(request);try{
    const body=provisionTenantSchema.parse(request.body);
    if(!config.mfaEncryptionKey)return reply.code(503).send({error:"INVITATION_ENCRYPTION_NOT_CONFIGURED"});
    return await mutate(db,request,reply,p,config.jwtSecret,"platform","platform.tenants.provision",async session=>{
     const reason=body.reason,tenantInput={slug:body.slug,legalName:body.legalName,displayName:body.displayName,defaultLocale:body.defaultLocale,defaultCurrency:body.defaultCurrency,timezone:body.timezone};
     const tenant=await provisionTenant(db,p.userId,tenantInput,session);
     const root=await createOrganization(db,tenant.tenantId,p.userId,{code:"ROOT",name:tenant.displayName,type:"company"},session);
     const ownerPermissions=[
      "platform.tenant.read","platform.admin.overview.read","platform.admin.overview.read.all",
      "platform.organizations.read","platform.organizations.create","platform.organizations.create.root","platform.organizations.manage","platform.organizations.manage.all","platform.organizations.manage.request",
      "platform.locations.read","platform.locations.create","platform.locations.manage","platform.locations.manage.all","platform.locations.manage.request",
      "platform.memberships.read","platform.memberships.create","platform.memberships.manage","platform.memberships.manage.request","platform.memberships.assign.roles","platform.memberships.assign.privileged",
      "platform.users.read","platform.users.read.all","platform.users.invite",
      "platform.roles.read","platform.roles.create","platform.roles.create.system","platform.roles.grant.privileged",
      "platform.policies.read","platform.policies.write","platform.policies.write.request","platform.policies.write.allow","platform.policies.write.deny","platform.policies.write.global","platform.policies.simulate",
      "platform.feature-flags.read","platform.feature-flags.write","platform.feature-flags.write.request",
      "platform.sessions.read","platform.sessions.revoke","platform.sessions.revoke.all",
      "platform.audit.read","platform.audit.export","platform.approvals.read","platform.approvals.create","platform.approvals.approve",
      "platform.breakglass.read","platform.breakglass.request","platform.breakglass.grant","platform.breakglass.revoke",
      "platform.configuration.read","platform.configuration.write"
     ];
     const ownerRole=await createRole(db,tenant.tenantId,p.userId,{key:"tenant-owner",name:"Tenant Owner",description:"Initial tenant-wide administration role",permissionKeys:ownerPermissions,isSystem:false},session);
     const email=body.owner.email.trim().toLowerCase(),existing=await c.users.findOne({emailNormalized:email},{session});
     if(existing&&!(existing.status==="active"||existing.status==="invited"))throw new Error("TENANT_OWNER_USER_NOT_ELIGIBLE");
     const owner=existing??await createUser(db,p.userId,{email,displayName:body.owner.displayName,...(body.owner.phoneE164?{phoneE164:body.owner.phoneE164}:{})},session);
     const membership=await createMembership(db,tenant.tenantId,p.userId,{userId:owner.userId,organizationIds:[root.organizationId],locationIds:[],roleIds:[ownerRole.roleId]},session,{allowInvitedUser:true,forceInvited:true,allowProvisioningTenant:true});
     const invitationToken=await issueMembershipInvitation(db,membership.membershipId,7*24*60*60,session);
     const encryptedInvitationToken=encryptInvitationToken(invitationToken,config.mfaEncryptionKey);
     await writeAudit(db,"platform",p,request,config.jwtSecret,"platform.tenant.provisioned","tenant",tenant.tenantId,"success",{reason,ownerMembershipId:membership.membershipId},session);
     await emit(db,session,"platform",request,"platform.tenant.provisioned","tenant",tenant.tenantId,{tenantId:tenant.tenantId,slug:tenant.slug});
     await emit(db,session,tenant.tenantId,request,"identity.membership.invitation.requested","membership",membership.membershipId,{membershipId:membership.membershipId,userId:owner.userId,recipientEmail:email,displayName:body.owner.displayName,encryptedInvitationToken,deliveryChannel:"email"});
     return {statusCode:201,body:{data:{...tenant,ownerMembershipId:membership.membershipId,ownerInvitationStatus:"queued"}}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/organizations/:organizationId/lifecycle-requests",{preHandler:tenantGuard(db,config.jwtSecret,"platform.approvals.create")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({organizationId:z.string().min(1)}).parse(request.params),body=lifecycleRequestSchema.parse(request.body);
    if(!p.permissions.includes("platform.organizations.manage.request"))return reply.code(403).send({error:"ORGANIZATION_LIFECYCLE_REQUEST_NOT_PERMITTED"});
    if((!p.permissions.includes("platform.organizations.manage.all")&&!orgIds(p).includes(params.organizationId))||!await c.organizations.findOne({tenantId:p.tenantId,organizationId:params.organizationId,status:"active"}))return reply.code(404).send({error:"ORGANIZATION_NOT_FOUND_IN_SCOPE"});
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.organizations.lifecycle.request",async session=>{
     const approval=await createApprovalRequest(db,session,{tenantId:p.tenantId,scope:"tenant",action:"organization.deactivate",targetType:"organization",targetId:params.organizationId,payload:{},reason:body.reason,requestedBy:p.userId,correlationId:request.id});
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"platform.organization.lifecycle.requested","approval",approval.requestId,"success",{organizationId:params.organizationId,reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"platform.organization.lifecycle.requested","approval",approval.requestId,{requestId:approval.requestId,organizationId:params.organizationId});
     return {statusCode:201,body:{data:approval}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/locations/:locationId/lifecycle-requests",{preHandler:tenantGuard(db,config.jwtSecret,"platform.approvals.create")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({locationId:z.string().min(1)}).parse(request.params),body=lifecycleRequestSchema.parse(request.body);
    if(!p.permissions.includes("platform.locations.manage.request"))return reply.code(403).send({error:"LOCATION_LIFECYCLE_REQUEST_NOT_PERMITTED"});
    if((!p.permissions.includes("platform.locations.manage.all")&&!locIds(p).includes(params.locationId))||!await c.locations.findOne({tenantId:p.tenantId,locationId:params.locationId,status:"active"}))return reply.code(404).send({error:"LOCATION_NOT_FOUND_IN_SCOPE"});
    return await mutate(db,request,reply,p,config.jwtSecret,p.tenantId,"platform.locations.lifecycle.request",async session=>{
     const approval=await createApprovalRequest(db,session,{tenantId:p.tenantId,scope:"tenant",action:"location.deactivate",targetType:"location",targetId:params.locationId,payload:{},reason:body.reason,requestedBy:p.userId,correlationId:request.id});
     await writeAudit(db,p.tenantId,p,request,config.jwtSecret,"platform.location.lifecycle.requested","approval",approval.requestId,"success",{locationId:params.locationId,reason:body.reason},session);
     await emit(db,session,p.tenantId,request,"platform.location.lifecycle.requested","approval",approval.requestId,{requestId:approval.requestId,locationId:params.locationId});
     return {statusCode:201,body:{data:approval}};
    });
   }catch(error){return fail(error,reply);}
  });
  app.post("/platform/admin/tenants/:tenantId/lifecycle-requests",{preHandler:platformGuard(db,config.jwtSecret,"platform.tenants.lifecycle.request")},async(request,reply)=>{
   const p=principal(request);try{
    const params=z.object({tenantId:z.string().min(1)}).parse(request.params),body=tenantLifecycleRequestSchema.parse(request.body);
    if(!await c.tenants.findOne({tenantId:params.tenantId}))return reply.code(404).send({error:"TENANT_NOT_FOUND"});
    return await mutate(db,request,reply,p,config.jwtSecret,"platform","platform.tenants.lifecycle.request",async session=>{
     const approval=await createApprovalRequest(db,session,{tenantId:"platform",scope:"platform",action:body.action,targetType:"tenant",targetId:params.tenantId,payload:{},reason:body.reason,requestedBy:p.userId,correlationId:request.id});
     await writeAudit(db,"platform",p,request,config.jwtSecret,"platform.tenant.lifecycle.requested","approval",approval.requestId,"success",{tenantId:params.tenantId,action:body.action,reason:body.reason},session);
     await emit(db,session,"platform",request,"platform.tenant.lifecycle.requested","approval",approval.requestId,{requestId:approval.requestId,tenantId:params.tenantId,action:body.action});
     return {statusCode:201,body:{data:approval}};
    });
   }catch(error){return fail(error,reply);}
  });
 };
}
