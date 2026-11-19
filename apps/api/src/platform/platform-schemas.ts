import {z} from "zod";

export const createOrganizationSchema=z.object({
 code:z.string().min(1).max(40),name:z.string().min(2).max(150),
 type:z.enum(["group","company","business_unit","department","branch"]),
 parentOrganizationId:z.string().optional()
});
export const createLocationSchema=z.object({
 organizationId:z.string().min(1),code:z.string().min(1).max(40),name:z.string().min(2).max(150),
 type:z.enum(["site","store","warehouse","office","other"]),parentLocationId:z.string().optional(),
 timezone:z.string().optional(),address:z.record(z.string()).optional()
});
export const createMembershipSchema=z.object({
 userId:z.string().min(1),organizationIds:z.array(z.string().min(1)).min(1),
 locationIds:z.array(z.string().min(1)).default([]),roleIds:z.array(z.string().min(1)).default([])
});
export const createRoleSchema=z.object({
 key:z.string().min(2).max(100),name:z.string().min(2).max(100),
 description:z.string().max(500).optional(),permissionKeys:z.array(z.string().min(1)).max(500),
 isSystem:z.boolean().default(false)
});
export const upsertPolicySchema=z.object({
 effect:z.enum(["allow","deny"]),priority:z.number().int().min(0).max(10000),
 subject:z.record(z.unknown()).default({}),resource:z.record(z.unknown()).default({}),
 actions:z.array(z.string().min(1)).min(1),conditions:z.record(z.unknown()).default({})
});
export const featureFlagSchema=z.object({
 enabled:z.boolean(),description:z.string().max(500).optional(),
 environments:z.array(z.string().min(1)).default(["development"]),
 rules:z.array(z.record(z.unknown())).default([])
});
export const policyKeyParamsSchema=z.object({key:z.string().min(2).max(100)});
export const featureFlagKeyParamsSchema=z.object({key:z.string().min(2).max(100)});
export const sessionIdParamsSchema=z.object({sessionId:z.string().min(1)});
export const sessionsQuerySchema=z.object({userId:z.string().optional(),activeOnly:z.coerce.boolean().default(true)});
export const auditEventsQuerySchema=z.object({action:z.string().optional(),limit:z.coerce.number().int().min(1).max(200).default(50)});

export const PLATFORM_BODY_CONTRACTS=[
 {method:"post",path:"/platform/organizations",schemaName:"CreateOrganization",schema:createOrganizationSchema},
 {method:"post",path:"/platform/locations",schemaName:"CreateLocation",schema:createLocationSchema},
 {method:"post",path:"/platform/memberships",schemaName:"CreateMembership",schema:createMembershipSchema},
 {method:"post",path:"/platform/roles",schemaName:"CreateRole",schema:createRoleSchema},
 {method:"put",path:"/platform/policies/{key}",schemaName:"PolicyInput",schema:upsertPolicySchema},
 {method:"put",path:"/platform/feature-flags/{key}",schemaName:"FeatureFlagInput",schema:featureFlagSchema}
] as const;
