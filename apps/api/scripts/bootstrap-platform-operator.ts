import {connectMongo,closeMongo} from "../src/db/mongo.js";
import {grantPlatformOperator,appendAuditEvent,coreCollections} from "@zuri/core-platform";

const userId=process.env.PLATFORM_OPERATOR_USER_ID?.trim();
const permissionInput=process.env.PLATFORM_OPERATOR_PERMISSIONS??"";
const reason=process.env.PLATFORM_OPERATOR_BOOTSTRAP_REASON?.trim()??"";
const permissions=[...new Set(permissionInput.split(",").map(value=>value.trim()).filter(Boolean))];
if(!userId||!permissions.length||reason.length<20){
 process.stderr.write("Set PLATFORM_OPERATOR_USER_ID, PLATFORM_OPERATOR_PERMISSIONS (comma-separated) and PLATFORM_OPERATOR_BOOTSTRAP_REASON (20+ characters).\n");
 process.exitCode=1;
}else{
 const db=await connectMongo(),session=db.client.startSession();
 try{
  const user=await coreCollections(db).users.findOne({userId,status:"active",emailVerifiedAt:{$exists:true}});
  if(!user)throw new Error("PLATFORM_OPERATOR_USER_MUST_BE_ACTIVE_AND_EMAIL_VERIFIED");
  const active=await db.collection("platform_operator_grants").findOne({userId,status:"active"});
  if(active)throw new Error("ACTIVE_PLATFORM_OPERATOR_GRANT_ALREADY_EXISTS");
  await session.withTransaction(async()=>{
   const grant=await grantPlatformOperator(db,session,{userId,permissionKeys:permissions,reason}, "bootstrap:controlled-operator-provisioning");
   await appendAuditEvent(db,{tenantId:"platform",actor:{service:"platform-bootstrap"},action:"platform.operator.granted",resourceType:"platform_operator_grant",resourceId:grant.grantId,outcome:"success",metadata:{userId,permissionKeys:permissions,reason}},session);
  },{writeConcern:{w:"majority"}});
  process.stdout.write("Platform operator grant provisioned. Verify the assigned permission set and record the approval outside this script.\n");
 }catch(error){
  process.stderr.write((error instanceof Error?error.message:"PLATFORM_OPERATOR_BOOTSTRAP_FAILED")+"\n");
  process.exitCode=1;
 }finally{await session.endSession();await closeMongo();}
}
