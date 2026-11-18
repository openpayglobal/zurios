import type {Db} from "mongodb";
import type {FastifyPluginAsync} from "fastify";
import {z,ZodError} from "zod";
import {createHash} from "node:crypto";
import type {AuthConfig} from "./auth-service.js";
import {acceptInvitation,beginMfaEnrollment,confirmMfaEnrollment,disableMfa,login,logout,refreshLogin,resetPassword,verifyEmail,verifyMfaLogin} from "./auth-service.js";
import {authenticate} from "./auth-middleware.js";
const loginSchema=z.object({email:z.string().email().max(254),password:z.string().min(1).max(128),tenantSlug:z.string().min(2).max(64)});
const mfaSchema=z.object({challengeToken:z.string().min(20),code:z.string().min(6).max(64)});
const refreshSchema=z.object({sessionId:z.string().min(1),refreshToken:z.string().min(20)});
function statusFor(error:unknown):number{
 if(error instanceof ZodError)return 400;
 const code=error instanceof Error?error.message:"";
 if(code==="AUTH_RATE_LIMITED")return 429;
 if(/INVALID|EXPIRED|REQUIRED|NOT_ALLOWED|ALREADY_USED|REPLAY|INACTIVE|STEP_UP|INVITATION|PASSWORD_SETUP|MFA_/.test(code))return 401;
 return 500;
}
function failure(error:unknown,reply:any){const status=statusFor(error);return reply.code(status).send({error:status===400?"INVALID_REQUEST":status===429?"RATE_LIMITED":status===401?"AUTHENTICATION_FAILED":"INTERNAL_SERVER_ERROR"});}
export function authRoutes(db:Db,config:AuthConfig):FastifyPluginAsync{
 return async function registerAuthRoutes(app){
  const requireAuth=authenticate(db,config);
  app.post("/auth/login",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   try{const body=loginSchema.parse(request.body);const ipHash=createHash("sha256").update(request.ip).digest("hex");return await login(db,config,{...body,ipHash});}
   catch(error){return failure(error,reply);}
  });
  app.post("/auth/mfa/verify",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(!config.mfaEncryptionKey)return reply.code(503).send({error:"MFA_NOT_CONFIGURED"});
   try{const body=mfaSchema.parse(request.body);return await verifyMfaLogin(db,config,body.challengeToken,body.code);}
   catch(error){return failure(error,reply);}
  });
  app.post("/auth/refresh",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   try{
    const body=refreshSchema.parse(request.body),session=await db.collection("sessions").findOne({sessionId:body.sessionId,revokedAt:{$exists:false},expiresAt:{$gt:new Date()}});
    if(!session)return reply.code(401).send({error:"AUTHENTICATION_FAILED"});
    return await refreshLogin(db,config,session.tenantId,body.sessionId,body.refreshToken);
   }catch(error){return failure(error,reply);}
  });
  app.post("/auth/invitations/:userId/accept",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   try{
    const params=z.object({userId:z.string().min(1)}).parse(request.params),body=z.object({token:z.string().min(20),password:z.string().min(12).max(128)}).parse(request.body);
    await acceptInvitation(db,params.userId,body.token,body.password);return reply.code(204).send();
   }catch(error){return failure(error,reply);}
  });
  app.post("/auth/email/verify",async(request,reply)=>{
   try{const body=z.object({userId:z.string().min(1),token:z.string().min(20)}).parse(request.body);await verifyEmail(db,body.userId,body.token);return reply.code(204).send();}
   catch(error){return failure(error,reply);}
  });
  app.post("/auth/password/reset",async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   try{const body=z.object({userId:z.string().min(1),token:z.string().min(20),newPassword:z.string().min(12).max(128)}).parse(request.body);await resetPassword(db,body.userId,body.token,body.newPassword);return reply.code(204).send();}
   catch(error){return failure(error,reply);}
  });
  app.get("/auth/me",{preHandler:requireAuth},async request=>({principal:request.principal}));
  app.post("/auth/logout",{preHandler:requireAuth},async(request,reply)=>{
   try{const p=request.principal!;await logout(db,p.tenantId,p.sessionId,p.userId);return reply.code(204).send();}
   catch(error){return failure(error,reply);}
  });
  app.post("/auth/mfa/enroll",{preHandler:requireAuth},async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(!config.mfaEncryptionKey)return reply.code(503).send({error:"MFA_NOT_CONFIGURED"});
   try{return await beginMfaEnrollment(db,request.principal!.userId,config);}
   catch(error){return failure(error,reply);}
  });
  app.post("/auth/mfa/confirm",{preHandler:requireAuth},async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(!config.mfaEncryptionKey)return reply.code(503).send({error:"MFA_NOT_CONFIGURED"});
   try{const body=z.object({code:z.string().min(6).max(64)}).parse(request.body);return await confirmMfaEnrollment(db,request.principal!.userId,body.code,config);}
   catch(error){return failure(error,reply);}
  });
  app.post("/auth/mfa/disable",{preHandler:requireAuth},async(request,reply)=>{
   reply.header("Cache-Control","no-store");
   if(!config.mfaEncryptionKey)return reply.code(503).send({error:"MFA_NOT_CONFIGURED"});
   try{const body=z.object({password:z.string().min(1).max(128),code:z.string().min(6).max(64)}).parse(request.body);await disableMfa(db,request.principal!.userId,body.password,body.code,config);return reply.code(204).send();}
   catch(error){return failure(error,reply);}
  });
 };
}
