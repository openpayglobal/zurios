import type {Db} from "mongodb";
import {coreCollections,upsertPolicy} from "@zuri/core-platform";

type PolicyInput={key:string;effect:"allow";priority:0;subject:Record<string,unknown>;resource:Record<string,unknown>;actions:string[];conditions:Record<string,unknown>};
type PlannedPolicy={tenantId:string;input:PolicyInput};
export type AbacBackfillSummary={mode:"dry-run"|"apply";target:string;membershipsScanned:number;platformGrantsScanned:number;wouldCreate:number;alreadyCorrect:number;conflicts:number;skipped:number;created?:number;unchanged?:number};
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
export async function runAbacBackfill(db:Db,apply:boolean,target="unspecified"):Promise<AbacBackfillSummary>{
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
  const actions=[...new Set((grant.permissionKeys??[]) as string[])].sort();
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
 const summary:AbacBackfillSummary={mode:apply?"apply":"dry-run",target,membershipsScanned:memberships.length,platformGrantsScanned:grants.length,wouldCreate,alreadyCorrect,conflicts,skipped};
 if(!apply)return summary;
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
    await upsertPolicy(db,plan.tenantId,"bootstrap:abac-backfill",plan.input,session);
    didCreate=true;
   },{readConcern:{level:"snapshot"},writeConcern:{w:"majority"},readPreference:"primary"});
   if(didCreate)created++;else unchanged++;
  }finally{await session.endSession();}
 }
 return {...summary,mode:"apply",created,unchanged};
}
