import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./config.js";

const base = {
  NODE_ENV: "test",
  META_APP_ID: "123456789",
  META_APP_SECRET: "test_meta_app_secret_0123456789x",
  META_REDIRECT_URI: "https://example.test/meta/callback",
  META_GRAPH_API_VERSION: "v27.0",
  META_TOKEN_ENCRYPTION_KEYRING: JSON.stringify({ "meta-2026": "22".repeat(32) }),
  META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "meta-2026",
};

test("accepts a complete explicit Meta app configuration", () => {
  assert.equal(parseConfig(base).success, true);
});

test("rejects malformed Meta app IDs and Graph API versions", () => {
  assert.equal(parseConfig({ ...base, META_APP_ID: "app-123" }).success, false);
  assert.equal(parseConfig({ ...base, META_GRAPH_API_VERSION: "27.0" }).success, false);
  assert.equal(parseConfig({ ...base, META_GRAPH_API_VERSION: "v27" }).success, false);
});

test("requires a dedicated token keyring and complete app credentials", () => {
  assert.equal(parseConfig({ ...base, META_TOKEN_ENCRYPTION_KEYRING: undefined }).success, false);
  assert.equal(parseConfig({ ...base, META_APP_SECRET: undefined }).success, false);
  assert.equal(parseConfig({ ...base, META_APP_ID: undefined, META_APP_SECRET: base.META_APP_SECRET }).success, false);
});

test("keeps marketing API version separate from Graph API version", () => {
  assert.equal(parseConfig({ ...base, META_MARKETING_API_VERSION: "v25.0" }).success, true);
  assert.equal(parseConfig({ ...base, META_MARKETING_API_VERSION: "v25" }).success, false);
});
