import test from "node:test";
import assert from "node:assert/strict";
import { assertTenantAccess, createAuditEvent, verifyAuditEvent, hasPlatformPermission, hasTenantPermission, hashToken, newOpaqueToken } from "./security.js";
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
