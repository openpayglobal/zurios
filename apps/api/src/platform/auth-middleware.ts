import type {Db} from "mongodb";
import type {FastifyReply,FastifyRequest} from "fastify";
import {jwtVerify} from "jose";
import {coreCollections,permissionsForMembership} from "@zuri/core-platform";
import type {AuthConfig} from "./auth-service.js";
import type {PlatformPrincipal} from "./types.js";
export type AuthenticatedPrincipal=PlatformPrincipal&{membershipId:string;sessionId:string};
declare module "fastify"{interface FastifyRequest{principal?:AuthenticatedPrincipal;}}
const signingKey=(config:AuthConfig)=>new TextEncoder().encode(config.jwtSecret);
export function authenticate(db:Db,config:AuthConfig){
 return async(request:FastifyRequest,reply:FastifyReply)=>{
  const header=request.headers.authorization;
  if(typeof header!=="string"||!header.startsWith("Bearer "))return reply.code(401).send({error:"UNAUTHENTICATED"});
  try{
   const {payload}=await jwtVerify(header.slice(7),signingKey(config),{issuer:config.issuer,audience:config.audience,algorithms:["HS256"]});
   const userId=payload.sub,tenantId=payload.tenantId,membershipId=payload.membershipId,sessionId=payload.sessionId;
   if(typeof userId!=="string"||typeof tenantId!=="string"||typeof membershipId!=="string"||typeof sessionId!=="string")throw new Error("INVALID_ACCESS_CLAIMS");
   const c=coreCollections(db),now=new Date();
   const [session,tenant,user,membership]=await Promise.all([
    c.sessions.findOne({tenantId,sessionId,userId,revokedAt:{$exists:false},expiresAt:{$gt:now}}),
    c.tenants.findOne({tenantId,status:"active"}),
    c.users.findOne({userId,status:"active"}),
    c.memberships.findOne({tenantId,membershipId,userId,status:"active"})
   ]);
   if(!session||!tenant||!user||!membership)throw new Error("INACTIVE_PRINCIPAL");
   const [permissions,roles]=await Promise.all([
    permissionsForMembership(db,tenantId,membershipId),
    c.roles.find({tenantId,roleId:{$in:membership.roleIds},status:"active"}).toArray()
   ]);
   request.principal={userId,tenantId,membershipId,sessionId,organizationId:membership.organizationIds.length===1?membership.organizationIds[0]:undefined,locationIds:membership.locationIds,roleKeys:roles.map(r=>r.key),permissions,attributes:{}};
  }catch{return reply.code(401).send({error:"UNAUTHENTICATED"});}
 };
}
