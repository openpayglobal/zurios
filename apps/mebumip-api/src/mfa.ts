import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(input: Buffer): string {
  let bits = 0, value = 0, output = "";
  for (const byte of input) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(input: string): Buffer {
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("INVALID_BASE32_SECRET");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
export function generateTotpSecret(): string { return base32Encode(randomBytes(20)); }

export function encryptMfaSecret(secret: string): string {
  if (!config.MFA_ENCRYPTION_KEY) throw new Error("MFA_ENCRYPTION_KEY_NOT_CONFIGURED");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(config.MFA_ENCRYPTION_KEY, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptMfaSecret(encoded: string): string {
  if (!config.MFA_ENCRYPTION_KEY) throw new Error("MFA_ENCRYPTION_KEY_NOT_CONFIGURED");
  const [ivText, tagText, bodyText] = encoded.split(".");
  if (!ivText || !tagText || !bodyText) throw new Error("INVALID_ENCRYPTED_MFA_SECRET");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.MFA_ENCRYPTION_KEY, "hex"), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bodyText, "base64url")), decipher.final()]).toString("utf8");
}
export function verifyTotp(secret: string, token: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(now / 30_000);
  for (let drift = -1; drift <= 1; drift++) {
    const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter + drift));
    const digest = createHmac("sha1", key).update(message).digest();
    const offset = digest[digest.length - 1]! & 15;
    const binary = ((digest[offset]! & 127) << 24) | ((digest[offset + 1]! & 255) << 16) | ((digest[offset + 2]! & 255) << 8) | (digest[offset + 3]! & 255);
    const expected = String(binary % 1_000_000).padStart(6, "0");
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return true;
  }
  return false;
}
