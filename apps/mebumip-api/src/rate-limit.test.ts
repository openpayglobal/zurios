import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimitKey, rateLimitPolicyForPath } from "./rate-limit.js";

test("rate limit keys are opaque and do not expose raw client addresses", () => {
  const address = "203.0.113.20";
  const key = createRateLimitKey(address, "/v1/auth/login", 1_700_000_000_000);
  assert.equal(key.length, 64);
  assert.equal(key.includes(address), false);
});

test("rate limit keys isolate route, client and fixed time window", () => {
  const first = createRateLimitKey("client-a", "/v1/auth/login", 1000);
  assert.notEqual(first, createRateLimitKey("client-b", "/v1/auth/login", 1000));
  assert.notEqual(first, createRateLimitKey("client-a", "/v1/auth/step-up", 1000));
  assert.notEqual(first, createRateLimitKey("client-a", "/v1/auth/login", 2000));
});

test("credential and MFA recovery routes use stricter per-IP windows", () => {
  const mfaReset = rateLimitPolicyForPath("/v1/auth/mfa/reset");
  assert.equal(mfaReset?.limit, 8);
  assert.equal(mfaReset?.windowMs, 5 * 60_000);
  const passwordChange = rateLimitPolicyForPath("/v1/auth/password/change");
  assert.equal(passwordChange?.limit, 8);
  assert.equal(passwordChange?.windowMs, 15 * 60_000);
});

test("Meta OAuth initiation and callback use dedicated anti-abuse windows", () => {
  const start = rateLimitPolicyForPath("/v1/tenants/:tenantId/meta/oauth/start");
  assert.equal(start?.limit, 8);
  assert.equal(start?.windowMs, 15 * 60_000);
  const callback = rateLimitPolicyForPath("/v1/meta/oauth/callback");
  assert.equal(callback?.limit, 20);
  assert.equal(callback?.windowMs, 15 * 60_000);
});
