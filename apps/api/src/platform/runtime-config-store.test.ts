import test from "node:test";
import assert from "node:assert/strict";
import { defaultPlatformRuntimeConfig, normalizeOriginList, normalizeVerifiedHttpsOrigin } from "./runtime-config-store.js";

test("accepts exact HTTPS origins for verified Vercel projects", () => {
  assert.equal(normalizeVerifiedHttpsOrigin("https://zurios.vercel.app"), "https://zurios.vercel.app");
  assert.equal(normalizeVerifiedHttpsOrigin("https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app"), "https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app");
});

test("rejects non-HTTPS, path-bearing and credential-bearing origins", () => {
  assert.throws(() => normalizeVerifiedHttpsOrigin("http://zurios.vercel.app"), /EXACT_HTTPS_ORIGIN/);
  assert.throws(() => normalizeVerifiedHttpsOrigin("https://zurios.vercel.app/admin"), /EXACT_HTTPS_ORIGIN/);
  assert.throws(() => normalizeVerifiedHttpsOrigin("https://user:pass@zurios.vercel.app"), /EXACT_HTTPS_ORIGIN/);
});

test("rejects domains that have not been verified in Vercel", () => {
  assert.throws(() => normalizeVerifiedHttpsOrigin("https://attacker.example"), /DOMAIN_NOT_VERIFIED/);
});

test("deduplicates approved browser origins", () => {
  assert.deepEqual(normalizeOriginList(["https://zurios.vercel.app", "https://zurios.vercel.app"]), ["https://zurios.vercel.app"]);
});

test("ships a safe non-secret bootstrap runtime configuration", () => {
  assert.equal(defaultPlatformRuntimeConfig.revision, 0);
  assert.equal(defaultPlatformRuntimeConfig.publicSettings.accessRequestsEnabled, undefined);
  assert.deepEqual(defaultPlatformRuntimeConfig.privateSettings, {});
});
