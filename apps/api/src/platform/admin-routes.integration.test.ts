import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {SignJWT} from "jose";
import {adminRoutes} from "./admin-routes.js";
import {platformRoutes} from "./platform-routes.js";
import {acceptMembershipInvitation} from "./auth-service.js";
import {decryptInvitationToken} from "./auth-crypto.js";
import type {AuthConfig} from "./auth-service.js";

const uri=process.env.MONGODB_TEST_URI;
const permissionKeys=[
 "platform.admin.overview.read","platform.admin.overview.read.all","platform.organizations.manage","platform.organizations.manage.all","platform.organizations.manage.request","platform.locations.manage","platform.locations.manage.all","platform.locations.manage.request",
 "platform.users.read","platform.users.read.all","platform.users.invite",
 "platform.memberships.read","platform.memberships.create","platform.memberships.assign.roles",
 "platform.memberships.manage.request","platform.memberships.manage",
 "platform.roles.read","platform.roles.create",
 "platform.approvals.read","platform.approvals.create","platform.approvals.approve",
 "platform.breakglass.read","platform.breakglass.request","platform.breakglass.grant","platform.breakglass.revoke",
 "platform.sessions.read","platform.sessions.revoke","platform.audit.read","platform.audit.export",
 "platform.configuration.read","platform.configuration.write","platform.policies.simulate"
];
const config:AuthConfig={
 issuer:"https://zuri.test",audience:"zuri-api-test",jwtSecret:"test-only-secret-that-is-long-enough-for-ci",
 accessTokenTtlSeconds:300,sessionTtlSeconds:3600,mfaEncryptionKey:Buffer.alloc(32,7).toString("base64")
};
const signingKey=new TextEncoder().encode(config.jwtSecret);
async function token(userId:string,membershipId:string,sessionId:string){
 return new SignJWT({tenantId:"tenant-a",membershipId,sessionId})
  .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience)
  .setSubject(userId).setIssuedAt().setExpirationTime("5m").sign(signingKey);
}

