import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMacRuntimeConfigHeaders,
  validateMacRuntimeConfig,
  validateMacRuntimeConfigUrl,
} from "./runtime-config-client.js";

test("MAC runtime config requests carry workload identity and Vercel trusted-source proof", () => {
  const token = "short-lived-vercel-oidc-token";
  assert.deepEqual(buildMacRuntimeConfigHeaders(token), {
    authorization: `Bearer ${token}`,
    "x-vercel-trusted-oidc-idp-token": token,
    accept: "application/json",
  });
});

test("MAC runtime config destination is pinned to the approved HTTPS control-plane endpoint", () => {
  const approved = "https://zurios-api-openpayglobal-5300s-projects.vercel.app/platform/internal/runtime-config";
  assert.equal(validateMacRuntimeConfigUrl(approved), approved);
  for (const value of [
    "http://zurios-api-openpayglobal-5300s-projects.vercel.app/platform/internal/runtime-config",
    "https://attacker.example/platform/internal/runtime-config",
    "https://zurios-api-openpayglobal-5300s-projects.vercel.app.evil.example/platform/internal/runtime-config",
    "https://user:pass@zurios-api-openpayglobal-5300s-projects.vercel.app/platform/internal/runtime-config",
    "https://zurios-api-openpayglobal-5300s-projects.vercel.app:8443/platform/internal/runtime-config",
    "https://zurios-api-openpayglobal-5300s-projects.vercel.app/other",
    approved + "?redirect=https://attacker.example",
    approved + "#fragment",
  ]) {
    assert.throws(() => validateMacRuntimeConfigUrl(value), /MAC_RUNTIME_CONFIG_URL_INVALID/);
  }
});

test("MAC runtime config bearer headers reject empty or header-injection tokens", () => {
  assert.throws(() => buildMacRuntimeConfigHeaders(""), /MAC_RUNTIME_CONFIG_TOKEN_INVALID/);
  assert.throws(() => buildMacRuntimeConfigHeaders("token" + String.fromCharCode(13, 10) + "Injected: yes"), /MAC_RUNTIME_CONFIG_TOKEN_INVALID/);
});

const validConfig = () => ({
  revision: 7,
  service: "zuri-mebumip-api",
  apiOrigin: "https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app",
  allowedOrigins: [
    "https://zurios.vercel.app",
    "https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app",
  ],
  secrets: { "mail-from": "noreply@example.com" },
  secretAccess: "enabled",
});

test("MAC runtime config accepts a complete valid HTTPS snapshot", () => {
  const parsed = validateMacRuntimeConfig(validConfig());
  assert.equal(parsed.revision, 7);
  assert.equal(parsed.service, "zuri-mebumip-api");
  assert.equal(parsed.secrets["mail-from"], "noreply@example.com");
});

test("MAC runtime config rejects unsafe origins and malformed revisions", () => {
  for (const patch of [
    { apiOrigin: "http://api.example.com" },
    { apiOrigin: "https://api.example.com/path" },
    { allowedOrigins: ["https://good.example.com", "http://bad.example.com"] },
    { allowedOrigins: ["https://good.example.com", "https://good.example.com"] },
    { revision: -1 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { service: "zurios-api" },
  ]) {
    assert.throws(() => validateMacRuntimeConfig({ ...validConfig(), ...patch }), /MAC_RUNTIME_CONFIG_INVALID/);
  }
});

test("MAC runtime config rejects unknown secret IDs and non-string secret values", () => {
  assert.throws(() => validateMacRuntimeConfig({
    ...validConfig(),
    secrets: { "unapproved-secret": "value" },
  }), /MAC_RUNTIME_CONFIG_INVALID/);
  assert.throws(() => validateMacRuntimeConfig({
    ...validConfig(),
    secrets: { "mail-from": 42 },
  }), /MAC_RUNTIME_CONFIG_INVALID/);
});

test("blocked secret delivery cannot carry secret values", () => {
  assert.doesNotThrow(() => validateMacRuntimeConfig({
    ...validConfig(),
    secrets: {},
    secretAccess: "blocked_until_encryption_kms_is_configured",
  }));
  assert.throws(() => validateMacRuntimeConfig({
    ...validConfig(),
    secretAccess: "blocked_until_encryption_kms_is_configured",
  }), /MAC_RUNTIME_CONFIG_INVALID/);
  assert.throws(() => validateMacRuntimeConfig({
    ...validConfig(),
    secretAccess: "unexpected-state",
  }), /MAC_RUNTIME_CONFIG_INVALID/);
});
