import type { Db } from "mongodb";

export async function ensureMeBuMIPIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("users").createIndex({ normalizedEmail: 1 }, { unique: true, name: "users_email_unique" }),
    db.collection("tenants").createIndex({ slug: 1 }, { unique: true, name: "tenants_slug_unique" }),
    db.collection("memberships").createIndex({ tenantId: 1, userId: 1 }, { unique: true, name: "membership_tenant_user_unique" }),
    db.collection("memberships").createIndex({ userId: 1, status: 1 }, { name: "membership_user_status" }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "session_token_hash_unique" }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry_ttl" }),
    db.collection("auditEvents").createIndex({ occurredAt: -1 }, { name: "audit_time_desc" }),
    db.collection("auditEvents").createIndex({ tenantId: 1, occurredAt: -1 }, { name: "audit_tenant_time_desc", sparse: true }),
    db.collection("auditEvents").createIndex({ correlationId: 1 }, { name: "audit_correlation" }),
    db.collection("metaConnections").createIndex({ tenantId: 1, provider: 1, status: 1 }, { name: "meta_connection_tenant_provider_status" }),
  ]);
}
