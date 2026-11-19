import {connectMongo,closeMongo} from "../src/db/mongo.js";
import {coreCollections,upsertPolicy} from "@zuri/core-platform";

const apply=process.env.ABAC_BACKFILL_APPLY==="true";
const db=await connectMongo();
let membershipPolicies=0,platformPolicies=0,skipped=0;
try{
 const collections=coreCollections(db);
 const memberships=await collections.memberships.find({status:{$in:["active","invited","suspended"]}}).toArray();
 for(const membership of memberships){
  const roleIds=membership.roleIds??[];
  if(!roleIds.length){skipped++;continue;}
  const roles=await collections.roles.find({tenantId:membership.tenantId,roleId:{$in:roleIds},status:"active"},{projection:{_id:0,permissionKeys:1}}).toArray();
  const actions=[...new Set(roles.flatMap(role=>role.permissionKeys??[]))];
  if(!actions.length){skipped++;continue;}
  if(apply)await upsertPolicy(db,membership.tenantId,"bootstrap:abac-backfill",{key:"membership-role:"+membership.membershipId,effect:"allow",priority:0,subject:{userId:membership.userId},resource:{},actions,conditions:{}});
  membershipPolicies++;
 }
 const grants=await db.collection("platform_operator_grants").find({status:"active"}).toArray();
 for(const grant of grants){
  const actions=[...new Set(grant.permissionKeys??[])];
  if(!actions.length){skipped++;continue;}
  if(apply)await upsertPolicy(db,"platform","bootstrap:abac-backfill",{key:"platform-operator:"+grant.grantId,effect:"allow",priority:0,subject:{userId:grant.userId},resource:{resourceType:"platform_admin"},actions,conditions:{}});
  platformPolicies++;
 }
 process.stdout.write(JSON.stringify({mode:apply?"apply":"dry-run",membershipPolicies,platformPolicies,skipped})+"\n");
 if(!apply)process.stdout.write("Set ABAC_BACKFILL_APPLY=true to persist these idempotent allow policies. RBAC checks remain mandatory.\n");
}finally{await closeMongo();}
