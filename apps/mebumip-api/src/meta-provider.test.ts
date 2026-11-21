import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createMetaGraphClient, createMetaTokenVault, getMetaIntegrationReadiness } from "./meta-provider.js";

test("configured Meta apps require App Secret Proof on Graph API requests", async () => {
  const appSecret = "test_meta_app_secret_0123456789";
  const accessToken = "EAAG_meta_access_token_value";
  let requestUrl = "";
  const client = createMetaGraphClient(
    { META_APP_ID: "123456789", META_APP_SECRET: appSecret, META_GRAPH_API_VERSION: "v27.0" },
    { fetchImpl: async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ id: "me" }), { status: 200 });
    } },
  );
  await client.request("me", { accessToken });
  const url = new URL(requestUrl);
  assert.equal(url.searchParams.get("appsecret_proof"), createHmac("sha256", appSecret).update(accessToken).digest("hex"));
  assert.equal(url.searchParams.has("access_token"), false);
});

test("refuses an incomplete Meta app configuration and never silently disables required proof", () => {
  assert.throws(
    () => createMetaGraphClient({ META_APP_ID: "123456789", META_GRAPH_API_VERSION: "v27.0" }),
    /META_APP_SECRET_REQUIRED/,
  );
  assert.throws(
    () => createMetaGraphClient({ META_APP_SECRET: "test_meta_app_secret_0123456789", META_GRAPH_API_VERSION: "v27.0" }),
    /META_APP_CONFIGURATION_INCOMPLETE/,
  );
  assert.throws(
    () => createMetaGraphClient({ META_APP_ID: "123456789", META_APP_SECRET: "test_meta_app_secret_0123456789" }),
    /META_GRAPH_API_VERSION_REQUIRED/,
  );
});

test("builds the tenant-bound token vault only from a dedicated configured keyring", () => {
  const vault = createMetaTokenVault({
    META_TOKEN_ENCRYPTION_KEYRING: JSON.stringify({ "meta-2026": "22".repeat(32) }),
    META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "meta-2026",
  });
  const context = { tenantId: "tenant-001", connectionId: "connection-001" };
  const envelope = vault.encrypt("EAAG_meta_token_value", context);
  assert.equal(vault.decrypt(envelope, context), "EAAG_meta_token_value");
  assert.throws(() => createMetaTokenVault({ META_TOKEN_ENCRYPTION_KEYRING: JSON.stringify({ old: "22".repeat(32) }), META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "missing" }), /META_TOKEN_ACTIVE_KEY_ID_INVALID/);
  assert.throws(() => createMetaTokenVault({}), /META_TOKEN_VAULT_NOT_CONFIGURED/);
});

test("readiness diagnostics expose configuration presence without secret values", () => {
  const readiness = getMetaIntegrationReadiness({
    META_APP_ID: "123456789",
    META_APP_SECRET: "test_meta_app_secret_0123456789",
    META_REDIRECT_URI: "https://example.test/meta/callback",
    META_GRAPH_API_VERSION: "v27.0",
    META_TOKEN_ENCRYPTION_KEYRING: "{}",
    META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "meta-2026",
    META_WEBHOOK_VERIFY_TOKEN: "verification-token-value",
  });
  assert.equal(readiness.appConfigured, true);
  assert.equal(readiness.graphApiVersion, "v27.0");
  assert.equal(readiness.appSecretProofConfigured, true);
  assert.equal(readiness.tokenVaultConfigured, true);
  assert.equal(readiness.webhookVerificationConfigured, true);
  assert.equal(JSON.stringify(readiness).includes("test_meta_app_secret_0123456789"), false);
  assert.equal(JSON.stringify(readiness).includes("verification-token-value"), false);
});
