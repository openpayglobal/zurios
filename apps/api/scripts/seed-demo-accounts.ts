import {MongoClient} from "mongodb";
import {randomBytes} from "node:crypto";
import {createMembership,createUser,provisionTenant,runCoreMigrations,seedPlatform,setTenantStatus} from "@zuri/core-platform";
import {acceptInvitation,issueInvitation} from "../src/platform/auth-service.js";
import {hashPassword} from "../src/platform/auth-crypto.js";

const enabled=process.env.DEMO_SEED_ENABLED==="true";
const isProduction=process.env.VERCEL_ENV==="production"||(process.env.NODE_ENV==="production"&&process.env.VERCEL_ENV!=="preview");
if(!enabled)throw new Error("Refusing to seed demo identities: set DEMO_SEED_ENABLED=true explicitly.");
if(isProduction)throw new Error("Demo account seeding is forbidden in production.");
const uri=process.env.MONGODB_URI;
const suppliedPassword=process.env.DEMO_SEED_PASSWORD;
const password=suppliedPassword??randomBytes(32).toString("base64url");
if(!uri)throw new Error("MONGODB_URI is required for the isolated demo database.");
if(password.length<16)throw new Error("DEMO_SEED_PASSWORD must contain at least 16 characters.");
if(process.env.DEMO_DATABASE_NAME?.toLowerCase().includes("prod"))throw new Error("Demo database name must not contain 'prod'.");

const databaseName=process.env.DEMO_DATABASE_NAME??"zuri_demo";
if(!databaseName.startsWith("zuri_demo"))throw new Error("DEMO_DATABASE_NAME must start with zuri_demo.");
const actor="system:demo-seed";
const client=new MongoClient(uri);
const ensureTenant=async(db:any,slug:string,displayName:string)=>{
 let tenant=await db.collection("tenants").findOne({slug});
 if(tenant){if(tenant.status!=="active"||tenant.createdBy!==actor)throw new Error("Refusing to reuse a tenant not created by the demo seeder: "+slug);}
 else{
  tenant=await provisionTenant(db,actor,{slug,legalName:displayName+" Ltd",displayName,defaultLocale:"en",defaultCurrency:"UGX",timezone:"Africa/Kampala"});
  await setTenantStatus(db,tenant.tenantId,"active",actor);
 }
 await seedPlatform(db,tenant.tenantId,actor);
 return tenant;
};
async function ensureAccount(db:any,email:string,displayName:string,workspaceIds:string[]){
 let user=await db.collection("users").findOne({emailNormalized:email});
 if(!user){
  user=await createUser(db,actor,{email,displayName});
  const invitation=await issueInvitation(db,user.userId);
  await acceptInvitation(db,user.userId,invitation,password);
  user=await db.collection("users").findOne({userId:user.userId});
 }else if(user.createdBy!==actor){throw new Error("Refusing to modify a user not created by the demo seeder: "+email);}
 if(!user||user.status!=="active"||!user.emailVerifiedAt)throw new Error("Demo identity is not active and verified: "+email);
 const now=new Date();
 await db.collection("users").updateOne({userId:user.userId},{$set:{passwordHash:await hashPassword(password),failedLoginCount:0,updatedAt:now},$unset:{lockedUntil:""}});
 await db.collection("sessions").updateMany({userId:user.userId,revokedAt:{$exists:false}},{$set:{revokedAt:now,updatedAt:now,updatedBy:actor}});
 for(const id of workspaceIds){
  const membership=await db.collection("memberships").findOne({tenantId:id,userId:user.userId,status:{$in:["active","invited","suspended"]}});
  if(!membership)await createMembership(db,id,actor,{userId:user.userId,organizationIds:[],locationIds:[],roleIds:["rol_tenant_viewer"]});
 }
 return user;
}

try{
 await client.connect();
 const db=client.db(databaseName);
 await runCoreMigrations(db);
 await db.collection("auth_rate_limits").createIndex({key:1},{unique:true});
 await db.collection("auth_challenges").createIndex({challengeId:1},{unique:true});
 const primary=await ensureTenant(db,"zuri-demo-primary","Zuri Demo Workspace");
 const secondary=await ensureTenant(db,"zuri-demo-secondary","Zuri Demo Studio");
 const standard=await ensureAccount(db,"demo.member@zuri.test","Demo Standard Member",[primary.tenantId]);
 const multi=await ensureAccount(db,"demo.multi@zuri.test","Demo Multi-workspace Member",[primary.tenantId,secondary.tenantId]);
 const unassigned=await ensureAccount(db,"demo.unassigned@zuri.test","Demo Unassigned Identity",[]);
 await db.collection("memberships").updateMany({userId:unassigned.userId,status:{$in:["active","invited","suspended"]}},{$set:{status:"revoked",updatedAt:new Date(),updatedBy:actor}});
 await db.collection("sessions").updateMany({userId:unassigned.userId,revokedAt:{$exists:false}},{$set:{revokedAt:new Date(),updatedAt:new Date(),updatedBy:actor}});
 const demoSeedRuns=db.collection<{_id:string;createdAt:Date;completedAt:Date;databaseName:string;accountEmails:string[];tenantIds:string[]}>("demoSeedRuns");
 const pending=await demoSeedRuns.findOne({_id:"baseline-v1"});
 await demoSeedRuns.updateOne({_id:"baseline-v1"},{$set:{completedAt:new Date(),databaseName,accountEmails:[standard.emailNormalized,multi.emailNormalized,unassigned.emailNormalized],tenantIds:[primary.tenantId,secondary.tenantId]},$setOnInsert:{createdAt:new Date()}},{upsert:true});
 process.stdout.write(JSON.stringify({status:"seeded",database:databaseName,accounts:[
  {scenario:"standard-member",email:standard.emailNormalized},
  {scenario:"multi-workspace-member",email:multi.emailNormalized},
  {scenario:"no-workspace-membership",email:unassigned.emailNormalized}
 ],password:suppliedPassword?"Provided through DEMO_SEED_PASSWORD; not printed.":"GENERATED ONE-TIME PASSWORD — store securely and set VITE_DEMO_PASSWORD in the protected Preview environment: "+password,rerun:pending?"existing seed baseline reconciled":"initial seed created"},null,2)+"\n");
}finally{await client.close();}
