import test from "node:test";
import assert from "node:assert/strict";
import { assertTenantAccess, createAuditEvent, verifyAuditEvent, signAuditExport, verifyAuditExportManifest, hasPlatformPermission, hasTenantPermission, hashToken, newOpaqueToken } from "./security.js";
import type { Principal } from "./security.js";

const principal: Principal = {
  userId: "user-1",
  platformRole: "platform_auditor",
  tenantMemberships: [
    { tenantId: "tenant-a", role: "publisher", status: "active" },
    { tenantId: "tenant-b", role: "viewer", status: "suspended" },
  ],
};

test("platform auditor can read audit events but cannot change settings", () => {
  assert.equal(hasPlatformPermission(principal, "platform:audit:read"), true);
  assert.equal(hasPlatformPermission(principal, "platform:settings:write"), false);
});

test("tenant roles are evaluated only against active membership in requested tenant", () => {
  assert.equal(hasTenantPermission(principal, "tenant-a", "social:assets:write"), true);
  assert.equal(hasTenantPermission(principal, "tenant-a", "ads:write"), false);
  assert.equal(hasTenantPermission(principal, "tenant-b", "social:assets:read"), false);
  assert.throws(() => assertTenantAccess(principal, "tenant-b"), /TENANT_ACCESS_DENIED/);
  assert.throws(() => assertTenantAccess(principal, "tenant-c"), /TENANT_ACCESS_DENIED/);
});

test("opaque session tokens are high entropy and stored as one-way hashes", () => {
  const token = newOpaqueToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
});

test("audit event has timestamp and does not accept request secrets as a field", () => {
  const event = createAuditEvent({ actorUserId: "u1", action: "tenant.member.invited", targetType: "membership", outcome: "success", correlationId: "c1" });
  assert.ok(event.occurredAt instanceof Date);
  assert.equal("accessToken" in event, false);
});

test("audit events are HMAC signed and tampering is detected", () => {
  process.env.AUDIT_SIGNING_KEY = "test-audit-signing-key-with-adequate-entropy";
  const event = createAuditEvent({ actorUserId: "u1", action: "tenant.member.invited", targetType: "membership", outcome: "success", correlationId: "c1" });
  assert.equal(verifyAuditEvent(event), true);
  assert.equal(verifyAuditEvent({ ...event, action: "tenant.member.deleted" }), false);
  assert.equal(verifyAuditEvent(event, "a-different-signing-key"), false);
});

test("versioned audit key ring signs with the active key and verifies historical key IDs", () => {
  const oldKey = "test-audit-signing-key-with-adequate-entropy";
  const newKey = Buffer.alloc(32, 7).toString("hex");
  delete process.env.AUDIT_SIGNING_KEYRING;
  delete process.env.AUDIT_SIGNING_ACTIVE_KEY_ID;
  process.env.AUDIT_SIGNING_KEY = oldKey;
  const legacyEvent = createAuditEvent({ actorUserId: "u1", action: "legacy.audit", targetType: "test", outcome: "success", correlationId: "legacy-1" });
  process.env.AUDIT_SIGNING_KEYRING = JSON.stringify({ legacy: Buffer.from(oldKey).toString("hex"), "audit-2026": newKey });
  process.env.AUDIT_SIGNING_ACTIVE_KEY_ID = "audit-2026";
  const event = createAuditEvent({ actorUserId: "u1", action: "versioned.audit", targetType: "test", outcome: "success", correlationId: "versioned-1" });
  assert.equal((event.integrity as { algorithm: string }).algorithm, "HMAC-SHA256-v2");
  assert.equal((event.integrity as { keyId: string }).keyId, "audit-2026");
  assert.equal(verifyAuditEvent(event), true);
  assert.equal(verifyAuditEvent(legacyEvent), true);
  assert.equal(verifyAuditEvent({ ...event, integrity: { ...(event.integrity as object), keyId: "legacy" } }), false);
  assert.equal(verifyAuditEvent({ ...event, action: "tampered.audit" }), false);
  const manifest = signAuditExport([event as unknown as Record<string, unknown>], new Date().toISOString());
  assert.equal(manifest.integrity.algorithm, "HMAC-SHA256-v2");
  assert.equal("keyId" in manifest.integrity ? manifest.integrity.keyId : null, "audit-2026");
  assert.equal(verifyAuditExportManifest(manifest as unknown as Record<string, unknown>, [event as unknown as Record<string, unknown>]), true);
  assert.equal(verifyAuditExportManifest({ ...manifest, count: 99 } as unknown as Record<string, unknown>, [event as unknown as Record<string, unknown>]), false);
  delete process.env.AUDIT_SIGNING_KEYRING;
  delete process.env.AUDIT_SIGNING_ACTIVE_KEY_ID;
});


test("audit event metadata redacts credential-like fields before signing", () => {
  process.env.AUDIT_SIGNING_KEY = "test-audit-signing-key-with-adequate-entropy";
  delete process.env.AUDIT_SIGNING_KEYRING;
  delete process.env.AUDIT_SIGNING_ACTIVE_KEY_ID;
  const event = createAuditEvent({
    actorUserId: "u1",
    action: "tenant.member.updated",
    targetType: "membership",
    outcome: "success",
    correlationId: "redaction-1",
    metadata: { password: "never-store", accessToken: "never-store-this", note: "safe" },
  });
  assert.deepEqual(event.metadata, { password: "[REDACTED]", accessToken: "[REDACTED]", note: "safe" });
  assert.equal(verifyAuditEvent(event), true);
});
