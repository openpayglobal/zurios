import test from "node:test";
import assert from "node:assert/strict";
import { decodeProtectedHeader } from "jose";
import { signSessionAccessToken, verifySessionAccessToken } from "./session-token.js";
import type { AuthConfig } from "./auth-service.js";

test("non-production session access tokens retain strict HS256 compatibility", async () => {
  const previous = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  try {
    const config: AuthConfig = {
      issuer: "https://auth.zurios.test",
      audience: "zurios-api",
      jwtSecret: "test-only-session-signing-secret-at-least-32-bytes",
      accessTokenTtlSeconds: 300,
      sessionTtlSeconds: 3600,
      mfaEncryptionKey: "test-only-mfa-key",
    };
    const claims = {
      userId: "user_test",
      tenantId: "tenant_test",
      membershipId: "membership_test",
      sessionId: "session_test",
      permissions: ["platform.read"],
    };
    const token = await signSessionAccessToken(config, claims);
    assert.equal(decodeProtectedHeader(token).alg, "HS256");
    const verified = await verifySessionAccessToken(token, config);
    assert.equal(verified.payload.sub, claims.userId);
    assert.equal(verified.payload.tenantId, claims.tenantId);
    assert.equal(verified.payload.membershipId, claims.membershipId);
    assert.equal(verified.payload.sessionId, claims.sessionId);
    assert.deepEqual(verified.payload.permissions, claims.permissions);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
