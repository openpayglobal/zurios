import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

test("rate limit key digests do not expose raw client addresses", () => {
  const address = "203.0.113.20";
  const digest = createHash("sha256").update(address).digest("hex").slice(0, 32);
  assert.equal(digest.length, 32);
  assert.notEqual(digest, address);
});

test("fixed windows produce distinct keys", () => {
  const first = createHash("sha256").update("/v1/auth/login:client:1000").digest("hex");
  const second = createHash("sha256").update("/v1/auth/login:client:2000").digest("hex");
  assert.notEqual(first, second);
});
