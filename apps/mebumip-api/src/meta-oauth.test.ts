import test from "node:test";
import assert from "node:assert/strict";
import { MetaOAuthError, MetaOAuthService } from "./meta-oauth.js";

const options = {
  appId: "123456789012345",
  appSecret: "meta-app-secret-for-oauth-tests-0123456789",
  version: "v27.0",
  redirectUri: "https://app.example.test/v1/meta/oauth/callback",
};
const state = "state_token_012345678901234567890123456789";

test("builds versioned standard OAuth URL with explicit scopes and state", () => {
  const service = new MetaOAuthService(options);
  const url = new URL(service.buildAuthorizationUrl({ state, scopes: ["pages_show_list", "pages_manage_posts", "instagram_basic"] }));
  assert.equal(url.origin, "https://www.facebook.com");
  assert.equal(url.pathname, "/v27.0/dialog/oauth");
  assert.equal(url.searchParams.get("client_id"), options.appId);
  assert.equal(url.searchParams.get("redirect_uri"), options.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("scope"), "pages_show_list,pages_manage_posts,instagram_basic");
});

test("builds Business Login URL from Meta config and rejects caller-selected scopes", () => {
  const service = new MetaOAuthService({ ...options, loginConfigId: "business_config_2026" });
  const url = new URL(service.buildAuthorizationUrl({ state, mode: "business" }));
  assert.equal(url.pathname, "/v27.0/dialog/oauth");
  assert.equal(url.searchParams.get("config_id"), "business_config_2026");
  assert.equal(url.searchParams.has("scope"), false);
  assert.throws(() => service.buildAuthorizationUrl({ state, mode: "business", scopes: ["pages_show_list"] }), /SCOPES_ARE_CONFIGURED_IN_META/);
  assert.throws(() => new MetaOAuthService(options).buildAuthorizationUrl({ state, mode: "business" }), /META_LOGIN_CONFIG_ID_REQUIRED/);
});

test("rejects unapproved scopes and malformed OAuth state", () => {
  const service = new MetaOAuthService(options);
  assert.throws(() => service.buildAuthorizationUrl({ state, scopes: ["pages_show_list", "email"] as never }), /META_OAUTH_SCOPE_NOT_ALLOWED/);
  assert.throws(() => service.buildAuthorizationUrl({ state: "short", scopes: ["pages_show_list"] }), /META_OAUTH_STATE_INVALID/);
  assert.throws(() => service.buildAuthorizationUrl({ state, scopes: [] }), /META_OAUTH_SCOPES_REQUIRED/);
  assert.throws(() => service.buildAuthorizationUrl({ state, mode: "unexpected" as never, scopes: ["pages_show_list"] }), /META_OAUTH_MODE_INVALID/);
});

test("exchanges an authorization code using the pinned HTTPS token endpoint", async () => {
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const service = new MetaOAuthService({
    ...options,
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ access_token: "EAAG_short_lived_meta_token", token_type: "bearer", expires_in: 3600 }), { status: 200, headers: { "facebook-api-version": "v27.0" } });
    },
  });
  const result = await service.exchangeAuthorizationCode("AQAB_auth_code_value_123456789");
  const url = new URL(requestedUrl);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "graph.facebook.com");
  assert.equal(url.pathname, "/v27.0/oauth/access_token");
  assert.equal(url.searchParams.get("client_id"), options.appId);
  assert.equal(url.searchParams.get("client_secret"), options.appSecret);
  assert.equal(url.searchParams.get("redirect_uri"), options.redirectUri);
  assert.equal(url.searchParams.get("code"), "AQAB_auth_code_value_123456789");
  assert.equal(result.accessToken, "EAAG_short_lived_meta_token");
  assert.equal(result.expiresInSeconds, 3600);
  assert.equal(requestInit?.method, "GET");
  assert.equal(requestInit?.redirect, "error");
  assert.equal(requestInit?.credentials, "omit");
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(requestInit?.referrerPolicy, "no-referrer");
});

test("exchanges a short-lived token for a long-lived token without retries", async () => {
  let requestedUrl = "";
  let calls = 0;
  const service = new MetaOAuthService({
    ...options,
    fetchImpl: async (input) => {
      calls += 1;
      requestedUrl = String(input);
      return new Response(JSON.stringify({ access_token: "EAAG_long_lived_meta_token", token_type: "Bearer", expires_in: 5_184_000 }), { status: 200 });
    },
  });
  const result = await service.exchangeLongLivedToken("EAAG_short_lived_meta_token");
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("grant_type"), "fb_exchange_token");
  assert.equal(url.searchParams.get("fb_exchange_token"), "EAAG_short_lived_meta_token");
  assert.equal(result.expiresInSeconds, 5_184_000);
  assert.equal(calls, 1);
});

test("normalizes provider errors without returning token or secret details", async () => {
  const service = new MetaOAuthService({
    ...options,
    fetchImpl: async () => new Response(JSON.stringify({ error: { code: 190, error_subcode: 467, fbtrace_id: "trace-safe" } }), { status: 400 }),
  });
  await assert.rejects(
    () => service.exchangeAuthorizationCode("AQAB_auth_code_value_123456789"),
    (error: unknown) => error instanceof MetaOAuthError
      && error.status === 400
      && error.providerCode === 190
      && error.providerSubcode === 467
      && error.fbtraceId === "trace-safe"
      && !error.message.includes(options.appSecret),
  );
});

test("rejects unexpected OAuth token endpoint API versions and gates local HTTP redirects", async () => {
  const mismatch = new MetaOAuthService({
    ...options,
    fetchImpl: async () => new Response(JSON.stringify({ access_token: "EAAG_meta_token_value", token_type: "bearer" }), {
      status: 200,
      headers: { "facebook-api-version": "v26.0" },
    }),
  });
  await assert.rejects(() => mismatch.exchangeAuthorizationCode("AQAB_auth_code_value_123456789"), /unexpected API version/);
  assert.throws(() => new MetaOAuthService({ ...options, redirectUri: "http://localhost:4100/callback" }), /META_REDIRECT_URI_INVALID/);
  assert.doesNotThrow(() => new MetaOAuthService({ ...options, redirectUri: "http://localhost:4100/callback", allowInsecureLocalhost: true }));
});

test("rejects invalid configuration and token response shapes", async () => {
  assert.throws(() => new MetaOAuthService({ ...options, version: "27.0" }), /META_GRAPH_API_VERSION_INVALID/);
  assert.throws(() => new MetaOAuthService({ ...options, redirectUri: "http://app.example.test/callback" }), /META_REDIRECT_URI_INVALID/);
  const service = new MetaOAuthService({
    ...options,
    fetchImpl: async () => new Response(JSON.stringify({ access_token: "short", token_type: "bearer" }), { status: 200 }),
  });
  await assert.rejects(() => service.exchangeAuthorizationCode("AQAB_auth_code_value_123456789"), /invalid token/);
});
