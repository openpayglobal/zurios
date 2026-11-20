import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import Fastify from "fastify";
import {MongoClient} from "mongodb";
import {SignJWT} from "jose";
import {domainRoutes} from "./domain-routes.js";
import type {AuthConfig} from "./auth-service.js";

const uri=process.env.MONGODB_TEST_URI;
const config:AuthConfig={
 issuer:"https://zuri.test",audience:"zuri-api-test",jwtSecret:"test-only-secret-that-is-long-enough-for-ci",
 accessTokenTtlSeconds:300,sessionTtlSeconds:3600,mfaEncryptionKey:""
};
const signingKey=new TextEncoder().encode(config.jwtSecret);

test("Inventory API enforces tenant, organization, location, ABAC and idempotency boundaries",{skip:!uri},async()=>{
 const client=new MongoClient(uri!);await client.connect();
 const db=client.db(`zuri_inventory_api_it_${randomUUID().replaceAll("-","")}`);
 const app=Fastify();
 try{
  const now=new Date();
  await Promise.all([
   db.collection("idempotency_records").createIndex({tenantId:1,actorId:1,operation:1,key:1},{unique:true}),
   db.collection("audit_events").createIndex({eventId:1},{unique:true}),
   db.collection("outbox_events").createIndex({eventId:1},{unique:true}),
   db.collection("inventory_warehouses").createIndex({tenantId:1,warehouseId:1},{unique:true}),
   db.collection("inventory_warehouses").createIndex({tenantId:1,code:1},{unique:true}),
   db.collection("inventory_stock_balances").createIndex({tenantId:1,warehouseId:1,sku:1},{unique:true}),
   db.collection("inventory_stock_ledger").createIndex({tenantId:1,movementId:1,leg:1},{unique:true}),
   db.collection("inventory_reservations").createIndex({tenantId:1,reservationId:1},{unique:true})
  ]);
  await db.collection("tenants").insertMany([{tenantId:"tenant-a",status:"active"},{tenantId:"tenant-b",status:"active"}]);
  await db.collection("users").insertMany([{userId:"inventory-user",status:"active"},{userId:"hr-manager-user",status:"active"}]);
  await db.collection("organizations").insertMany([
   {tenantId:"tenant-a",organizationId:"org-a",status:"active"},
   {tenantId:"tenant-a",organizationId:"org-b",status:"active"},
   {tenantId:"tenant-b",organizationId:"org-secret",status:"active"}
  ]);
  await db.collection("locations").insertMany([
   {tenantId:"tenant-a",locationId:"loc-a",organizationId:"org-a",status:"active"},
   {tenantId:"tenant-a",locationId:"loc-b",organizationId:"org-b",status:"active"},
   {tenantId:"tenant-b",locationId:"loc-secret",organizationId:"org-secret",status:"active"}
  ]);
  const permissions=[
   "inventory.warehouse.read","inventory.warehouse.create","inventory.stock.read",
   "inventory.stock.write","inventory.stock.reserve","inventory.stock.consume","inventory.stock.release",
   "pos.terminal.create","pos.shift.open","pos.shift.close","pos.sale.complete","pos.refund.complete","pos.offline.sync",
   "erp.account.read","erp.account.create","erp.fiscal_period.read","erp.fiscal_period.create","erp.purchase_order.create","erp.purchase_order.receive",
   "erp.invoice.read","erp.invoice.create","erp.invoice.payment.allocate","erp.journal.post",
   "crm.account.read","crm.account.create","crm.contact.read","crm.contact.create","crm.lead.read","crm.lead.create",
   "crm.opportunity.read","crm.opportunity.create","crm.opportunity.stage.update","crm.activity.read","crm.activity.create",
   "hr.employee.read","hr.employee.create","hr.leave.read","hr.leave.request","hr.leave.approve",
   "payroll.run.read","payroll.run.create","payroll.run.approve",
   "payments.intent.read","payments.intent.create","payments.refund.request",
   "commerce.product.read","commerce.product.create","commerce.order.read","commerce.order.create",
   "assets.asset.read","assets.asset.create","assets.work_order.read","assets.work_order.create","assets.work_order.complete",
   "projects.project.read","projects.project.create","projects.task.create","projects.time_entry.read","projects.time_entry.submit","projects.time_entry.approve","workflows.definition.read","workflows.definition.create","workflows.run.read","workflows.run.start","workflows.task.read","workflows.task.approve"
  ];
  await db.collection("roles").insertOne({tenantId:"tenant-a",roleId:"inventory-role",key:"inventory.manager",permissionKeys:permissions,status:"active"});
  await db.collection("memberships").insertOne({
   tenantId:"tenant-a",membershipId:"inventory-membership",userId:"inventory-user",
   organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["inventory-role"],status:"active"
  });
  await db.collection("sessions").insertOne({
   tenantId:"tenant-a",sessionId:"inventory-session",userId:"inventory-user",membershipId:"inventory-membership",
   expiresAt:new Date(now.getTime()+60_000),lastUsedAt:now
  });
  await db.collection("memberships").insertOne({
   tenantId:"tenant-a",membershipId:"hr-manager-membership",userId:"hr-manager-user",
   organizationIds:["org-a"],locationIds:["loc-a"],roleIds:["inventory-role"],status:"active"
  });
  await db.collection("sessions").insertOne({
   tenantId:"tenant-a",sessionId:"hr-manager-session",userId:"hr-manager-user",membershipId:"hr-manager-membership",
   expiresAt:new Date(now.getTime()+60_000),lastUsedAt:now
  });
  await db.collection("policies").insertMany(permissions.map((action,index)=>({
   tenantId:"tenant-a",policyId:"inventory-allow-"+index,key:"inventory-allow-"+index,effect:"allow",priority:0,
   subject:{userId:"inventory-user"},resource:{},actions:[action],conditions:{},status:"active"
  })));
  await db.collection("policies").insertMany(["hr.leave.approve","hr.leave.read","payroll.run.read","payroll.run.approve","projects.project.read","projects.time_entry.read","projects.time_entry.approve","workflows.definition.read","workflows.run.read","workflows.task.read","workflows.task.approve"].map((action,index)=>({
   tenantId:"tenant-a",policyId:"manager-allow-"+index,key:"manager-allow-"+index,effect:"allow",priority:0,
   subject:{userId:"hr-manager-user"},resource:{},actions:[action],conditions:{},status:"active"
  })));
  await db.collection("inventory_warehouses").insertMany([
   {tenantId:"tenant-a",warehouseId:"warehouse-a",code:"WH-A",name:"Assigned warehouse",locationId:"loc-a",status:"active"},
   {tenantId:"tenant-a",warehouseId:"warehouse-b",code:"WH-B",name:"Other location warehouse",locationId:"loc-b",status:"active"},
   {tenantId:"tenant-b",warehouseId:"warehouse-secret",code:"WH-S",name:"Foreign tenant warehouse",locationId:"loc-secret",status:"active"}
  ]);
  await app.register(domainRoutes(db,config),{prefix:"/v1"});await app.ready();
  const token=await new SignJWT({tenantId:"tenant-a",membershipId:"inventory-membership",sessionId:"inventory-session"})
   .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience)
   .setSubject("inventory-user").setIssuedAt().setExpirationTime("5m").sign(signingKey);
  const headers={authorization:`Bearer ${token}`};
  const managerToken=await new SignJWT({tenantId:"tenant-a",membershipId:"hr-manager-membership",sessionId:"hr-manager-session"})
   .setProtectedHeader({alg:"HS256"}).setIssuer(config.issuer).setAudience(config.audience)
   .setSubject("hr-manager-user").setIssuedAt().setExpirationTime("5m").sign(signingKey);
  const managerHeaders={authorization:`Bearer ${managerToken}`};

  const listed=await app.inject({method:"GET",url:"/v1/inventory/warehouses",headers});
  assert.equal(listed.statusCode,200);
  assert.deepEqual(listed.json().data.map((w:any)=>w.warehouseId),["warehouse-a"]);

  const foreign=await app.inject({method:"GET",url:"/v1/inventory/warehouses/warehouse-secret/balances",headers});
  assert.equal(foreign.statusCode,404,"foreign-tenant resources must not be discoverable");

  const outOfScope=await app.inject({method:"GET",url:"/v1/inventory/warehouses/warehouse-b/balances",headers});
  assert.equal(outOfScope.statusCode,403,"same-tenant resources outside the assigned location must be denied");

  const create=await app.inject({
   method:"POST",url:"/v1/inventory/warehouses",headers:{...headers,"idempotency-key":"warehouse-create-api-001"},
   payload:{warehouseId:"warehouse-new",code:"WH-NEW",name:"New assigned warehouse",locationId:"loc-a",status:"active"}
  });
  assert.equal(create.statusCode,201);
  const replay=await app.inject({
   method:"POST",url:"/v1/inventory/warehouses",headers:{...headers,"idempotency-key":"warehouse-create-api-001"},
   payload:{warehouseId:"warehouse-new",code:"WH-NEW",name:"New assigned warehouse",locationId:"loc-a",status:"active"}
  });
  assert.equal(replay.statusCode,201);
  assert.deepEqual(replay.json(),create.json());

  const deniedCreate=await app.inject({
   method:"POST",url:"/v1/inventory/warehouses",headers:{...headers,"idempotency-key":"warehouse-create-api-002"},
   payload:{warehouseId:"warehouse-denied",code:"WH-DENIED",name:"Other location warehouse",locationId:"loc-b",status:"active"}
  });
  assert.equal(deniedCreate.statusCode,403);

  const movement=await app.inject({
   method:"POST",url:"/v1/inventory/stock-movements",headers:{...headers,"idempotency-key":"stock-receipt-api-001"},
   payload:{movementId:"receipt-api-001",movementType:"receipt",sku:"SKU-API",warehouseId:"warehouse-a",quantityMilli:5000,referenceType:"purchase_order",referenceId:"PO-API",occurredAt:now.toISOString()}
  });
  assert.equal(movement.statusCode,201);
  const balances=await app.inject({method:"GET",url:"/v1/inventory/warehouses/warehouse-a/balances?sku=SKU-API",headers});
  assert.equal(balances.statusCode,200);
  assert.equal(balances.json().data[0].quantityOnHandMilli,5000);

  const reservation=await app.inject({
   method:"POST",url:"/v1/inventory/reservations",headers:{...headers,"idempotency-key":"stock-reserve-api-001"},
   payload:{reservationId:"reservation-api-001",orderId:"order-api-001",warehouseId:"warehouse-a",lines:[{sku:"SKU-API",quantityMilli:2000}],status:"reserved",expiresAt:new Date(Date.now()+60_000).toISOString()}
  });
  assert.equal(reservation.statusCode,201);
  const committed=await app.inject({method:"POST",url:"/v1/inventory/reservations/reservation-api-001/commit",headers:{...headers,"idempotency-key":"stock-commit-api-001"}});
  assert.equal(committed.statusCode,200);
  const committedReplay=await app.inject({method:"POST",url:"/v1/inventory/reservations/reservation-api-001/commit",headers:{...headers,"idempotency-key":"stock-commit-api-001"}});
  assert.equal(committedReplay.statusCode,200);
  assert.deepEqual(committedReplay.json(),committed.json());
  const finalBalance=await db.collection<any>("inventory_stock_balances").findOne({tenantId:"tenant-a",warehouseId:"warehouse-a",sku:"SKU-API"});
  assert.equal(finalBalance.quantityOnHandMilli,3000);
  assert.equal(finalBalance.quantityReservedMilli,0);

  const terminal=await app.inject({
   method:"POST",url:"/v1/pos/terminals",headers:{...headers,"idempotency-key":"pos-terminal-api-001"},
   payload:{terminalId:"terminal-api-001",code:"POS-API-1",locationId:"loc-a",deviceId:"device-api-1",status:"active"}
  });
  assert.equal(terminal.statusCode,201);
  const deniedTerminal=await app.inject({
   method:"POST",url:"/v1/pos/terminals",headers:{...headers,"idempotency-key":"pos-terminal-api-002"},
   payload:{terminalId:"terminal-api-002",code:"POS-API-2",locationId:"loc-b",deviceId:"device-api-2",status:"active"}
  });
  assert.equal(deniedTerminal.statusCode,403);
  const openedShift=await app.inject({
   method:"POST",url:"/v1/pos/shifts/open",headers:{...headers,"idempotency-key":"pos-shift-open-api-001"},
   payload:{shiftId:"shift-api-001",terminalId:"terminal-api-001",cashierId:"inventory-user",currency:"UGX",openedAt:now.toISOString(),openingFloatMinor:10000,status:"open"}
  });
  assert.equal(openedShift.statusCode,201);
  const sale=await app.inject({
   method:"POST",url:"/v1/pos/sales/complete",headers:{...headers,"idempotency-key":"pos-sale-api-001"},
   payload:{saleId:"sale-api-001",terminalId:"terminal-api-001",cashierId:"inventory-user",currency:"UGX",
    lines:[{sku:"SKU-POS-API",description:"POS API test item",quantityMilli:1000,unitPriceMinor:2000,discountMinor:0,taxRateBps:0}],
    subtotalMinor:2000,taxMinor:0,totalMinor:2000,
    tenders:[{tenderId:"tender-api-001",method:"cash",amountMinor:2000,currency:"UGX",status:"captured"}],
    status:"completed",completedAt:now.toISOString()}
  });
  assert.equal(sale.statusCode,201);
  const refund=await app.inject({
   method:"POST",url:"/v1/pos/refunds",headers:{...headers,"idempotency-key":"pos-refund-api-001"},
   payload:{refundId:"refund-api-001",saleId:"sale-api-001",originalSaleTotalMinor:2000,amountMinor:500,currency:"UGX",reason:"API integration return",status:"completed",completedAt:now.toISOString()}
  });
  assert.equal(refund.statusCode,201);
  const closedShift=await app.inject({
   method:"POST",url:"/v1/pos/shifts/shift-api-001/close",headers:{...headers,"idempotency-key":"pos-shift-close-api-001"},
   payload:{expectedCashMinor:2000,countedCashMinor:2000}
  });
  assert.equal(closedShift.statusCode,200);
  const offline=await app.inject({
   method:"POST",url:"/v1/pos/offline-commands",headers:{...headers,"idempotency-key":"offline-command-api-001"},
   payload:{terminalId:"terminal-api-001",commandId:"offline-command-api-001",sequence:1,commandType:"sale",payload:{saleId:"offline-sale-api-001"},issuedAt:now.toISOString()}
  });
  assert.equal(offline.statusCode,202);

  const accountCash=await app.inject({
   method:"POST",url:"/v1/erp/accounts",headers:{...headers,"idempotency-key":"erp-account-api-001"},
   payload:{organizationId:"org-a",accountCode:"1000",name:"Cash",accountType:"asset",normalBalance:"debit"}
  });
  assert.equal(accountCash.statusCode,201);
  const accountRevenue=await app.inject({
   method:"POST",url:"/v1/erp/accounts",headers:{...headers,"idempotency-key":"erp-account-api-002"},
   payload:{organizationId:"org-a",accountCode:"4000",name:"Sales Revenue",accountType:"income",normalBalance:"credit"}
  });
  assert.equal(accountRevenue.statusCode,201);
  const accountList=await app.inject({method:"GET",url:"/v1/erp/accounts",headers});
  assert.equal(accountList.statusCode,200);
  assert.equal(accountList.json().data.length,2);
  const deniedAccount=await app.inject({
   method:"POST",url:"/v1/erp/accounts",headers:{...headers,"idempotency-key":"erp-account-api-003"},
   payload:{organizationId:"org-b",accountCode:"9000",name:"Out of scope",accountType:"asset",normalBalance:"debit"}
  });
  assert.equal(deniedAccount.statusCode,403);

  const fiscal=await app.inject({
   method:"POST",url:"/v1/erp/fiscal-periods",headers:{...headers,"idempotency-key":"erp-period-api-001"},
   payload:{organizationId:"org-a",periodId:"FY-API",periodCode:"FY-API",startsAt:"2026-01-01T00:00:00.000Z",endsAt:"2026-12-31T23:59:59.999Z",status:"open"}
  });
  assert.equal(fiscal.statusCode,201);
  const purchaseOrder=await app.inject({
   method:"POST",url:"/v1/erp/purchase-orders",headers:{...headers,"idempotency-key":"erp-po-api-001"},
   payload:{orderNumber:"PO-API-001",supplierId:"supplier-api",warehouseId:"warehouse-a",currency:"UGX",orderedAt:now.toISOString(),
    lines:[{sku:"SKU-API",description:"Stock item",quantityMilli:1000,unitPriceMinor:1000,taxRateBps:0}],totalMinor:1000,status:"approved"}
  });
  assert.equal(purchaseOrder.statusCode,201);
  const goodsReceipt=await app.inject({
   method:"POST",url:"/v1/erp/purchase-orders/PO-API-001/receipts",headers:{...headers,"idempotency-key":"erp-goods-receipt-api-001"},
   payload:{organizationId:"org-a",receiptId:"erp-receipt-api-001",receivedAt:now.toISOString(),lines:[{sku:"SKU-API",quantityMilli:1000}]}
  });
  assert.equal(goodsReceipt.statusCode,201);
  assert.equal(goodsReceipt.json().status,"received",JSON.stringify(goodsReceipt.json()));
  const receiptBalance=await db.collection<any>("inventory_stock_balances").findOne({tenantId:"tenant-a",warehouseId:"warehouse-a",sku:"SKU-API"});
  assert.equal(receiptBalance.quantityOnHandMilli,4000);
  const invoice=await app.inject({
   method:"POST",url:"/v1/erp/invoices",headers:{...headers,"idempotency-key":"erp-invoice-api-001"},
   payload:{organizationId:"org-a",invoiceId:"invoice-api-001",invoiceNumber:"INV-API-001",invoiceType:"sales",partyId:"customer-api",currency:"UGX",
    issuedAt:now.toISOString(),dueAt:new Date(now.getTime()+30*86400000).toISOString(),
    lines:[{description:"Service",quantityMilli:1000,unitPriceMinor:10000,discountMinor:0,taxRateBps:1800}],
    subtotalMinor:10000,taxMinor:1800,totalMinor:11800,status:"issued"}
  });
  assert.equal(invoice.statusCode,201);
  const payment=await app.inject({
   method:"POST",url:"/v1/erp/invoices/invoice-api-001/payments",headers:{...headers,"idempotency-key":"erp-payment-api-001"},
   payload:{paymentId:"payment-api-001",amountMinor:11800,currency:"UGX"}
  });
  assert.equal(payment.statusCode,201);
  const invoiceList=await app.inject({method:"GET",url:"/v1/erp/invoices",headers});
  assert.equal(invoiceList.statusCode,200);
  assert.equal(invoiceList.json().data.length,1);
  const journal=await app.inject({
   method:"POST",url:"/v1/erp/journal-entries/post",headers:{...headers,"idempotency-key":"erp-journal-api-001"},
   payload:{entryNumber:"JE-API-001",fiscalPeriodId:"FY-API",sourceType:"manual",sourceId:"source-api-001",currency:"UGX",
    lines:[{accountCode:"1000",debitMinor:1000,creditMinor:0,currency:"UGX"},{accountCode:"4000",debitMinor:0,creditMinor:1000,currency:"UGX"}],
    status:"posted",postedAt:now.toISOString()}
  });
  assert.equal(journal.statusCode,201);

  const crmAccount=await app.inject({
   method:"POST",url:"/v1/crm/accounts",headers:{...headers,"idempotency-key":"crm-account-api-001"},
   payload:{organizationId:"org-a",accountId:"crm-account-api-001",name:"Acme Customer",accountType:"customer",status:"active"}
  });
  assert.equal(crmAccount.statusCode,201);
  const crmContact=await app.inject({
   method:"POST",url:"/v1/crm/contacts",headers:{...headers,"idempotency-key":"crm-contact-api-001"},
   payload:{organizationId:"org-a",contactId:"crm-contact-api-001",accountId:"crm-account-api-001",firstName:"Amina",lastName:"N.",
    email:"amina.crm@example.test",marketingConsent:"granted",consentCapturedAt:now.toISOString(),consentSource:"web form",status:"active"}
  });
  assert.equal(crmContact.statusCode,201);
  const crmLead=await app.inject({
   method:"POST",url:"/v1/crm/leads",headers:{...headers,"idempotency-key":"crm-lead-api-001"},
   payload:{organizationId:"org-a",leadId:"crm-lead-api-001",firstName:"Brian",lastName:"K.",source:"referral",status:"new",marketingConsent:"unknown"}
  });
  assert.equal(crmLead.statusCode,201);
  const crmOpportunity=await app.inject({
   method:"POST",url:"/v1/crm/opportunities",headers:{...headers,"idempotency-key":"crm-opportunity-api-001"},
   payload:{organizationId:"org-a",opportunityId:"crm-opportunity-api-001",accountId:"crm-account-api-001",contactId:"crm-contact-api-001",
    name:"Annual supply contract",stage:"prospecting",amountMinor:2500000,currency:"UGX",expectedCloseAt:"2026-12-31T00:00:00.000Z",ownerUserId:"inventory-user",version:0}
  });
  assert.equal(crmOpportunity.statusCode,201);
  const crmActivity=await app.inject({
   method:"POST",url:"/v1/crm/activities",headers:{...headers,"idempotency-key":"crm-activity-api-001"},
   payload:{organizationId:"org-a",activityId:"crm-activity-api-001",relatedType:"opportunity",relatedId:"crm-opportunity-api-001",
    activityType:"meeting",subject:"Discovery call",occurredAt:now.toISOString(),status:"completed"}
  });
  assert.equal(crmActivity.statusCode,201);
  const crmStage=await app.inject({
   method:"PATCH",url:"/v1/crm/opportunities/crm-opportunity-api-001/stage",headers:{...headers,"idempotency-key":"crm-stage-api-001"},
   payload:{organizationId:"org-a",stage:"qualification",expectedVersion:0}
  });
  assert.equal(crmStage.statusCode,200);
  const crmAccounts=await app.inject({method:"GET",url:"/v1/crm/accounts",headers});
  assert.equal(crmAccounts.statusCode,200);
  assert.equal(crmAccounts.json().data.length,1);
  const crmOpportunities=await app.inject({method:"GET",url:"/v1/crm/opportunities",headers});
  assert.equal(crmOpportunities.statusCode,200);
  assert.equal(crmOpportunities.json().data[0].stage,"qualification");
  const deniedCrmAccount=await app.inject({
   method:"POST",url:"/v1/crm/accounts",headers:{...headers,"idempotency-key":"crm-account-api-002"},
   payload:{organizationId:"org-b",accountId:"crm-account-denied",name:"Out of scope",accountType:"prospect"}
  });
  assert.equal(deniedCrmAccount.statusCode,403);
  const hrEmployee=await app.inject({
   method:"POST",url:"/v1/hr/employees",headers:{...headers,"idempotency-key":"hr-employee-api-001"},
   payload:{organizationId:"org-a",employeeId:"hr-employee-api-001",employeeNumber:"HR-001",userId:"employee-other",
    firstName:"Grace",lastName:"O.",workEmail:"grace.hr@example.test",departmentId:"operations",positionTitle:"Operations Analyst",
    employmentType:"permanent",status:"active",startDate:"2025-01-01T00:00:00.000Z"}
  });
  assert.equal(hrEmployee.statusCode,201);
  const hrEmployees=await app.inject({method:"GET",url:"/v1/hr/employees",headers});
  assert.equal(hrEmployees.statusCode,200);
  assert.equal(hrEmployees.json().data.length,1);
  const leave=await app.inject({
   method:"POST",url:"/v1/hr/leave-requests",headers:{...headers,"idempotency-key":"hr-leave-api-001"},
   payload:{organizationId:"org-a",leaveRequestId:"hr-leave-api-001",employeeId:"hr-employee-api-001",leaveType:"annual",
    startsAt:"2026-12-01T00:00:00.000Z",endsAt:"2026-12-05T00:00:00.000Z",days:5}
  });
  assert.equal(leave.statusCode,201);
  const selfApproval=await app.inject({
   method:"POST",url:"/v1/hr/leave-requests/hr-leave-api-001/approve",headers:{...headers,"idempotency-key":"hr-leave-self-approve-api"},
   payload:{organizationId:"org-a",reason:"Requester must not approve their own leave",expectedVersion:0}
  });
  assert.equal(selfApproval.statusCode,409);
  const approvedLeave=await app.inject({
   method:"POST",url:"/v1/hr/leave-requests/hr-leave-api-001/approve",headers:{...managerHeaders,"idempotency-key":"hr-leave-approve-api-001"},
   payload:{organizationId:"org-a",reason:"Coverage confirmed and approval recorded",expectedVersion:0}
  });
  assert.equal(approvedLeave.statusCode,200,JSON.stringify(approvedLeave.json()));
  const hrLeaveList=await app.inject({method:"GET",url:"/v1/hr/leave-requests",headers:managerHeaders});
  assert.equal(hrLeaveList.statusCode,200);
  assert.equal(hrLeaveList.json().data[0].status,"approved");
  const payroll=await app.inject({
   method:"POST",url:"/v1/payroll/runs",headers:{...headers,"idempotency-key":"payroll-api-001"},
   payload:{organizationId:"org-a",payrollRunId:"payroll-api-001",periodStart:"2026-11-01T00:00:00.000Z",periodEnd:"2026-11-30T23:59:59.999Z",
    jurisdiction:"UG",currency:"UGX",calculationProvider:"reviewed-calculation-adapter",rulesetVersion:"UG-2026-v1",calculatedAt:now.toISOString(),
    lines:[{employeeId:"hr-employee-api-001",grossMinor:100000,statutoryDeductionMinor:10000,voluntaryDeductionMinor:5000,employerContributionMinor:8000,netMinor:85000}],
    totalGrossMinor:100000,totalStatutoryDeductionsMinor:10000,totalVoluntaryDeductionsMinor:5000,totalEmployerContributionsMinor:8000,totalNetMinor:85000}
  });
  assert.equal(payroll.statusCode,201);
  const payrollSelfApprove=await app.inject({
   method:"POST",url:"/v1/payroll/runs/payroll-api-001/approve",headers:{...headers,"idempotency-key":"payroll-self-approve-api"},
   payload:{organizationId:"org-a",reason:"The maker cannot approve their own payroll run",expectedVersion:0}
  });
  assert.equal(payrollSelfApprove.statusCode,409);
  const payrollApproved=await app.inject({
   method:"POST",url:"/v1/payroll/runs/payroll-api-001/approve",headers:{...managerHeaders,"idempotency-key":"payroll-approve-api-001"},
   payload:{organizationId:"org-a",reason:"Independent review of reconciled payroll totals completed",expectedVersion:0}
  });
  assert.equal(payrollApproved.statusCode,200);
  const payrollList=await app.inject({method:"GET",url:"/v1/payroll/runs",headers:managerHeaders});
  assert.equal(payrollList.statusCode,200);
  assert.equal(payrollList.json().data[0].status,"approved");
  await db.collection("payment_provider_configs").insertOne({tenantId:"tenant-a",organizationId:"org-a",providerId:"test-provider",status:"active"});
  await db.collection("erp_invoices").insertOne({tenantId:"tenant-a",organizationId:"org-a",invoiceId:"invoice-payment-api-001",invoiceNumber:"INV-PAY-001",
   invoiceType:"sales",partyId:"customer-api",currency:"UGX",totalMinor:5000,paidMinor:0,status:"issued",issuedAt:now,dueAt:new Date(now.getTime()+30*86400000)});
  const paymentIntent=await app.inject({
   method:"POST",url:"/v1/payments/intents",headers:{...headers,"idempotency-key":"payment-intent-api-001"},
   payload:{organizationId:"org-a",paymentId:"payment-intent-api-001",providerId:"test-provider",referenceType:"invoice",
    referenceId:"invoice-payment-api-001",amountMinor:5000,currency:"UGX"}
  });
  assert.equal(paymentIntent.statusCode,201);
  const paymentIntentList=await app.inject({method:"GET",url:"/v1/payments/intents",headers});
  assert.equal(paymentIntentList.statusCode,200);
  assert.equal(paymentIntentList.json().data.length,1);
  await db.collection("payment_intents").insertOne({tenantId:"tenant-a",organizationId:"org-a",paymentId:"payment-captured-api-001",
   providerId:"test-provider",referenceType:"invoice",referenceId:"invoice-payment-api-001",amountMinor:1000,currency:"UGX",status:"captured",version:1});
  const refundRequest=await app.inject({
   method:"POST",url:"/v1/payments/refund-requests",headers:{...headers,"idempotency-key":"payment-refund-api-001"},
   payload:{organizationId:"org-a",refundId:"refund-payment-api-001",paymentId:"payment-captured-api-001",amountMinor:500,reason:"Customer returned an item"}
  });
  assert.equal(refundRequest.statusCode,202);
  const commerceProduct=await app.inject({
   method:"POST",url:"/v1/commerce/products",headers:{...headers,"idempotency-key":"commerce-product-api-001"},
   payload:{organizationId:"org-a",productId:"commerce-product-api-001",sku:"SKU-COM-API",name:"Commerce API product",currency:"UGX",unitPriceMinor:1000,taxRateBps:1800,status:"active"}
  });
  assert.equal(commerceProduct.statusCode,201);
  await db.collection("inventory_reservations").insertOne({tenantId:"tenant-a",reservationId:"reservation-commerce-api-001",warehouseId:"warehouse-a",
   orderId:"commerce-order-api-001",lines:[{sku:"SKU-COM-API",quantityMilli:1000}],status:"reserved"});
  const commerceOrder=await app.inject({
   method:"POST",url:"/v1/commerce/orders",headers:{...headers,"idempotency-key":"commerce-order-api-001"},
   payload:{organizationId:"org-a",orderId:"commerce-order-api-001",customerId:"customer-api",warehouseId:"warehouse-a",
    reservationId:"reservation-commerce-api-001",lines:[{sku:"SKU-COM-API",quantityMilli:1000}]}
  });
  assert.equal(commerceOrder.statusCode,201);
  assert.equal(commerceOrder.json().totalMinor,1180);
  const commerceOrders=await app.inject({method:"GET",url:"/v1/commerce/orders",headers});
  assert.equal(commerceOrders.statusCode,200);
  assert.equal(commerceOrders.json().data.length,1);
  const asset=await app.inject({
   method:"POST",url:"/v1/assets",headers:{...headers,"idempotency-key":"asset-api-001"},
   payload:{organizationId:"org-a",assetId:"asset-api-001",assetTag:"ASSET-API-001",name:"Service vehicle",category:"vehicle",
    acquiredAt:now.toISOString(),acquisitionCostMinor:12000000,residualValueMinor:1200000,usefulLifeMonths:60,currency:"UGX",depreciationMethod:"straight_line",status:"active"}
  });
  assert.equal(asset.statusCode,201);
  const workOrder=await app.inject({
   method:"POST",url:"/v1/assets/maintenance-work-orders",headers:{...headers,"idempotency-key":"asset-work-api-001"},
   payload:{organizationId:"org-a",workOrderId:"asset-work-api-001",assetId:"asset-api-001",workType:"preventive",priority:"normal",
    description:"Scheduled service and inspection",scheduledAt:new Date(now.getTime()+86400000).toISOString(),estimatedCostMinor:150000}
  });
  assert.equal(workOrder.statusCode,201);
  const completedWork=await app.inject({
   method:"POST",url:"/v1/assets/maintenance-work-orders/asset-work-api-001/complete",headers:{...headers,"idempotency-key":"asset-work-complete-api-001"},
   payload:{organizationId:"org-a",actualCostMinor:140000,completionNotes:"Service completed and inspection checklist signed",expectedVersion:0}
  });
  assert.equal(completedWork.statusCode,200);
  const assetList=await app.inject({method:"GET",url:"/v1/assets",headers});
  assert.equal(assetList.statusCode,200);
  assert.equal(assetList.json().data.length,1);
  const project=await app.inject({
   method:"POST",url:"/v1/projects",headers:{...headers,"idempotency-key":"project-api-001"},
   payload:{organizationId:"org-a",projectId:"project-api-001",projectCode:"PRJ-API-001",name:"Customer implementation",
    managerUserId:"hr-manager-user",startsAt:now.toISOString(),dueAt:new Date(now.getTime()+30*86400000).toISOString(),budgetMinor:500000,currency:"UGX",status:"active"}
  });
  assert.equal(project.statusCode,201);
  const task=await app.inject({
   method:"POST",url:"/v1/projects/project-api-001/tasks",headers:{...headers,"idempotency-key":"project-task-api-001"},
   payload:{organizationId:"org-a",taskId:"project-task-api-001",name:"Deployment workshop",priority:"high",estimatedMinutes:240}
  });
  assert.equal(task.statusCode,201);
  const timeEntry=await app.inject({
   method:"POST",url:"/v1/projects/project-api-001/time-entries",headers:{...headers,"idempotency-key":"project-time-api-001"},
   payload:{organizationId:"org-a",timeEntryId:"project-time-api-001",taskId:"project-task-api-001",employeeId:"hr-employee-api-001",
    workDate:now.toISOString(),minutes:120,billable:true,description:"Delivered deployment workshop"}
  });
  assert.equal(timeEntry.statusCode,201);
  const selfTimeApproval=await app.inject({
   method:"POST",url:"/v1/projects/time-entries/project-time-api-001/approve",headers:{...headers,"idempotency-key":"project-time-self-approve"},
   payload:{organizationId:"org-a",reason:"Maker cannot approve own time entry",expectedVersion:0}
  });
  assert.equal(selfTimeApproval.statusCode,409);
  const approvedTime=await app.inject({
   method:"POST",url:"/v1/projects/time-entries/project-time-api-001/approve",headers:{...managerHeaders,"idempotency-key":"project-time-approve-api-001"},
   payload:{organizationId:"org-a",reason:"Independent project manager review completed",expectedVersion:0}
  });
  assert.equal(approvedTime.statusCode,200);
  const projectEntries=await app.inject({method:"GET",url:"/v1/projects/project-api-001/time-entries",headers:managerHeaders});
  assert.equal(projectEntries.statusCode,200);
  assert.equal(projectEntries.json().data[0].status,"approved");

  const workflow=await app.inject({
   method:"POST",url:"/v1/workflows",headers:{...headers,"idempotency-key":"workflow-definition-api-001"},
   payload:{organizationId:"org-a",workflowId:"workflow-api-001",name:"Purchase approval",triggerType:"manual",version:1,status:"active",
    steps:[{stepId:"finance-review",stepType:"approval",assigneeUserIds:["hr-manager-user"],requiredApprovals:1}]}
  });
  assert.equal(workflow.statusCode,201);
  const workflowReplay=await app.inject({
   method:"POST",url:"/v1/workflows",headers:{...headers,"idempotency-key":"workflow-definition-api-001"},
   payload:{organizationId:"org-a",workflowId:"workflow-api-001",name:"Purchase approval",triggerType:"manual",version:1,status:"active",
    steps:[{stepId:"finance-review",stepType:"approval",assigneeUserIds:["hr-manager-user"],requiredApprovals:1}]}
  });
  assert.deepEqual(workflowReplay.json(),workflow.json());
  const workflowList=await app.inject({method:"GET",url:"/v1/workflows",headers:managerHeaders});
  assert.equal(workflowList.statusCode,200);
  assert.equal(workflowList.json().data.length,1);
  const workflowRun=await app.inject({
   method:"POST",url:"/v1/workflows/workflow-api-001/runs",headers:{...headers,"idempotency-key":"workflow-run-api-001"},
   payload:{organizationId:"org-a",runId:"workflow-run-api-001",context:{purchaseOrderId:"PO-API-001"}}
  });
  assert.equal(workflowRun.statusCode,201);
  const workflowRuns=await app.inject({method:"GET",url:"/v1/workflow-runs",headers:managerHeaders});
  assert.equal(workflowRuns.statusCode,200);
  assert.equal(workflowRuns.json().data.length,1);
  const workflowTasks=await app.inject({method:"GET",url:"/v1/workflow-tasks",headers:managerHeaders});
  assert.equal(workflowTasks.statusCode,200);
  assert.equal(workflowTasks.json().data.length,1);
  assert.equal(workflowTasks.json().data[0].taskId,"workflow-run-api-001-finance-review");
  const selfWorkflowApproval=await app.inject({
   method:"POST",url:"/v1/workflow-tasks/workflow-run-api-001-finance-review/approve",headers:{...headers,"idempotency-key":"workflow-self-approve-api"},
   payload:{organizationId:"org-a",reason:"Requester cannot approve their own workflow task",expectedVersion:0}
  });
  assert.equal(selfWorkflowApproval.statusCode,409);
  const workflowApproval=await app.inject({
   method:"POST",url:"/v1/workflow-tasks/workflow-run-api-001-finance-review/approve",headers:{...managerHeaders,"idempotency-key":"workflow-approve-api-001"},
   payload:{organizationId:"org-a",reason:"Independent finance approval completed with evidence",expectedVersion:0}
  });
  assert.equal(workflowApproval.statusCode,200);
  assert.equal(workflowApproval.json().runStatus,"completed");
  assert.ok(await db.collection("audit_events").countDocuments({tenantId:"tenant-a"})>=48);
  assert.ok(await db.collection("outbox_events").countDocuments({tenantId:"tenant-a"})>=3);
 }finally{
  await app.close();await db.dropDatabase();await client.close();
 }
});