test("administration workspace enforces invitation, two-person approval and break-glass lifecycle",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_admin_it_"+randomUUID().replaceAll("-",""));
 const app=Fastify();
 try{
  const now=new Date();
  await db.collection("tenants").insertOne({tenantId:"tenant-a",slug:"tenant-a",legalName:"Tenant A Ltd",displayName:"Tenant A",status:"active"});
  await db.collection("users").insertMany([
   {userId:"operator-a",emailNormalized:"operator-a@example.test",displayName:"Operator A",status:"active",emailVerifiedAt:now},
   {userId:"operator-b",emailNormalized:"operator-b@example.test",displayName:"Operator B",status:"active",emailVerifiedAt:now},
   {userId:"emergency-user",emailNormalized:"emergency@example.test",displayName:"Emergency User",status:"active",emailVerifiedAt:now}
  ]);
  await db.collection("organizations").insertOne({tenantId:"tenant-a",organizationId:"org-a",code:"ORG-A",name:"Org A",path:[],status:"active"});
  await db.collection("locations").insertMany([{tenantId:"tenant-a",locationId:"loc-a",organizationId:"org-a",code:"LOC-A",name:"Location A",status:"active"},{tenantId:"tenant-a",locationId:"loc-unused",organizationId:"org-a",code:"LOC-U",name:"Unused Location",status:"active"}]);
  await db.collection("roles").insertOne({tenantId:"tenant-a",roleId:"role-admin",key:"tenant-admin",name:"Tenant Admin",permissionKeys,status:"active"});
  await db.collection("memberships").insertMany([
   {tenantId:"tenant-a",membershipId:"membership-a",userId:"operator-a",organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["role-admin"],status:"active"},
   {tenantId:"tenant-a",membershipId:"membership-b",userId:"operator-b",organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["role-admin"],status:"active"},
   {tenantId:"tenant-a",membershipId:"membership-emergency",userId:"emergency-user",organizationIds:["org-a"],locationIds:["loc-a"],roleIds:[],status:"active"}
  ]);
  await db.collection("sessions").insertMany([
   {tenantId:"tenant-a",sessionId:"session-a",userId:"operator-a",membershipId:"membership-a",expiresAt:new Date(now.getTime()+300_000),lastUsedAt:now},
   {tenantId:"tenant-a",sessionId:"session-b",userId:"operator-b",membershipId:"membership-b",expiresAt:new Date(now.getTime()+300_000),lastUsedAt:now},
   {tenantId:"tenant-a",sessionId:"session-emergency",userId:"emergency-user",membershipId:"membership-emergency",expiresAt:new Date(now.getTime()+300_000),lastUsedAt:now},
   {tenantId:"tenant-a",sessionId:"session-emergency-revoke",userId:"emergency-user",membershipId:"membership-emergency",expiresAt:new Date(now.getTime()+300_000),lastUsedAt:now}
  ]);
  await db.collection("platform_operator_grants").insertMany([
   {grantId:"operator-grant-a",userId:"operator-a",permissionKeys:["platform.tenants.read","platform.tenants.provision","platform.tenants.lifecycle.request","platform.tenants.lifecycle.approve","platform.approvals.read","platform.approvals.approve"],status:"active",validFrom:now,createdAt:now,updatedAt:now,createdBy:"test",reason:"Integration test platform operator grant."},
   {grantId:"operator-grant-b",userId:"operator-b",permissionKeys:["platform.tenants.read","platform.tenants.provision","platform.tenants.lifecycle.request","platform.tenants.lifecycle.approve","platform.approvals.read","platform.approvals.approve"],status:"active",validFrom:now,createdAt:now,updatedAt:now,createdBy:"test",reason:"Integration test platform operator grant."}
  ]);
  await app.register(platformRoutes(db,config));
  await app.register(adminRoutes(db,config));
  await app.ready();
  const operatorA=await token("operator-a","membership-a","session-a");
  const operatorB=await token("operator-b","membership-b","session-b");

  const overview=await app.inject({method:"GET",url:"/platform/admin/overview",headers:{authorization:"Bearer "+operatorA}});
  assert.equal(overview.statusCode,200);
  assert.equal(overview.json().data.tenant.tenantId,"tenant-a");
  assert.equal(overview.json().data.counts.organizations,1);

  const deniedWithoutStepUp=await app.inject({
   method:"PUT",url:"/platform/admin/configuration/defaultCurrency",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"config-update-currency-denied"},
   payload:{value:"UGX",reason:"Attempt a privileged change without recent MFA step-up."}
  });
  assert.equal(deniedWithoutStepUp.statusCode,403);
  assert.equal(deniedWithoutStepUp.json().error,"MFA_STEP_UP_REQUIRED");
  await db.collection("sessions").updateMany({},{$set:{mfaStepUpAt:now,mfaStepUpExpiresAt:new Date(now.getTime()+5*60_000)}});

  const configUpdate=await app.inject({
   method:"PUT",url:"/platform/admin/configuration/defaultCurrency",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"config-update-currency-0001"},
   payload:{value:"UGX",reason:"Set the tenant's approved default transaction currency."}
  });
  assert.equal(configUpdate.statusCode,200);
  assert.equal(configUpdate.json().data.value,"UGX");
  const exportJob=await app.inject({
   method:"POST",url:"/platform/admin/audit-exports",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"audit-export-request-0001"},
   payload:{filters:{limit:1000},reason:"Export the tenant audit trail for scheduled compliance review."}
  });
  assert.equal(exportJob.statusCode,202);
  assert.equal((await app.inject({method:"GET",url:"/platform/admin/audit-exports",headers:{authorization:"Bearer "+operatorA}})).statusCode,200);
  const simulation=await app.inject({
   method:"POST",url:"/platform/admin/policies/simulate",
   headers:{authorization:"Bearer "+operatorA},
   payload:{subject:{userId:"operator-a"},resource:{resourceType:"membership"},action:"platform.memberships.read",environment:{}}
  });
  assert.equal(simulation.statusCode,200);


  const invitation=await app.inject({
   method:"POST",url:"/platform/admin/users/invitations",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"invite-member-0001"},
   payload:{email:"new-member@example.test",displayName:"New Member",organizationIds:["org-a"],locationIds:["loc-a"],roleIds:[],reason:"Create an invited membership for the new staff member."}
  });
  assert.equal(invitation.statusCode,202);
  const invited=invitation.json().data;
  assert.equal(invited.status,"invited");
  const inviteEvent=await db.collection("outbox_events").findOne({eventType:"identity.membership.invitation.requested",tenantId:"tenant-a"});
  assert.ok(inviteEvent);
  const rawToken=decryptInvitationToken(inviteEvent!.payload.encryptedInvitationToken as string,config.mfaEncryptionKey);
  assert.ok(rawToken.length>=40);
  assert.equal(JSON.stringify(invitation.json()).includes(rawToken),false);
  const accepted=await acceptMembershipInvitation(db,invited.membershipId,rawToken,"Correct-Horse-Battery-77!");
  assert.equal(accepted.userId,invited.userId);
  const acceptedMembership=await db.collection("memberships").findOne({tenantId:"tenant-a",membershipId:invited.membershipId});
  assert.equal(acceptedMembership?.status,"active");

  const approval=await app.inject({
   method:"POST",url:"/platform/admin/approvals",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"approval-membership-0001"},
   payload:{action:"membership.suspend",targetType:"membership",targetId:invited.membershipId,payload:{},reason:"Suspend this membership pending an internal access review."}
  });
  assert.equal(approval.statusCode,201);
  const requestId=approval.json().data.requestId;
  const selfApproval=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+requestId+"/approve",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"approval-self-0001"},
   payload:{reason:"I reviewed the request and approve this change."}
  });
  assert.equal(selfApproval.statusCode,409);
  assert.equal(selfApproval.json().error,"APPROVAL_SELF_APPROVAL_PROHIBITED");
  const approved=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+requestId+"/approve",
   headers:{authorization:"Bearer "+operatorB,"idempotency-key":"approval-approve-0001"},
   payload:{reason:"Independent review completed; the membership should be suspended."}
  });
  assert.equal(approved.statusCode,200);
  assert.equal(approved.json().data.status,"executed");
  assert.equal((await db.collection("memberships").findOne({membershipId:invited.membershipId}))?.status,"suspended");

  const locationLifecycle=await app.inject({
   method:"POST",url:"/platform/admin/locations/loc-unused/lifecycle-requests",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"location-deactivate-request-0001"},
   payload:{reason:"Close the unused location after confirming there are no active memberships."}
  });
  assert.equal(locationLifecycle.statusCode,201);
  const locationApprovalId=locationLifecycle.json().data.requestId;
  const locationDeactivation=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+locationApprovalId+"/approve",
   headers:{authorization:"Bearer "+operatorB,"idempotency-key":"location-deactivate-approve-0001"},
   payload:{reason:"Independent review confirms this unused location can be deactivated."}
  });
  assert.equal(locationDeactivation.statusCode,200);
  assert.equal((await db.collection("locations").findOne({locationId:"loc-unused"}))?.status,"inactive");

  const organizationLifecycle=await app.inject({
   method:"POST",url:"/platform/admin/organizations/org-a/lifecycle-requests",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"organization-deactivate-request-0001"},
   payload:{reason:"Request organization closure after planned consolidation and dependency review."}
  });
  assert.equal(organizationLifecycle.statusCode,201);
  const organizationApprovalId=organizationLifecycle.json().data.requestId;
  const organizationDeactivation=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+organizationApprovalId+"/approve",
   headers:{authorization:"Bearer "+operatorB,"idempotency-key":"organization-deactivate-approve-0001"},
   payload:{reason:"Review confirms active locations and memberships must be migrated first."}
  });
  assert.equal(organizationDeactivation.statusCode,422);
  assert.equal(organizationDeactivation.json().error,"ORGANIZATION_HAS_ACTIVE_DEPENDENCIES");
  assert.equal((await db.collection("organizations").findOne({organizationId:"org-a"}))?.status,"active");



  const emergencyRequest=await app.inject({
   method:"POST",url:"/platform/admin/approvals",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"approval-breakglass-0001"},
   payload:{action:"break_glass.grant",targetType:"user",targetId:"emergency-user",payload:{userId:"emergency-user",permissionKeys:["platform.sessions.revoke","platform.audit.read"],organizationIds:["org-a"],locationIds:["loc-a"],durationMinutes:30},reason:"Emergency operational access is required to revoke a compromised session."}
  });
  assert.equal(emergencyRequest.statusCode,201);
  const emergencyApprovalId=emergencyRequest.json().data.requestId;
  const emergencyApproval=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+emergencyApprovalId+"/approve",
   headers:{authorization:"Bearer "+operatorB,"idempotency-key":"approval-breakglass-approve-0001"},
   payload:{reason:"Independent review confirms the scoped emergency access is justified."}
  });
  assert.equal(emergencyApproval.statusCode,200);
  const grant=await db.collection("break_glass_grants").findOne({tenantId:"tenant-a",userId:"emergency-user",status:"active"});
  assert.ok(grant);
  const emergencyToken=await token("emergency-user","membership-emergency","session-emergency");
  const revokeSession=await app.inject({
   method:"POST",url:"/platform/sessions/session-emergency-revoke/revoke",
   headers:{authorization:"Bearer "+emergencyToken,"idempotency-key":"emergency-session-revoke-0001"}
  });
  assert.equal(revokeSession.statusCode,204);
  const emergencyAudit=await db.collection("audit_events").findOne({tenantId:"tenant-a","actor.userId":"emergency-user",action:"platform.session.revoked"});
  assert.ok(emergencyAudit);
  assert.deepEqual(emergencyAudit!.metadata.emergencyGrantIds,[grant!.grantId]);

  const revokeGrant=await app.inject({
   method:"POST",url:"/platform/admin/break-glass/"+grant!.grantId+"/revoke",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"emergency-grant-revoke-0001"},
   payload:{reason:"Emergency operation is complete; revoke the temporary grant."}
  });
  assert.equal(revokeGrant.statusCode,200);
  const afterRevoke=await app.inject({method:"GET",url:"/platform/admin/audit-events",headers:{authorization:"Bearer "+emergencyToken}});
  assert.equal(afterRevoke.statusCode,403);

  const tenantDirectory=await app.inject({method:"GET",url:"/platform/admin/tenants",headers:{authorization:"Bearer "+operatorA}});
  assert.equal(tenantDirectory.statusCode,200);
  const provisionedTenant=await app.inject({
   method:"POST",url:"/platform/admin/tenants",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"tenant-provision-0001"},
   payload:{slug:"new-customer",legalName:"New Customer Limited",displayName:"New Customer",defaultLocale:"en",defaultCurrency:"UGX",timezone:"Africa/Kampala",owner:{email:"owner@new-customer.example",displayName:"New Customer Owner"},reason:"Provision a new customer tenant and invite its first owner administrator."}
  });
  assert.equal(provisionedTenant.statusCode,201);
  assert.equal(provisionedTenant.json().data.ownerInvitationStatus,"queued");
  const newTenantId=provisionedTenant.json().data.tenantId;
  const ownerMembership=await db.collection("memberships").findOne({tenantId:newTenantId,status:"invited"});
  assert.ok(ownerMembership);
  const lifecycle=await app.inject({
   method:"POST",url:"/platform/admin/tenants/tenant-a/lifecycle-requests",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"tenant-suspend-request-0001"},
   payload:{action:"tenant.suspend",reason:"Suspend the tenant after an approved controlled lifecycle review."}
  });
  assert.equal(lifecycle.statusCode,201);
  const platformApprovalId=lifecycle.json().data.requestId;
  const platformSelfApproval=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+platformApprovalId+"/approve?scope=platform",
   headers:{authorization:"Bearer "+operatorA,"idempotency-key":"platform-self-approval-0001"},
   payload:{reason:"I independently approve the requested tenant lifecycle action."}
  });
  assert.equal(platformSelfApproval.statusCode,409);
  const platformApproval=await app.inject({
   method:"POST",url:"/platform/admin/approvals/"+platformApprovalId+"/approve?scope=platform",
   headers:{authorization:"Bearer "+operatorB,"idempotency-key":"platform-tenant-suspend-approve-0001"},
   payload:{reason:"A second platform operator independently approved the tenant suspension."}
  });
  assert.equal(platformApproval.statusCode,200);
  assert.equal((await db.collection("tenants").findOne({tenantId:"tenant-a"}))?.status,"suspended");

 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
