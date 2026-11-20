import test from "node:test";
import assert from "node:assert/strict";

process.env.MFA_ENCRYPTION_KEY = "a".repeat(64);
const { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, generateTotpCode, verifyTotp, generateMfaRecoveryCodes, normalizeMfaRecoveryCode } = await import("./mfa.js");

test("TOTP secrets are random and encrypted at rest", () => {
  const secret = generateTotpSecret();
  assert.notEqual(secret, generateTotpSecret());
  const encrypted = encryptMfaSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted), secret);
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
