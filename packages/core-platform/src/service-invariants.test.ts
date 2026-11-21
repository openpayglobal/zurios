import test from "node:test";
import assert from "node:assert/strict";
import type {Db} from "mongodb";
import {appendAuditEvent} from "./audit-service.js";
import {createOrganization} from "./organization-service.js";
import {createLocation} from "./location-service.js";
import {isFeatureEnabled} from "./feature-flags.js";
import {runMigrations,type Migration} from "./migrate.js";

test("location creation persists all required document fields and defaults",async()=>{
 let inserted:any;
 const db={collection:(name:string)=>name==="organizations"?{
  findOne:async()=>({tenantId:"tenant-1",organizationId:"org-1",path:[],status:"active"})
 }:{
  findOne:async()=>null,
  insertOne:async(doc:any)=>{inserted=doc;return {acknowledged:true};}
 }} as unknown as Db;
 const created=await createLocation(db,"tenant-1","actor-1",{
  organizationId:"org-1",code:"HQ",name:"Head Office",type:"office"
 });
 assert.equal(inserted.tenantId,"tenant-1");
 assert.equal(inserted.locationId,created.locationId);
 assert.equal(inserted.organizationId,"org-1");
 assert.equal(inserted.code,"HQ");
 assert.equal(inserted.name,"Head Office");
 assert.equal(inserted.type,"office");
 assert.equal(inserted.timezone,"Africa/Kampala");
 assert.deepEqual(inserted.path,undefined);
 assert.equal(inserted.status,"active");
 assert.equal(inserted.createdBy,"actor-1");
 assert.equal(inserted.updatedBy,"actor-1");
 assert.equal(Object.hasOwn(inserted,"parentLocationId"),false);
});

test("organization creation persists all required document fields",async()=>{
 let inserted:any;
 const collection={insertOne:async(doc:any)=>{inserted=doc;return {acknowledged:true};}};
 const db={collection:()=>collection} as unknown as Db;
 const created=await createOrganization(db,"tenant-1","actor-1",{
  code:"HQ",name:"Head Office",type:"company"
 });
 assert.equal(inserted.tenantId,"tenant-1");
 assert.equal(inserted.organizationId,created.organizationId);
 assert.equal(inserted.code,"HQ");
 assert.equal(inserted.name,"Head Office");
 assert.equal(inserted.type,"company");
 assert.deepEqual(inserted.path,[]);
 assert.equal(inserted.status,"active");
 assert.equal(inserted.createdBy,"actor-1");
 assert.equal(inserted.updatedBy,"actor-1");
 assert.equal(Object.prototype.hasOwnProperty.call(inserted,"parentOrganizationId"),false);
});

test("audit writer requires actor identity and redacts credential-like metadata",async()=>{
 let written:any;
 const collection={insertOne:async(doc:any)=>{written=doc;return {acknowledged:true};}};
 const db={collection:()=>collection} as unknown as Db;
 await appendAuditEvent(db,{tenantId:"t1",actor:{userId:"u1",ipHash:"hashed-ip",userAgent:"integration-test"},action:"user.updated",resourceType:"user",outcome:"success",metadata:{password:"do-not-store",nested:{refreshToken:"secret",note:"safe"}}});
 assert.equal(written.actor.userId,"u1");
 assert.equal(written.actor.ipHash,"hashed-ip");
 assert.equal(written.actor.userAgent,"integration-test");
 assert.equal(written.metadata.password,"[REDACTED]");
 assert.equal(written.metadata.nested.refreshToken,"[REDACTED]");
 assert.equal(written.metadata.nested.note,"safe");
 await assert.rejects(()=>appendAuditEvent(db,{tenantId:"t1",actor:{},action:"user.updated",resourceType:"user",outcome:"success"}),/Audit actor must be identified/);
});

test("feature flags fail closed and require tenant, environment and rule match",async()=>{
 const flag={tenantId:"t1",key:"new-ui",enabled:true,environments:["production"],rules:[{plan:"enterprise"}]};
 const db={collection:()=>({findOne:async(filter:any)=>filter.tenantId==="t1"?flag:null})} as unknown as Db;
 assert.equal(await isFeatureEnabled(db,"t1","new-ui","development",{plan:"enterprise"}),false);
 assert.equal(await isFeatureEnabled(db,"t1","new-ui","production",{plan:"free"}),false);
 assert.equal(await isFeatureEnabled(db,"t1","new-ui","production",{plan:"enterprise"}),true);
 assert.equal(await isFeatureEnabled(db,"t2","new-ui","production",{plan:"enterprise"}),false);
});

function fakeLedgerDb(){
 const rows=new Map<string,any>();
 const ledger={
  createIndex:async()=>"_id_",
  findOne:async(filter:any)=>rows.get(filter._id)??null,
  insertOne:async(doc:any)=>{if(rows.has(doc._id))throw new Error("duplicate");rows.set(doc._id,{...doc});return {acknowledged:true};},
  updateOne:async(filter:any,update:any)=>{const row=rows.get(filter._id);if(!row)return {matchedCount:0};Object.assign(row,update.$set??{});for(const key of Object.keys(update.$unset??{}))delete row[key];return {matchedCount:1};}
 };
 return {db:{collection:()=>ledger} as unknown as Db,rows};
}

test("migration runner is ordered and idempotent",async()=>{
 const f=fakeLedgerDb();let executions=0;
 const migrations:Migration[]=[{id:"0002_second",description:"second",up:async()=>{executions++;}},{id:"0001_first",description:"first",up:async()=>{executions++;}}];
 assert.deepEqual(await runMigrations(f.db,migrations),["0001_first","0002_second"]);
 assert.deepEqual(await runMigrations(f.db,migrations),[]);
 assert.equal(executions,2);
});

test("failed migration is recorded and never silently rerun",async()=>{
 const f=fakeLedgerDb();let executions=0;
 const migration:Migration={id:"0003_failure",description:"failure",up:async()=>{executions++;throw new Error("migration failure");}};
 await assert.rejects(()=>runMigrations(f.db,[migration]),/migration failure/);
 await assert.rejects(()=>runMigrations(f.db,[migration]),/MIGRATION_PREVIOUSLY_FAILED/);
 assert.equal(executions,1);
});
