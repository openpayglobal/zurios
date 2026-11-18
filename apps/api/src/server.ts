import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {config,corsOrigins} from "./config.js";
import {connectMongo,closeMongo} from "./db/mongo.js";
import {authRoutes} from "./platform/auth-routes.js";
import {platformRoutes} from "./platform/platform-routes.js";
import type {AuthConfig} from "./platform/auth-service.js";
const app=Fastify({logger:true,bodyLimit:1_048_576});
await app.register(helmet);
await app.register(cors,{origin:corsOrigins,credentials:true});
app.get("/health/live",async()=>({status:"ok",service:"zuri-api"}));
app.get("/health/ready",async(_req,reply)=>{try{const db=await connectMongo();await db.command({ping:1});return {status:"ready",database:"connected"};}catch{return reply.code(503).send({status:"not_ready"});}});
app.setErrorHandler((error,_request,reply)=>{app.log.error(error);return reply.code(500).send({error:"INTERNAL_SERVER_ERROR",message:"An unexpected error occurred"});});
const authConfig:AuthConfig={issuer:config.JWT_ISSUER,audience:config.JWT_AUDIENCE,jwtSecret:config.JWT_SECRET,accessTokenTtlSeconds:config.ACCESS_TOKEN_TTL_SECONDS,sessionTtlSeconds:config.SESSION_TTL_SECONDS,mfaEncryptionKey:config.MFA_ENCRYPTION_KEY??""};
try{
 const db=await connectMongo();
 await app.register(authRoutes(db,authConfig));
 await app.register(platformRoutes(db,authConfig));
 await app.listen({host:config.API_HOST,port:config.API_PORT});
}catch(error){app.log.error(error);process.exitCode=1;}
const shutdown=async()=>{await app.close();await closeMongo();};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
