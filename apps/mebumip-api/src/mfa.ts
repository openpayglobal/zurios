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

export interface MfaEncryptionKeyRing {
  keys: Record<string, Buffer>;
  activeKeyId: string;
  legacyKey?: Buffer;
}

export function createMfaEncryptionService(keyRing: MfaEncryptionKeyRing) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyRing.activeKeyId) || !keyRing.keys[keyRing.activeKeyId]) {
    throw new Error("MFA_ACTIVE_ENCRYPTION_KEY_NOT_AVAILABLE");
  }
  for (const [keyId, key] of Object.entries(keyRing.keys)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || key.length !== 32) throw new Error("INVALID_MFA_ENCRYPTION_KEY_RING");
  }

  function encrypt(secret: string): string {
    const keyId = keyRing.activeKeyId;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyRing.keys[keyId]!, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return ["v2", keyId, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
  }

  function decrypt(encoded: string): string {
    const parts = encoded.split(".");
    let key: Buffer | undefined;
    let ivText: string | undefined;
    let tagText: string | undefined;
    let bodyText: string | undefined;

    if (parts.length === 5 && parts[0] === "v2") {
      const keyId = parts[1]!;
      key = keyRing.keys[keyId];
      if (!key) throw new Error("MFA_ENCRYPTION_KEY_ID_NOT_AVAILABLE");
      [, , ivText, tagText, bodyText] = parts;
    } else if (parts.length === 3) {
      // Legacy ciphertext used a single unversioned environment key.
      key = keyRing.legacyKey;
      [ivText, tagText, bodyText] = parts;
      if (!key) throw new Error("MFA_LEGACY_ENCRYPTION_KEY_NOT_AVAILABLE");
    } else {
      throw new Error("INVALID_ENCRYPTED_MFA_SECRET");
    }

    const iv = Buffer.from(ivText!, "base64url");
    const tag = Buffer.from(tagText!, "base64url");
    const body = Buffer.from(bodyText!, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || body.length === 0) throw new Error("INVALID_ENCRYPTED_MFA_SECRET");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  }

  return { encrypt, decrypt };
}

function configuredMfaEncryptionService() {
  const keys: Record<string, Buffer> = {};
  if (config.MFA_ENCRYPTION_KEYRING) {
    const parsed = JSON.parse(config.MFA_ENCRYPTION_KEYRING) as Record<string, string>;
    for (const [keyId, key] of Object.entries(parsed)) keys[keyId] = Buffer.from(key, "hex");
  }
  if (config.MFA_ENCRYPTION_KEY) keys.legacy = Buffer.from(config.MFA_ENCRYPTION_KEY, "hex");
  const activeKeyId = config.MFA_ENCRYPTION_ACTIVE_KEY_ID ?? (config.MFA_ENCRYPTION_KEY ? "legacy" : "");
  return createMfaEncryptionService({
    keys,
    activeKeyId,
    ...(keys.legacy ? { legacyKey: keys.legacy } : {}),
  });
}


export function getMfaEncryptionKeyId(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length === 5 && parts[0] === "v2" && /^[a-zA-Z0-9_-]{1,64}$/.test(parts[1] ?? "")) return parts[1]!;
  if (parts.length === 3) return "legacy-unversioned";
  throw new Error("INVALID_ENCRYPTED_MFA_SECRET");
}

export function getActiveMfaEncryptionKeyId(): string {
  return config.MFA_ENCRYPTION_ACTIVE_KEY_ID ?? (config.MFA_ENCRYPTION_KEY ? "legacy" : "");
}

export function encryptMfaSecret(secret: string): string {
  return configuredMfaEncryptionService().encrypt(secret);
}
export function decryptMfaSecret(encoded: string): string {
  return configuredMfaEncryptionService().decrypt(encoded);
}

export function generateTotpCode(secret: string, now = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(now / 30_000);
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24) | ((digest[offset + 1]! & 255) << 16) | ((digest[offset + 2]! & 255) << 8) | (digest[offset + 3]! & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
export function verifyTotp(secret: string, token: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  for (let drift = -1; drift <= 1; drift++) {
    const expected = generateTotpCode(secret, now + drift * 30_000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return true;
  }
  return false;
}

/** Generate one-time printable recovery codes. Persist only hashToken(code) values. */
export function generateMfaRecoveryCodes(count = 10): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("INVALID_RECOVERY_CODE_COUNT");
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return raw.match(/.{1,4}/g)!.join("-");
  });
}

export function normalizeMfaRecoveryCode(code: string): string {
  return code.replace(/-/g, "").trim().toUpperCase();
}
