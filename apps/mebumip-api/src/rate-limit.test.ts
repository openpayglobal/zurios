import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimitKey } from "./rate-limit.js";

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
