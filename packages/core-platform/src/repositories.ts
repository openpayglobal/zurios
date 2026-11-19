import type {Collection,Db,Filter} from "mongodb";
import type {AuditEventDocument,FeatureFlagDocument,LocationDocument,MembershipDocument,OrganizationDocument,PolicyDocument,RoleDocument,SessionDocument,TenantDocument,UserDocument} from "./types.js";
export type CoreCollections={tenants:Collection<TenantDocument>;organizations:Collection<OrganizationDocument>;locations:Collection<LocationDocument>;users:Collection<UserDocument>;memberships:Collection<MembershipDocument>;roles:Collection<RoleDocument>;policies:Collection<PolicyDocument>;sessions:Collection<SessionDocument>;featureFlags:Collection<FeatureFlagDocument>;auditEvents:Collection<AuditEventDocument>};
export function coreCollections(db:Db):CoreCollections{return {tenants:db.collection("tenants"),organizations:db.collection("organizations"),locations:db.collection("locations"),users:db.collection("users"),memberships:db.collection("memberships"),roles:db.collection("roles"),policies:db.collection("policies"),sessions:db.collection("sessions"),featureFlags:db.collection("feature_flags"),auditEvents:db.collection("audit_events")};}
/** Compose tenant scope with a caller filter; tenant scope is always ANDed, never overwritten. */
export function scoped<T extends {tenantId:string}>(tenantId:string,filter:Filter<T>={}):Filter<T>{
 return {$and:[{tenantId},filter]} as unknown as Filter<T>;
}
