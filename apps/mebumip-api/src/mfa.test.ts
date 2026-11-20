import test from "node:test";
import assert from "node:assert/strict";

process.env.MFA_ENCRYPTION_KEY = "a".repeat(64);
const { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, verifyTotp } = await import("./mfa.js");

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
  assert.equal(verifyTotp(secret, "000000", 1_700_000_000_000), false);
});
