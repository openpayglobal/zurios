import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {MongoClient} from "mongodb";
import {login} from "./auth-service.js";
import {verifyPassword} from "./auth-crypto.js";

const uri=process.env.MONGODB_TEST_URI;
test("demo seeder creates least-privilege member, multi-workspace and unassigned identities", {skip:!uri}, async()=>{
 const databaseName="zuri_demo_test_"+randomUUID().replaceAll("-","");
 const password=randomBytes(24).toString("base64url");
 const seeded=spawnSync("pnpm",["exec","tsx","scripts/seed-demo-accounts.ts"],{
  cwd:process.cwd(),
  encoding:"utf8",
  env:{...process.env,NODE_ENV:"test",VERCEL_ENV:"",DEMO_SEED_ENABLED:"true",DEMO_DATABASE_NAME:databaseName,MONGODB_URI:uri!,DEMO_SEED_PASSWORD:password}
 });
 assert.equal(seeded.status,0,seeded.stderr||seeded.stdout);
 const client=new MongoClient(uri!);
 await client.connect();
 const db=client.db(databaseName);
 try{
  const standard=await db.collection("users").findOne({emailNormalized:"demo.member@zuri.test"});
  const multi=await db.collection("users").findOne({emailNormalized:"demo.multi@zuri.test"});
  const unassigned=await db.collection("users").findOne({emailNormalized:"demo.unassigned@zuri.test"});
  assert.ok(standard?.passwordHash&&await verifyPassword(password,standard.passwordHash));
  assert.ok(multi?.passwordHash&&await verifyPassword(password,multi.passwordHash));
  assert.ok(unassigned?.passwordHash&&await verifyPassword(password,unassigned.passwordHash));
  assert.equal(await db.collection("memberships").countDocuments({userId:standard.userId,status:"active"}),1);
  assert.equal(await db.collection("memberships").countDocuments({userId:multi.userId,status:"active"}),2);
  assert.equal(await db.collection("memberships").countDocuments({userId:unassigned.userId,status:"active"}),0);
  const cfg={issuer:"https://identity.example.test",audience:"zuri-demo-test",jwtSecret:randomBytes(32).toString("base64url"),accessTokenTtlSeconds:900,sessionTtlSeconds:3600,mfaEncryptionKey:randomBytes(32).toString("base64")};
  const standardLogin=await login(db,cfg,{email:"demo.member@zuri.test",password,ipHash:"demo-seed-test"});
  assert.equal(standardLogin.mfaRequired,false);
  if(!standardLogin.mfaRequired){assert.equal(standardLogin.workspaceSelectionRequired,true);assert.equal(standardLogin.workspaces.length,1);}
  const multiLogin=await login(db,cfg,{email:"demo.multi@zuri.test",password,ipHash:"demo-seed-test"});
  assert.equal(multiLogin.mfaRequired,false);
  if(!multiLogin.mfaRequired){assert.equal(multiLogin.workspaceSelectionRequired,true);assert.equal(multiLogin.workspaces.length,2);}
  const unassignedLogin=await login(db,cfg,{email:"demo.unassigned@zuri.test",password,ipHash:"demo-seed-test"});
  assert.equal(unassignedLogin.mfaRequired,false);
  if(!unassignedLogin.mfaRequired){assert.equal(unassignedLogin.workspaceSelectionRequired,false);assert.equal(unassignedLogin.accessRequestAvailable,true);}
  const rerun=spawnSync("pnpm",["exec","tsx","scripts/seed-demo-accounts.ts"],{
   cwd:process.cwd(),encoding:"utf8",
   env:{...process.env,NODE_ENV:"test",VERCEL_ENV:"",DEMO_SEED_ENABLED:"true",DEMO_DATABASE_NAME:databaseName,MONGODB_URI:uri!,DEMO_SEED_PASSWORD:password}
  });
  assert.equal(rerun.status,0,rerun.stderr||rerun.stdout);
 }finally{
  await db.dropDatabase();
  await client.close();
 }
});
