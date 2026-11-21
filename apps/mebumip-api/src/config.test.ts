import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./config.js";

const dedicatedMetaKey = "ab".repeat(32);
const validMetaEnvironment = {
  NODE_ENV: "test",
  META_APP_ID: "123456789012345",
  META_APP_SECRET: "app-secret-value-that-is-at-least-32-characters",
  META_REDIRECT_URI: "https://example.test/v1/meta/oauth/callback",
  META_GRAPH_API_VERSION: "v27.0",
  META_TOKEN_ENCRYPTION_KEYRING: JSON.stringify({ "meta-2026": dedicatedMetaKey }),
  META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "meta-2026",
};

test("Meta configuration remains optional until an app is provisioned", () => {
  assert.equal(parseConfig({ NODE_ENV: "test" }).success, true);
});

test("validates explicit Graph version and dedicated provider-token key ring when Meta is configured", () => {
  assert.equal(parseConfig(validMetaEnvironment).success, true);
  assert.equal(parseConfig({ ...validMetaEnvironment, META_GRAPH_API_VERSION: "latest" }).success, false);
  assert.equal(parseConfig({ ...validMetaEnvironment, META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "missing" }).success, false);
});

test("requires an OAuth-compatible session cookie policy when Meta is configured", () => {
  assert.equal(parseConfig({ ...validMetaEnvironment, SESSION_COOKIE_SAME_SITE: "Strict" }).success, false);
  assert.equal(parseConfig({ ...validMetaEnvironment, SESSION_COOKIE_SAME_SITE: "Lax" }).success, true);
});

test("requires app secret, HTTPS redirect and token vault when a Meta app ID is set", () => {
  assert.equal(parseConfig({ NODE_ENV: "test", META_APP_ID: "123456789012345" }).success, false);
  assert.equal(parseConfig({ ...validMetaEnvironment, META_REDIRECT_URI: "http://example.test/callback" }).success, false);
  assert.equal(parseConfig({ ...validMetaEnvironment, META_REDIRECT_URI: "http://localhost:4100/v1/meta/oauth/callback" }).success, true);
});

test("rejects reusing MFA encryption material for Meta provider tokens", () => {
  const result = parseConfig({ ...validMetaEnvironment, MFA_ENCRYPTION_KEY: dedicatedMetaKey });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues.some((issue) => issue.path.includes("META_TOKEN_ENCRYPTION_KEYRING")), true);
});

test("rejects app secrets and webhook tokens without an app ID", () => {
  assert.equal(parseConfig({ NODE_ENV: "test", META_APP_SECRET: "x".repeat(40) }).success, false);
  assert.equal(parseConfig({ NODE_ENV: "test", META_WEBHOOK_VERIFY_TOKEN: "x".repeat(40) }).success, false);
});
