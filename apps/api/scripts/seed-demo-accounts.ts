import {randomBytes} from "node:crypto";
import {MongoClient} from "mongodb";
import {createMembership,createUser,provisionTenant,runCoreMigrations,setTenantStatus} from "@zuri/core-platform";
import {acceptInvitation,issueInvitation} from "../src/platform/auth-service.js";

const enabled=process.env.DEMO_SEED_ENABLED==="true";
const isProduction=process.env.VERCEL_ENV==="production"||(process.env.NODE_ENV==="production"&&process.env.VERCEL_ENV!=="preview");
if(!enabled)throw new Error("Refusing to seed demo identities: set DEMO_SEED_ENABLED=true explicitly.");
if(isProduction)throw new Error("Demo account seeding is forbidden in production.");
const uri=process.env.MONGODB_URI;
const password=process.env.DEMO_SEED_PASSWORD;
if(!uri)throw new Error("MONGODB_URI is required for the isolated demo database.");
if(!password||password.length<16)throw new Error("DEMO_SEED_PASSWORD must contain at least 16 characters.");
if(process.env.DEMO_DATABASE_NAME?.toLowerCase().includes("prod"))throw new Error("Demo database name must not contain 'prod'.");

const databaseName=process.env.DEMO_DATABASE_NAME??"zuri_demo";
const actor="system:demo-seed";
const client=new MongoClient(uri);
const ensureTenant=async(db:any,slug:string,displayName:string)=>{
 const existing=await db.collection("tenants").findOne({slug});
 if(existing){if(existing.status!=="active")throw new Error("Existing demo tenant is not active: "+slug);return existing;}
 const tenant=await provisionTenant(db,actor,{slug,legalName:displayName+" Ltd",displayName,defaultLocale:"en",defaultCurrency:"UGX",timezone:"Africa/Kampala"});
 await setTenantStatus(db,tenant.tenantId,"active",actor);
 return tenant;
};
async function ensureAccount(db:any,tenantId:string,email:string,displayName:string,workspaceIds:string[]){
 let user=await db.collection("users").findOne({emailNormalized:email});
 if(!user){
  user=await createUser(db,actor,{email,displayName});
  const invitation=await issueInvitation(db,user.userId);
  await acceptInvitation(db,user.userId,invitation,password);
  user=await db.collection("users").findOne({userId:user.userId});
 }
 if(!user||user.status!=="active"||!user.emailVerifiedAt)throw new Error("Demo identity is not active and verified: "+email);
 for(const id of workspaceIds){
  const membership=await db.collection("memberships").findOne({tenantId:id,userId:user.userId,status:{$in:["active","invited","suspended"]}});
  if(!membership)await createMembership(db,id,actor,{userId:user.userId,organizationIds:[],locationIds:[],roleIds:[]});
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
 const standard=await ensureAccount(db,primary.tenantId,"demo.member@zuri.test","Demo Standard Member",[primary.tenantId]);
 const multi=await ensureAccount(db,primary.tenantId,"demo.multi@zuri.test","Demo Multi-workspace Member",[primary.tenantId,secondary.tenantId]);
 const unassigned=await ensureAccount(db,primary.tenantId,"demo.unassigned@zuri.test","Demo Unassigned Identity",[]);
 const pending=await db.collection("demoSeedRuns").findOne({_id:"baseline-v1"});
 await db.collection("demoSeedRuns").updateOne({_id:"baseline-v1"},{$set:{completedAt:new Date(),databaseName,accountEmails:[standard.emailNormalized,multi.emailNormalized,unassigned.emailNormalized],tenantIds:[primary.tenantId,secondary.tenantId]},$setOnInsert:{createdAt:new Date()}},{upsert:true});
 process.stdout.write(JSON.stringify({status:"seeded",database:databaseName,accounts:[
  {scenario:"standard-member",email:standard.emailNormalized},
  {scenario:"multi-workspace-member",email:multi.emailNormalized},
  {scenario:"no-workspace-membership",email:unassigned.emailNormalized}
 ],password:"Use the DEMO_SEED_PASSWORD value supplied to this command; it is intentionally not printed or persisted in plaintext.",rerun:pending?"existing seed baseline reconciled":"initial seed created"},null,2)+"\n");
}finally{await client.close();}
