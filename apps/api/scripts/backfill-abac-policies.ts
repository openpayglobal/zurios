import {connectMongo,closeMongo} from "../src/db/mongo.js";
import {coreCollections,upsertPolicy} from "@zuri/core-platform";

type PolicyInput={key:string;effect:"allow";priority:0;subject:Record<string,unknown>;resource:Record<string,unknown>;actions:string[];conditions:Record<string,unknown>};
type PlannedPolicy={tenantId:string;input:PolicyInput};
const apply=process.env.ABAC_BACKFILL_APPLY==="true";
const actor="bootstrap:abac-backfill";
function canonical(value:unknown):string{
 if(value===null||typeof value!=="object")return JSON.stringify(value)??"null";
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 const entries=Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b));
 return "{"+entries.map(([key,item])=>JSON.stringify(key)+":"+canonical(item)).join(",")+"}";
}
function matches(existing:any,expected:PolicyInput){
 return existing?.status==="active"&&existing.effect===expected.effect&&existing.priority===expected.priority&&
  canonical(existing.subject??{})===canonical(expected.subject)&&canonical(existing.resource??{})===canonical(expected.resource)&&
  canonical([...(existing.actions??[])].sort())===canonical([...expected.actions].sort())&&canonical(existing.conditions??{})===canonical(expected.conditions);
}
const db=await connectMongo();
try{
 const collections=coreCollections(db),plans:PlannedPolicy[]=[];
 let skipped=0;
 const memberships=await collections.memberships.find({status:{$in:["active","invited","suspended"]}}).toArray();
 for(const membership of memberships){
  const roleIds=membership.roleIds??[];
  if(!roleIds.length){skipped++;continue;}
  const roles=await collections.roles.find({tenantId:membership.tenantId,roleId:{$in:roleIds},status:"active"},{projection:{_id:0,permissionKeys:1}}).toArray();
  const actions=[...new Set(roles.flatMap(role=>role.permissionKeys??[]))].sort();
  if(!actions.length){skipped++;continue;}
  plans.push({tenantId:membership.tenantId,input:{key:"membership-role:"+membership.membershipId,effect:"allow",priority:0,subject:{userId:membership.userId},resource:{},actions,conditions:{}}});
 }
 const grants=await db.collection("platform_operator_grants").find({status:"active"}).toArray();
 for(const grant of grants){
  const actions=[...new Set(grant.permissionKeys??[])].sort();
  if(!actions.length){skipped++;continue;}
  plans.push({tenantId:"platform",input:{key:"platform-operator:"+grant.grantId,effect:"allow",priority:0,subject:{userId:grant.userId},resource:{resourceType:"platform_admin"},actions,conditions:{}}});
 }
 let wouldCreate=0,alreadyCorrect=0,conflicts=0;
 for(const plan of plans){
  const existing=await collections.policies.findOne({tenantId:plan.tenantId,key:plan.input.key});
  if(!existing)wouldCreate++;
  else if(matches(existing,plan.input))alreadyCorrect++;
  else conflicts++;
 }
 const summary={mode:apply?"apply":"dry-run",target:process.env.ABAC_BACKFILL_TARGET??"unspecified",membershipsScanned:memberships.length,platformGrantsScanned:grants.length,wouldCreate,alreadyCorrect,conflicts,skipped};
 if(!apply){
  process.stdout.write(JSON.stringify(summary)+"\n");
  process.stdout.write("No database writes performed. Set ABAC_BACKFILL_APPLY=true only after reviewing target, counts and policy scope.\n");
 }else{
  if(conflicts)throw new Error("ABAC_BACKFILL_CONFLICTS_FOUND: resolve existing policy conflicts before applying");
  let created=0,unchanged=0;
  for(const plan of plans){
   const session=db.client.startSession();
   try{
    let didCreate=false;
    await session.withTransaction(async()=>{
     const existing=await collections.policies.findOne({tenantId:plan.tenantId,key:plan.input.key},{session});
     if(existing){
      if(!matches(existing,plan.input))throw new Error("ABAC_BACKFILL_CONCURRENT_POLICY_CONFLICT");
      return;
     }
     await upsertPolicy(db,plan.tenantId,actor,plan.input,session);
     didCreate=true;
    },{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary"});
    if(didCreate)created++;else unchanged++;
   }finally{await session.endSession();}
  }
  process.stdout.write(JSON.stringify({...summary,created,unchanged,mode:"apply"})+"\n");
 }
}finally{await closeMongo();}
