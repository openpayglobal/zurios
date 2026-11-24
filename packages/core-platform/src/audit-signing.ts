import { createHash, createPublicKey, verify as verifyCryptoSignature } from "node:crypto";
import { signMessage } from "@vercel/kms";
import type { AuditEventDocument } from "./types.js";

export const AUDIT_EVENT_KMS_ISSUER_ID = "55210f93-c052-45a5-aeb8-e083ed0d5dce";

export type AuditEventIntegrity = {
  algorithm: "RS256";
  issuerId: string;
  keyId: string;
  fingerprint: string;
  signature: string;
};

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (key === "_id" || key === "integrity") continue;
      result[key] = canonicalValue(source[key]);
    }
    return result;
  }
  return value;
}

export function auditEventSigningPayload(event: unknown): string {
  return JSON.stringify(canonicalValue(event));
}

/**
 * Production audit writes fail closed if the workload cannot obtain a KMS signature.
 * Local and Preview remain unsigned until a separately scoped non-production issuer exists.
 */
export async function signAuditEventDocument(
  event: AuditEventDocument,
): Promise<AuditEventIntegrity | undefined> {
  if (process.env.VERCEL_ENV !== "production") return undefined;
  const result = await signMessage({
    issuerId: AUDIT_EVENT_KMS_ISSUER_ID,
    message: auditEventSigningPayload(event),
  });
  if (result.algorithm !== "RS256" || !result.keyId || !result.fingerprint) {
    throw new Error("AUDIT_KMS_SIGNING_RESPONSE_INVALID");
  }
  return {
    algorithm: "RS256",
    issuerId: AUDIT_EVENT_KMS_ISSUER_ID,
    keyId: result.keyId,
    fingerprint: result.fingerprint,
    signature: Buffer.from(result.signature).toString("base64"),
  };
}

/** Verify a persisted production signature against the issuer's published JWKS. */
export async function verifyAuditEventSignature(
  event: AuditEventDocument & { integrity?: AuditEventIntegrity },
): Promise<boolean> {
  const integrity = event.integrity;
  if (
    !integrity ||
    integrity.algorithm !== "RS256" ||
    integrity.issuerId !== AUDIT_EVENT_KMS_ISSUER_ID ||
    !integrity.keyId ||
    !integrity.signature
  ) return false;

  try {
    const response = await fetch(
      `https://kms.vercel.com/${AUDIT_EVENT_KMS_ISSUER_ID}/jwks.json`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) },
    );
    if (!response.ok) return false;
    const jwks = await response.json() as { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };
    const jwk = jwks.keys?.find(key =>
      key.kid === integrity.keyId && key.kty === "RSA" &&
      key.alg === "RS256" && key.use === "sig"
    );
    if (!jwk) return false;
    const publicKey = createPublicKey({ key: jwk as never, format: "jwk" });
    const fingerprint = `SHA256:${createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("base64")}`;
    if (fingerprint !== integrity.fingerprint) return false;
    return verifyCryptoSignature(
      "RSA-SHA256",
      Buffer.from(auditEventSigningPayload(event), "utf8"),
      publicKey,
      Buffer.from(integrity.signature, "base64"),
    );
  } catch {
    return false;
  }
}
