import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";

process.env.MFA_ENCRYPTION_KEY = "a".repeat(64);
const { createMfaEncryptionService, decryptMfaSecret, encryptMfaSecret, generateTotpSecret, generateTotpCode, verifyTotp, generateMfaRecoveryCodes, normalizeMfaRecoveryCode } = await import("./mfa.js");

test("TOTP secrets are random and encrypted at rest with versioned ciphertext", () => {
  const secret = generateTotpSecret();
  assert.notEqual(secret, generateTotpSecret());
  const encrypted = encryptMfaSecret(secret);
  assert.match(encrypted, /^v2\.legacy\./);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted), secret);
});

test("MFA key ring encrypts with active key and decrypts retained previous keys", () => {
  const oldKey = Buffer.alloc(32, 1);
  const newKey = Buffer.alloc(32, 2);
  const oldService = createMfaEncryptionService({ keys: { old: oldKey }, activeKeyId: "old", legacyKey: oldKey });
  const previousCiphertext = oldService.encrypt("totp-secret");
  const rotatingService = createMfaEncryptionService({ keys: { old: oldKey, current: newKey }, activeKeyId: "current", legacyKey: oldKey });
  const currentCiphertext = rotatingService.encrypt("new-secret");
  assert.match(currentCiphertext, /^v2\.current\./);
  assert.equal(rotatingService.decrypt(previousCiphertext), "totp-secret");
  assert.equal(rotatingService.decrypt(currentCiphertext), "new-secret");
  assert.throws(() => createMfaEncryptionService({ keys: { old: oldKey }, activeKeyId: "missing" }), /MFA_ACTIVE_ENCRYPTION_KEY_NOT_AVAILABLE/);
  assert.throws(() => createMfaEncryptionService({ keys: { old: oldKey }, activeKeyId: "old" }).decrypt("v2.unknown.a.b.c"), /MFA_ENCRYPTION_KEY_ID_NOT_AVAILABLE/);
});

test("legacy unversioned MFA ciphertext remains decryptable during migration", () => {
  const legacyKey = Buffer.alloc(32, 3);
  const iv = Buffer.alloc(12, 4);
  const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
  const encrypted = Buffer.concat([cipher.update("legacy-secret", "utf8"), cipher.final()]);
  const legacyPayload = [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
  const service = createMfaEncryptionService({ keys: { legacy: legacyKey, current: Buffer.alloc(32, 5) }, activeKeyId: "current", legacyKey });
  assert.equal(service.decrypt(legacyPayload), "legacy-secret");
  assert.throws(() => createMfaEncryptionService({ keys: { current: Buffer.alloc(32, 5) }, activeKeyId: "current" }).decrypt(legacyPayload), /MFA_LEGACY_ENCRYPTION_KEY_NOT_AVAILABLE/);
});

test("MFA ciphertext rejects tampering and malformed payloads", () => {
  const service = createMfaEncryptionService({ keys: { current: Buffer.alloc(32, 6) }, activeKeyId: "current" });
  const encrypted = service.encrypt("secret");
  const parts = encrypted.split(".");
  parts[4] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => service.decrypt(parts.join(".")));
  assert.throws(() => service.decrypt("not.a.valid.payload"));
  const keyIdTampered = encrypted.replace(".current.", ".current-alias.");
  assert.throws(() => createMfaEncryptionService({ keys: { current: Buffer.alloc(32, 6), "current-alias": Buffer.alloc(32, 6) }, activeKeyId: "current" }).decrypt(keyIdTampered));
});

test("TOTP verification rejects malformed and incorrect codes", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, "12345"), false);
  assert.equal(verifyTotp(secret, "abcdef"), false);
  const timestamp = 1_700_000_000_000;
  const code = generateTotpCode(secret, timestamp);
  assert.equal(verifyTotp(secret, code, timestamp), true);
  assert.equal(verifyTotp(secret, code, timestamp + 120_000), false);
});

test("MFA recovery codes are unique, normalized, and bounded", () => {
  const codes = generateMfaRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0]!, /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(normalizeMfaRecoveryCode(codes[0]!), codes[0]!.replace(/-/g, ""));
  assert.throws(() => generateMfaRecoveryCodes(0), /INVALID_RECOVERY_CODE_COUNT/);
});
