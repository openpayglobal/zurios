import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { openSecretWithDataKey, sealSecretWithDataKey } from "./secret-vault.js";

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
