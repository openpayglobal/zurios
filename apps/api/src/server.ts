import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {config,corsOrigins} from "./config.js";
import {connectMongo,closeMongo} from "./db/mongo.js";
const app=Fastify({logger:true,bodyLimit:1_048_576});
await app.register(helmet);
await app.register(cors,{origin:corsOrigins,credentials:true});
app.get("/health/live",async()=>({status:"ok",service:"zuri-api"}));
app.get("/health/ready",async(_req,reply)=>{try{await connectMongo();return {status:"ready",database:"connected"};}catch{return reply.code(503).send({status:"not_ready"});}});
app.setErrorHandler((error,_request,reply)=>{app.log.error(error);return reply.code(500).send({error:"INTERNAL_SERVER_ERROR",message:"An unexpected error occurred"});});
try{await connectMongo();await app.listen({host:config.API_HOST,port:config.API_PORT});}catch(error){app.log.error(error);process.exitCode=1;}
const shutdown=async()=>{await app.close();await closeMongo();};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
