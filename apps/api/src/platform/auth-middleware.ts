import type {Db} from "mongodb";
import type {FastifyReply,FastifyRequest} from "fastify";
import { verifySessionAccessToken } from "./session-token.js";
import {coreCollections,permissionsForMembership,platformPermissionsForUser} from "@zuri/core-platform";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";
export type AuthenticatedPrincipal=PlatformPrincipal&{membershipId:string;sessionId:string};
declare module "fastify"{interface FastifyRequest{principal?:AuthenticatedPrincipal;}}
export function authenticate(db:Db,config:AuthConfig){
 return async(request:FastifyRequest,reply:FastifyReply)=>{
  const header=request.headers.authorization;
  if(typeof header!=="string"||!header.startsWith("Bearer "))return reply.code(401).send({error:"UNAUTHENTICATED"});
  try{
   const {payload}=await verifySessionAccessToken(header.slice(7),config);
   const userId=payload.sub,tenantId=payload.tenantId,membershipId=payload.membershipId,sessionId=payload.sessionId;
   if(typeof userId!=="string"||typeof tenantId!=="string"||typeof membershipId!=="string"||typeof sessionId!=="string")throw new Error("INVALID_ACCESS_CLAIMS");
   const c=coreCollections(db),now=new Date();
   if(tenantId==="platform"&&membershipId==="platform"){
    const [platformSession,platformUser,platformPermissions]=await Promise.all([
     c.sessions.findOne({tenantId:"platform",sessionId,userId,revokedAt:{$exists:false},expiresAt:{$gt:now},membershipId:"platform"}),
     c.users.findOne({userId,status:"active"}),
     platformPermissionsForUser(db,userId,now)
    ]);
    if(!platformSession||!platformUser||!platformPermissions.length)throw new Error("INACTIVE_PLATFORM_PRINCIPAL");
    request.principal={userId,tenantId:"platform",membershipId:"platform",sessionId,organizationIds:[],locationIds:[],roleKeys:[],permissions:[],platformPermissions,emergencyGrantIds:[],attributes:{}};
    return;
   }
   const [session,tenant,user,membership]=await Promise.all([
    c.sessions.findOne({tenantId,sessionId,userId,revokedAt:{$exists:false},expiresAt:{$gt:now}}),
    c.tenants.findOne({tenantId,status:"active"}),
    c.users.findOne({userId,status:"active"}),
    c.memberships.findOne({tenantId,membershipId,userId,status:"active"})
   ]);
   if(!session||!tenant||!user||!membership)throw new Error("INACTIVE_PRINCIPAL");
   const [permissions,roles,emergencyGrants,platformPermissions]=await Promise.all([
    permissionsForMembership(db,tenantId,membershipId),
    c.roles.find({tenantId,roleId:{$in:membership.roleIds},status:"active"}).toArray(),
    db.collection("break_glass_grants").find({tenantId,userId,status:"active",startsAt:{$lte:now},expiresAt:{$gt:now}}).toArray(),
    platformPermissionsForUser(db,userId,now)
   ]);
   const emergencyPermissions=emergencyGrants.flatMap(grant=>grant.permissionKeys as string[]);
   const organizationIds=[...new Set([...membership.organizationIds,...emergencyGrants.flatMap(grant=>grant.organizationIds as string[])])];
   const locationIds=[...new Set([...membership.locationIds,...emergencyGrants.flatMap(grant=>grant.locationIds as string[])])];
   request.principal={userId,tenantId,membershipId,sessionId,organizationIds,...(organizationIds.length===1?{organizationId:organizationIds[0]}:{}),locationIds,roleKeys:roles.map(r=>r.key),permissions:[...new Set([...permissions,...emergencyPermissions])],platformPermissions,emergencyGrantIds:emergencyGrants.map(grant=>grant.grantId as string),attributes:{}};
  }catch{return reply.code(401).send({error:"UNAUTHENTICATED"});}
 };
}
