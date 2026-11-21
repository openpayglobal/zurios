import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type MetaTokenKeyRing = Record<string, string>;

export interface MetaTokenVaultOptions {
  keyring: MetaTokenKeyRing;
  activeKeyId: string;
}

export interface MetaTokenContext {
  tenantId: string;
  connectionId: string;
}

const ENVELOPE_VERSION = "v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const HEX_KEY_PATTERN = /^[a-fA-F0-9]{64}$/;

function associatedData(context: MetaTokenContext, keyId: string): Buffer {
  if (!context.tenantId.trim() || !context.connectionId.trim() || context.tenantId.length > 256 || context.connectionId.length > 256) {
    throw new Error("META_TOKEN_CONTEXT_INVALID");
  }
  return Buffer.from(JSON.stringify(["zuri-meta-token", ENVELOPE_VERSION, keyId, context.tenantId, context.connectionId]), "utf8");
}

export class MetaTokenVault {
  private readonly keys: Map<string, Buffer>;
  readonly activeKeyId: string;

  constructor(options: MetaTokenVaultOptions) {
    const entries = Object.entries(options.keyring);
    if (entries.length < 1 || entries.length > 20) throw new Error("META_TOKEN_KEYRING_SIZE_INVALID");
    this.keys = new Map();
    for (const [keyId, value] of entries) {
      if (!KEY_ID_PATTERN.test(keyId) || typeof value !== "string" || !HEX_KEY_PATTERN.test(value)) {
        throw new Error("META_TOKEN_KEYRING_ENTRY_INVALID");
      }
      this.keys.set(keyId, Buffer.from(value, "hex"));
    }
    if (!KEY_ID_PATTERN.test(options.activeKeyId) || options.activeKeyId === "legacy" || !this.keys.has(options.activeKeyId)) {
      throw new Error("META_TOKEN_ACTIVE_KEY_ID_INVALID");
    }
    this.activeKeyId = options.activeKeyId;
  }

  encrypt(token: string, context: MetaTokenContext): string {
    if (typeof token !== "string" || token.length < 8 || token.length > 16_384) throw new Error("META_TOKEN_PLAINTEXT_INVALID");
    const keyId = this.activeKeyId;
    const key = this.keys.get(keyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(associatedData(context, keyId));
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [ENVELOPE_VERSION, keyId, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(envelope: string, context: MetaTokenContext): string {
    if (typeof envelope !== "string" || envelope.length > 32_768) throw new Error("META_TOKEN_ENVELOPE_INVALID");
    const [version, keyId, ivEncoded, tagEncoded, ciphertextEncoded, extra] = envelope.split(".");
    if (version !== ENVELOPE_VERSION || !keyId || !ivEncoded || !tagEncoded || ciphertextEncoded === undefined || extra !== undefined ||
        !KEY_ID_PATTERN.test(keyId) || !/^[A-Za-z0-9_-]+$/.test(ivEncoded) || !/^[A-Za-z0-9_-]+$/.test(tagEncoded) ||
        !/^[A-Za-z0-9_-]+$/.test(ciphertextEncoded)) throw new Error("META_TOKEN_ENVELOPE_INVALID");
    const key = this.keys.get(keyId);
    if (!key) throw new Error("META_TOKEN_DECRYPTION_KEY_UNAVAILABLE");
    const iv = Buffer.from(ivEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw new Error("META_TOKEN_ENVELOPE_INVALID");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(associatedData(context, keyId));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("META_TOKEN_DECRYPTION_FAILED");
    }
  }

  rotate(envelope: string, context: MetaTokenContext): { envelope: string; rotated: boolean } {
    const keyId = this.keyId(envelope);
    if (keyId === this.activeKeyId) {
      this.decrypt(envelope, context);
      return { envelope, rotated: false };
    }
    return { envelope: this.encrypt(this.decrypt(envelope, context), context), rotated: true };
  }

  keyId(envelope: string): string {
    const [version, keyId] = envelope.split(".");
    if (version !== ENVELOPE_VERSION || !keyId || !KEY_ID_PATTERN.test(keyId)) throw new Error("META_TOKEN_ENVELOPE_INVALID");
    return keyId;
  }
}
