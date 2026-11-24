import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { afterEach, test } from "node:test";
import { auditEventSigningPayload, verifyAuditEventSignature, type AuditEventIntegrity } from "./audit-signing.js";
import type { AuditEventDocument } from "./types.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("audit signing payload is canonical across object key order", () => {
  const left = { eventId: "evt", tenantId: "tenant", occurredAt: new Date("2026-01-01T00:00:00.000Z"), metadata: { b: 2, a: 1 } };
  const right = { metadata: { a: 1, b: 2 }, occurredAt: new Date("2026-01-01T00:00:00.000Z"), tenantId: "tenant", eventId: "evt" };
  assert.equal(auditEventSigningPayload(left), auditEventSigningPayload(right));
});

test("verifies RS256 audit signatures against the issuer JWKS and rejects tampering", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  globalThis.fetch = (async () => new Response(JSON.stringify({
    keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  const event: AuditEventDocument = {
    eventId: "evt_test", tenantId: "tenant_test", occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    actor: { userId: "user_test" }, action: "tenant.updated", resourceType: "tenant",
    resourceId: "tenant_test", outcome: "success", metadata: { changed: ["name"] },
  };
  const signature = cryptoSign("RSA-SHA256", Buffer.from(auditEventSigningPayload(event)), privateKey).toString("base64");
  const integrity: AuditEventIntegrity = {
    algorithm: "RS256", issuerId: "55210f93-c052-45a5-aeb8-e083ed0d5dce",
    keyId: "test-key", fingerprint: "test-fingerprint", signature,
  };
  assert.equal(await verifyAuditEventSignature({ ...event, integrity }), true);
  assert.equal(await verifyAuditEventSignature({ ...event, action: "tenant.deleted", integrity }), false);
});
