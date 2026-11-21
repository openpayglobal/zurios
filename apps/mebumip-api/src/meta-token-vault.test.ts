import test from "node:test";
import assert from "node:assert/strict";
import { MetaTokenVault } from "./meta-token-vault.js";

const oldKey = "11".repeat(32);
const newKey = "22".repeat(32);
const context = { tenantId: "tenant-001", connectionId: "connection-001" };

test("encrypts Meta tokens with AES-256-GCM and binds ciphertext to tenant and connection", () => {
  const vault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
  const token = "EAAG_secret_provider_access_token";
  const envelope = vault.encrypt(token, context);
  assert.equal(envelope.startsWith("v1.meta-old."), true);
  assert.equal(envelope.includes(token), false);
  assert.equal(vault.decrypt(envelope, context), token);
  assert.throws(() => vault.decrypt(envelope, { ...context, tenantId: "tenant-002" }), /META_TOKEN_DECRYPTION_FAILED/);
  assert.throws(() => vault.decrypt(envelope, { ...context, connectionId: "connection-002" }), /META_TOKEN_DECRYPTION_FAILED/);
});

test("rotates old token envelopes to the active key without losing decryptability", () => {
  const oldVault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
  const token = "EAAG_rotation_test_token";
  const oldEnvelope = oldVault.encrypt(token, context);
  const rotatedVault = new MetaTokenVault({ keyring: { "meta-old": oldKey, "meta-2026-11": newKey }, activeKeyId: "meta-2026-11" });
  const rotated = rotatedVault.rotate(oldEnvelope, context);
  assert.equal(rotated.rotated, true);
  assert.equal(rotatedVault.keyId(rotated.envelope), "meta-2026-11");
  assert.equal(rotatedVault.decrypt(rotated.envelope, context), token);
  assert.deepEqual(rotatedVault.rotate(rotated.envelope, context), { envelope: rotated.envelope, rotated: false });
});

test("rejects malformed envelopes, unknown keys, invalid key rings and tampered ciphertext", () => {
  const vault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
  assert.throws(() => vault.decrypt("plain-text", context), /META_TOKEN_ENVELOPE_INVALID/);
  assert.throws(() => new MetaTokenVault({ keyring: { bad: "short" }, activeKeyId: "bad" }), /META_TOKEN_KEYRING_ENTRY_INVALID/);
  assert.throws(() => new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "missing" }), /META_TOKEN_ACTIVE_KEY_ID_INVALID/);
  const envelope = vault.encrypt("EAAG_tamper_test_token", context);
  const parts = envelope.split(".");
  parts[4] = (parts[4] ?? "") + "A";
  assert.throws(() => vault.decrypt(parts.join("."), context), /META_TOKEN_DECRYPTION_FAILED|META_TOKEN_ENVELOPE_INVALID/);
  assert.throws(() => vault.rotate(parts.join("."), context), /META_TOKEN_DECRYPTION_FAILED|META_TOKEN_ENVELOPE_INVALID/);
  const unknownKey = envelope.replace("meta-old", "meta-missing");
  assert.throws(() => vault.decrypt(unknownKey, context), /META_TOKEN_DECRYPTION_KEY_UNAVAILABLE/);
});

test("rejects empty or oversized token plaintext and invalid tenant context", () => {
  const vault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
  assert.throws(() => vault.encrypt("", context), /META_TOKEN_PLAINTEXT_INVALID/);
  assert.throws(() => vault.encrypt("EAAG_valid_token", { tenantId: "", connectionId: "connection" }), /META_TOKEN_CONTEXT_INVALID/);
});
