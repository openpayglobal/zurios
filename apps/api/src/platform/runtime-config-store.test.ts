import test from "node:test";
import assert from "node:assert/strict";
import { defaultPlatformRuntimeConfig, normalizeOriginList, normalizeVerifiedApiOrigin } from "./runtime-config-store.js";

test("accepts exact HTTPS origins for verified API projects", () => {
  assert.equal(normalizeVerifiedApiOrigin("https://zurios-api-openpayglobal-5300s-projects.vercel.app"), "https://zurios-api-openpayglobal-5300s-projects.vercel.app");
  assert.equal(normalizeVerifiedApiOrigin("https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app"), "https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app");
});

test("rejects non-HTTPS, path-bearing and credential-bearing API origins", () => {
  assert.throws(() => normalizeVerifiedApiOrigin("http://zurios-api-openpayglobal-5300s-projects.vercel.app"), /MUST_BE_EXACT_HTTPS_ORIGIN/);
  assert.throws(() => normalizeVerifiedApiOrigin("https://zurios-api-openpayglobal-5300s-projects.vercel.app/admin"), /MUST_BE_EXACT_HTTPS_ORIGIN/);
  assert.throws(() => normalizeVerifiedApiOrigin("https://user:pass@zurios-api-openpayglobal-5300s-projects.vercel.app"), /MUST_BE_EXACT_HTTPS_ORIGIN/);
});

test("rejects browser domains that are not verified Vercel frontend projects", () => {
  assert.throws(() => normalizeOriginList(["https://attacker.example"]), /DOMAIN_NOT_VERIFIED/);
});

test("deduplicates approved browser origins", () => {
  assert.deepEqual(normalizeOriginList(["https://zurios.vercel.app", "https://zurios.vercel.app"]), ["https://zurios.vercel.app"]);
});

test("ships a safe non-secret bootstrap runtime configuration", () => {
  assert.equal(defaultPlatformRuntimeConfig.revision, 0);
  assert.equal(defaultPlatformRuntimeConfig.publicSettings.accessRequestsEnabled, undefined);
  assert.deepEqual(defaultPlatformRuntimeConfig.privateSettings, {});
});
