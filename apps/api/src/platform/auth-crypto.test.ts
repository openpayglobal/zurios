import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {hashPassword,verifyPassword,generateTotpSecret,totpCode,verifyTotpCode,encryptMfaSecret,decryptMfaSecret,generateRecoveryCodes,hashRecoveryCode} from "./auth-crypto.js";
test("password hashing uses a one-way Argon2id verifier",async()=>{
 const hash=await hashPassword("A-long-unique-password-2026!");
 assert.notEqual(hash,"A-long-unique-password-2026!");
 assert.equal(await verifyPassword("A-long-unique-password-2026!",hash),true);
 assert.equal(await verifyPassword("incorrect-password",hash),false);
 await assert.rejects(()=>hashPassword("short"),/PASSWORD_POLICY_VIOLATION/);
});
test("TOTP verifies current time step and rejects malformed codes",()=>{
 const secret=generateTotpSecret(),now=1_800_000_000_000,step=Math.floor(now/30_000),code=totpCode(secret,step);
 assert.equal(verifyTotpCode(secret,code,now),step);
 assert.equal(verifyTotpCode(secret,"123",now),null);
 assert.equal(verifyTotpCode(secret,code,now,0),step);
});
test("MFA secret encryption authenticates ciphertext",()=>{
 const secret=generateTotpSecret(),key=randomBytes(32).toString("base64"),encrypted=encryptMfaSecret(secret,key);
 assert.equal(decryptMfaSecret(encrypted,key),secret);
 assert.throws(()=>decryptMfaSecret(encrypted,randomBytes(32).toString("base64")));
});
test("recovery codes are high entropy and stored as one-way hashes",()=>{
 const codes=generateRecoveryCodes();
 assert.equal(codes.length,10);
 assert.equal(new Set(codes).size,10);
 assert.notEqual(hashRecoveryCode(codes[0]!),codes[0]);
 assert.equal(hashRecoveryCode(codes[0]!),hashRecoveryCode(codes[0]!.toLowerCase()));
});
