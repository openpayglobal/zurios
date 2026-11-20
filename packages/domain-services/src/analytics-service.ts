import type {Db} from "mongodb";
import {AnalyticsQuerySchema} from "@zuri/domain-contracts";

/** Read-only, allowlisted operational metrics. Every query is constrained by tenant, organization and period. */
export async function getOperationalAnalytics(db:Db,input:unknown){
 const query=AnalyticsQuerySchema.parse(input);
 const from=new Date(query.from),to=new Date(query.to);
 const scope={tenantId:query.tenantId,organizationId:query.organizationId,createdAt:{$gte:from,$lte:to}};
 const count=async(collection:string,extra:Record<string,unknown>={})=>db.collection(collection).countDocuments({...scope,...extra});
 const [invoices,openInvoices,purchaseOrders,employees,activeEmployees,assets,activeAssets,openMaintenanceOrders,projects,activeProjects,crmAccounts,openOpportunities,pendingPayments,payrollRuns]=await Promise.all([
  count("erp_invoices"),count("erp_invoices",{status:{$in:["issued","partially_paid"]}}),
  count("erp_purchase_orders"),count("hr_employees"),count("hr_employees",{status:"active"}),
  count("assets"),count("assets",{status:"active"}),count("maintenance_work_orders",{status:"open"}),
  count("projects"),count("projects",{status:"active"}),count("crm_accounts"),
  count("crm_opportunities",{status:{$nin:["won","lost","closed"]}}),
  count("payment_intents",{status:{$in:["pending","authorized"]}}),count("payroll_runs")
 ]);
 return {tenantId:query.tenantId,organizationId:query.organizationId,period:{from:query.from,to:query.to},generatedAt:new Date().toISOString(),metrics:{invoices,openInvoices,purchaseOrders,employees,activeEmployees,assets,activeAssets,openMaintenanceOrders,projects,activeProjects,crmAccounts,openOpportunities,pendingPayments,payrollRuns}};
}
