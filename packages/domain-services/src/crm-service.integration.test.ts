import test from "node:test";
import assert from "node:assert/strict";
import {MongoClient} from "mongodb";
import {createCrmAccount,createCrmContact,createCrmLead,createCrmOpportunity,recordCrmActivity,updateCrmOpportunityStage} from "./crm-service.js";

const uri=process.env.MONGODB_TEST_URI;
test("CRM services enforce organization-owned relationships, consent evidence and idempotent pipeline changes",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db("zuri_crm_it_"+Date.now());
 const tenantId="tenant-crm-a",actorId="crm-user";
 try{
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("crm_accounts").createIndex({tenantId:1,accountId:1},{unique:true}),
   db.collection("crm_contacts").createIndex({tenantId:1,contactId:1},{unique:true}),
   db.collection("crm_leads").createIndex({tenantId:1,leadId:1},{unique:true}),
   db.collection("crm_opportunities").createIndex({tenantId:1,opportunityId:1},{unique:true}),
   db.collection("crm_activities").createIndex({tenantId:1,activityId:1},{unique:true})
  ]);
  const account={tenantId,organizationId:"org-a",accountId:"account-001",name:"Acme Uganda",accountType:"customer",status:"active"};
  const created=await createCrmAccount(db,account,actorId,"crm-account-create-001");
  const replay=await createCrmAccount(db,account,actorId,"crm-account-create-001");
  assert.deepEqual(replay.body,created.body);
  assert.equal(replay.replayed,true);

  const contact=await createCrmContact(db,{
   tenantId,organizationId:"org-a",contactId:"contact-001",accountId:"account-001",
   firstName:"Amina",lastName:"N.",email:"amina@example.test",marketingConsent:"granted",
   consentCapturedAt:"2026-11-19T08:00:00.000Z",consentSource:"website signup",status:"active"
  },actorId,"crm-contact-create-001");
  assert.equal((contact.body as {contactId:string}).contactId,"contact-001");
  await assert.rejects(()=>createCrmContact(db,{
   tenantId,organizationId:"org-a",contactId:"contact-invalid",firstName:"No",lastName:"Consent",
   marketingConsent:"granted",status:"active"
  },actorId,"crm-contact-create-invalid"),/ZodError|consent/i);

  const lead=await createCrmLead(db,{
   tenantId,organizationId:"org-a",leadId:"lead-001",firstName:"Brian",lastName:"K.",
   email:"brian@example.test",source:"referral",status:"new",marketingConsent:"unknown"
  },actorId,"crm-lead-create-001");
  assert.equal((lead.body as {leadId:string}).leadId,"lead-001");

  const opportunity=await createCrmOpportunity(db,{
   tenantId,organizationId:"org-a",opportunityId:"opportunity-001",accountId:"account-001",contactId:"contact-001",
   name:"Annual supply agreement",stage:"prospecting",amountMinor:2500000,currency:"UGX",
   expectedCloseAt:"2026-12-31T00:00:00.000Z",ownerUserId:actorId,version:0
  },actorId,"crm-opportunity-create-001");
  assert.equal((opportunity.body as {version:number}).version,0);

  const activity=await recordCrmActivity(db,{
   tenantId,organizationId:"org-a",activityId:"activity-001",relatedType:"opportunity",relatedId:"opportunity-001",
   activityType:"meeting",subject:"Discovery meeting",occurredAt:"2026-11-19T09:00:00.000Z",status:"completed"
  },actorId,"crm-activity-create-001");
  assert.equal((activity.body as {activityId:string}).activityId,"activity-001");

  const stage=await updateCrmOpportunityStage(db,{
   tenantId,organizationId:"org-a",opportunityId:"opportunity-001",stage:"qualification",expectedVersion:0
  },actorId,"crm-opportunity-stage-001");
  assert.deepEqual(stage.body,{opportunityId:"opportunity-001",stage:"qualification",version:1});
  const stageReplay=await updateCrmOpportunityStage(db,{
   tenantId,organizationId:"org-a",opportunityId:"opportunity-001",stage:"qualification",expectedVersion:0
  },actorId,"crm-opportunity-stage-001");
  assert.equal(stageReplay.replayed,true);
  await assert.rejects(()=>updateCrmOpportunityStage(db,{
   tenantId,organizationId:"org-a",opportunityId:"opportunity-001",stage:"won",expectedVersion:0
  },actorId,"crm-opportunity-stage-002"),/CRM_OPPORTUNITY_VERSION_CONFLICT/);

  await assert.rejects(()=>createCrmContact(db,{
   tenantId,organizationId:"org-b",contactId:"contact-cross-org",accountId:"account-001",
   firstName:"Cross",lastName:"Org",marketingConsent:"unknown",status:"active"
  },actorId,"crm-contact-cross-org"),/CRM_RELATED_RESOURCE_NOT_FOUND/);
  assert.equal(await db.collection("crm_contacts").countDocuments({tenantId:"tenant-crm-a",organizationId:"org-a"}),1);
  assert.equal(await db.collection("crm_contacts").countDocuments({tenantId:"tenant-crm-b"}),0);
  assert.ok(await db.collection("audit_events").countDocuments({tenantId})>=6);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId})>=6);
 }finally{
  await db.dropDatabase();await client.close();
 }
});
