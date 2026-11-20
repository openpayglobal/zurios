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
    db.collection("auditEvents").createIndex({ eventHash: 1 }, { unique: true, sparse: true, name: "audit_event_hash_unique" }),
    db.collection("auditEvents").createIndex({ tenantId: 1, occurredAt: -1 }, { name: "audit_tenant_time_desc", sparse: true }),
    db.collection("auditEvents").createIndex({ correlationId: 1 }, { name: "audit_correlation" }),
    db.collection("tenantInvitations").createIndex({ tokenHash: 1 }, { unique: true, name: "tenant_invitation_token_unique" }),
    db.collection("tenantInvitations").createIndex({ tenantId: 1, email: 1, expiresAt: 1 }, { name: "tenant_invitation_lookup" }),
    db.collection("tenantInvitations").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "tenant_invitation_expiry_ttl" }),
    db.collection("passwordRecoveries").createIndex({ tokenHash: 1 }, { unique: true, name: "password_recovery_token_unique" }),
    db.collection("passwordRecoveries").createIndex({ userId: 1, usedAt: 1, revokedAt: 1 }, { name: "password_recovery_user_state" }),
    db.collection("passwordRecoveries").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "password_recovery_expiry_ttl" }),
    db.collection("rateLimitCounters").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limit_expiry_ttl" }),
    db.collection("metaConnections").createIndex({ tenantId: 1, provider: 1, status: 1 }, { name: "meta_connection_tenant_provider_status" }),
  ]);
}
