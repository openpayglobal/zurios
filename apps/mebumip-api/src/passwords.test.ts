import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./passwords.js";

test("password hashes are salted and verify only the original password", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
});

test("password policy rejects short values and malformed hashes safely", async () => {
  await assert.rejects(hashPassword("short"), /PASSWORD_LENGTH_INVALID/);
  assert.equal(await verifyPassword("anything", "not-a-valid-hash"), false);
});
