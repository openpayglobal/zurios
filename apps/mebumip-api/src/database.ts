import type { Db } from "mongodb";

export async function ensureMeBuMIPIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("users").createIndex({ normalizedEmail: 1 }, { unique: true, name: "users_email_unique" }),
    db.collection("users").createIndex({ platformRole: 1 }, { unique: true, partialFilterExpression: { platformRole: "platform_owner" }, name: "single_platform_owner" }),
    db.collection("tenants").createIndex({ slug: 1 }, { unique: true, name: "tenants_slug_unique" }),
    db.collection("memberships").createIndex({ tenantId: 1, userId: 1 }, { unique: true, name: "membership_tenant_user_unique" }),
    db.collection("memberships").createIndex({ userId: 1, status: 1 }, { name: "membership_user_status" }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "session_token_hash_unique" }),
    db.collection("sessions").createIndex({ userId: 1, revokedAt: 1, expiresAt: 1 }, { name: "session_user_active_lookup" }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry_ttl" }),
    db.collection("auditEvents").createIndex({ occurredAt: -1 }, { name: "audit_time_desc" }),
    db.collection("auditEvents").createIndex({ sequence: 1 }, { unique: true, sparse: true, name: "audit_sequence_unique" }),
    db.collection("auditEvents").createIndex({ tenantId: 1, occurredAt: -1 }, { name: "audit_tenant_time_desc", sparse: true }),
    db.collection("auditEvents").createIndex({ correlationId: 1 }, { name: "audit_correlation" }),
    db.collection("auditArchiveReceipts").createIndex({ objectKey: 1 }, { unique: true, name: "audit_archive_object_key_unique" }),
    db.collection("auditArchiveReceipts").createIndex({ fromSequence: 1, toSequence: 1 }, { name: "audit_archive_sequence_range" }),
    db.collection("auditArchiveReceipts").createIndex({ archivedAt: -1 }, { name: "audit_archive_time_desc" }),
    db.collection("tenantInvitations").createIndex({ tokenHash: 1 }, { unique: true, name: "tenant_invitation_token_unique" }),
    db.collection("platformAdminInvitations").createIndex({ tokenHash: 1 }, { unique: true, name: "platform_admin_invitation_token_unique" }),
    db.collection("platformAdminInvitations").createIndex({ email: 1, expiresAt: 1 }, { name: "platform_admin_invitation_email_expiry" }),
    db.collection("platformAdminInvitations").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "platform_admin_invitation_expiry_ttl" }),
    db.collection("tenantInvitations").createIndex({ tenantId: 1, email: 1, expiresAt: 1 }, { name: "tenant_invitation_lookup" }),
    db.collection("tenantInvitations").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "tenant_invitation_expiry_ttl" }),
    db.collection("rateLimitCounters").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limit_expiry_ttl" }),
    db.collection("metaConnections").createIndex({ tenantId: 1, provider: 1, status: 1 }, { name: "meta_connection_tenant_provider_status" }),
  ]);
}
