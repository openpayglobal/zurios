import test from "node:test";
import assert from "node:assert/strict";
import { hasTenantPermission, assertTenantAccess, AuthorizationError, type Principal } from "./security.js";

const principal: Principal = {
  userId: "user-a",
  tenantMemberships: [{ tenantId: "tenant-a", role: "tenant_owner", status: "active" }],
};

test("tenant owner permissions are scoped to their active tenant", () => {
  assert.equal(hasTenantPermission(principal, "tenant-a", "tenant:members:write"), true);
  assert.equal(hasTenantPermission(principal, "tenant-b", "tenant:members:write"), false);
});

test("tenant access rejects a different tenant", () => {
  assert.throws(() => assertTenantAccess(principal, "tenant-b"), AuthorizationError);
});
