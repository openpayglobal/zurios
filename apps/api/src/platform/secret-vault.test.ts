import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { MAC_SECRET_IDS_BY_SERVICE, openSecretWithDataKey, sealSecretWithDataKey } from "./secret-vault.js";

test("MAC secret envelope encrypts and decrypts with AES-256-GCM and context binding", () => {
  const key = randomBytes(32);
  const wrapped = randomBytes(96);
  const context = { secretId: "resend-api-key", version: 3 };
  const envelope = sealSecretWithDataKey("secret-value", key, wrapped, "arn:aws:kms:eu-west-1:123456789012:key/example", context);
  assert.equal(openSecretWithDataKey(envelope, key, context), "secret-value");
  assert.throws(() => openSecretWithDataKey(envelope, key, { ...context, version: 4 }));
  assert.throws(() => openSecretWithDataKey({ ...envelope, ciphertext: Buffer.from("tampered").toString("base64") }, key, context));
});

test("MAC secret envelope rejects non-256-bit data keys", () => {
  assert.throws(() => sealSecretWithDataKey("x", randomBytes(16), randomBytes(32), "key", { secretId: "x", version: 1 }), /DATA_KEY_INVALID/);
});

test("MAC workload secret delivery uses explicit least-privilege secret ID allowlists", () => {
  assert.deepEqual(MAC_SECRET_IDS_BY_SERVICE["zurios-api"], [
    "zuri-os-jwt-secret",
    "zuri-os-mfa-encryption-key",
    "zuri-os-mfa-encryption-keyring",
    "zuri-os-mfa-encryption-active-key-id",
  ]);
  assert.deepEqual(MAC_SECRET_IDS_BY_SERVICE["zuri-mebumip-api"], [
    "resend-api-key",
    "mail-from",
    "mebumip-mfa-encryption-key",
    "mfa-encryption-keyring",
    "mfa-encryption-active-key-id",
    "mebumip-audit-signing-key",
    "audit-signing-keyring",
    "audit-signing-active-key-id",
  ]);
  assert.equal(MAC_SECRET_IDS_BY_SERVICE["zurios-api"].includes("resend-api-key" as never), false);
  assert.equal(MAC_SECRET_IDS_BY_SERVICE["zuri-mebumip-api"].includes("zuri-os-jwt-secret" as never), false);
});
