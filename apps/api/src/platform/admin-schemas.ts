import {z} from "zod";
export const reasonSchema=z.string().min(20).max(2000);
export const approvalScopeSchema=z.enum(["tenant","platform"]);
export const approvalActionSchema=z.enum(["membership.suspend","membership.reactivate","membership.revoke","organization.deactivate","location.deactivate","policy.apply","feature_flag.set","break_glass.grant","tenant.activate","tenant.suspend","tenant.close"]);
export const inviteUserSchema=z.object({
 email:z.string().email().max(254),displayName:z.string().min(2).max(120),
 phoneE164:z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
 organizationIds:z.array(z.string().min(1)).min(1),locationIds:z.array(z.string().min(1)).default([]),
 roleIds:z.array(z.string().min(1)).default([]),reason:reasonSchema
});
export const createApprovalRequestSchema=z.object({
 action:approvalActionSchema,targetType:z.string().min(2).max(80),targetId:z.string().min(1).max(200),
 payload:z.record(z.unknown()).default({}),reason:reasonSchema,ttlSeconds:z.number().int().min(300).max(7*24*60*60).default(24*60*60)
});
export const approvalDecisionSchema=z.object({reason:z.string().min(10).max(1000)});
export const policySimulationSchema=z.object({subject:z.record(z.unknown()).default({}),resource:z.record(z.unknown()).default({}),action:z.string().min(1),environment:z.record(z.unknown()).default({})});
export const auditExportFiltersSchema=z.object({
 action:z.string().optional(),actorUserId:z.string().optional(),resourceType:z.string().optional(),
 outcome:z.enum(["success","denied","failure"]).optional(),correlationId:z.string().optional(),
 from:z.string().datetime().optional(),to:z.string().datetime().optional(),
 limit:z.number().int().min(1).max(10000).default(10000)
}).refine(value=>!value.from||!value.to||new Date(value.from)<=new Date(value.to),{message:"from must be earlier than to"});
export const createAuditExportSchema=z.object({filters:auditExportFiltersSchema.default({}),reason:reasonSchema});
export const breakGlassRevokeSchema=z.object({reason:reasonSchema});
export const configurationUpdateSchema=z.object({value:z.any().refine(value=>value!==undefined),reason:reasonSchema});
export const provisionTenantSchema=z.object({
 slug:z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),legalName:z.string().min(2).max(200),
 displayName:z.string().min(2).max(100),defaultLocale:z.string().default("en"),
 defaultCurrency:z.string().length(3).default("UGX"),timezone:z.string().default("Africa/Kampala"),
 owner:z.object({email:z.string().email().max(254),displayName:z.string().min(2).max(120),phoneE164:z.string().regex(/^\+[1-9]\d{7,14}$/).optional()}),
 reason:reasonSchema
});
export const lifecycleRequestSchema=z.object({reason:reasonSchema});
export const tenantLifecycleRequestSchema=z.object({action:z.enum(["tenant.activate","tenant.suspend","tenant.close"]),reason:reasonSchema});
export const ADMIN_BODY_CONTRACTS=[
 {method:"post",path:"/platform/admin/users/invitations",schemaName:"InviteUser",schema:inviteUserSchema},
 {method:"post",path:"/platform/admin/approvals",schemaName:"CreateApprovalRequest",schema:createApprovalRequestSchema},
 {method:"post",path:"/platform/admin/approvals/{requestId}/approve",schemaName:"ApprovalDecision",schema:approvalDecisionSchema},
 {method:"post",path:"/platform/admin/approvals/{requestId}/reject",schemaName:"ApprovalDecision",schema:approvalDecisionSchema},
 {method:"post",path:"/platform/admin/policies/simulate",schemaName:"PolicySimulation",schema:policySimulationSchema},
 {method:"post",path:"/platform/admin/audit-exports",schemaName:"CreateAuditExport",schema:createAuditExportSchema},
 {method:"post",path:"/platform/admin/break-glass/{grantId}/revoke",schemaName:"BreakGlassRevoke",schema:breakGlassRevokeSchema},
 {method:"put",path:"/platform/admin/configuration/{key}",schemaName:"ConfigurationUpdate",schema:configurationUpdateSchema},
 {method:"post",path:"/platform/admin/tenants",schemaName:"ProvisionTenant",schema:provisionTenantSchema},
 {method:"post",path:"/platform/admin/organizations/{organizationId}/lifecycle-requests",schemaName:"LifecycleRequest",schema:lifecycleRequestSchema},
 {method:"post",path:"/platform/admin/locations/{locationId}/lifecycle-requests",schemaName:"LifecycleRequest",schema:lifecycleRequestSchema},
 {method:"post",path:"/platform/admin/tenants/{tenantId}/lifecycle-requests",schemaName:"TenantLifecycleRequest",schema:tenantLifecycleRequestSchema}
] as const;
