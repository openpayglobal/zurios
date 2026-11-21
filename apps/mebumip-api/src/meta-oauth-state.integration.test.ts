import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "meta-oauth-state-test-audit-signing-key-2026";
const mongoUri = process.env.MONGODB_TEST_URI;
const { ensureMeBuMIPIndexes } = await import("./database.js");
const { MetaOAuthStateService } = await import("./meta-oauth-state.js");
const { verifyAuditChain } = await import("./security.js");

test("Meta OAuth state is hashed, tenant/session-bound, single-use and audited", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_oauth_state_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    let now = new Date("2026-11-21T00:00:00.000Z");
    const redirectUri = "https://app.example.test/v1/meta/oauth/callback";
    const service = new MetaOAuthStateService(db, { redirectUri, ttlMs: 60_000, now: () => now });
    const context = { tenantId: "tenant-001", userId: "user-001", sessionId: "session-001", redirectUri };
    const created = await service.create(context, "oauth-create-1");
    assert.equal(created.state.length, 43);
    const hash = createHash("sha256").update(created.state).digest("hex");
    const stored = await db.collection("metaOAuthStates").findOne({ stateHash: hash });
    assert.ok(stored);
    assert.equal(JSON.stringify(stored).includes(created.state), false);
    assert.equal(stored?.usedAt, undefined);

    assert.equal(await service.consume(created.state, { tenantId: "tenant-002", userId: context.userId, sessionId: context.sessionId }, "oauth-wrong-tenant"), null);
    assert.equal(await service.consume(created.state, { tenantId: context.tenantId, userId: context.userId, sessionId: "session-other" }, "oauth-wrong-session"), null);
    const consumed = await service.consume(created.state, context, "oauth-consume-1");
    assert.equal(consumed?.redirectUri, redirectUri);
    assert.equal(await service.consume(created.state, context, "oauth-replay"), null);

    const concurrent = await service.create(context, "oauth-create-2");
    const results = await Promise.all([
      service.consume(concurrent.state, context, "oauth-concurrent-a"),
      service.consume(concurrent.state, context, "oauth-concurrent-b"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);

    const expiring = await service.create(context, "oauth-create-expiring");
    now = new Date(now.getTime() + 60_001);
    assert.equal(await service.consume(expiring.state, context, "oauth-expired"), null);
    await assert.rejects(() => service.create({ ...context, redirectUri: "https://attacker.test/callback" }, "oauth-bad-redirect"), /META_OAUTH_REDIRECT_URI_MISMATCH/);
    assert.throws(() => new MetaOAuthStateService(db, { redirectUri: "http://example.test/callback" }), /META_OAUTH_REDIRECT_URI_INVALID/);
    assert.throws(() => new MetaOAuthStateService(db, { redirectUri: "http://localhost:4100/meta/callback" }), /META_OAUTH_REDIRECT_URI_INVALID/);
    assert.throws(() => new MetaOAuthStateService(db, { redirectUri: "ftp://localhost:4100/meta/callback", allowInsecureLocalhost: true }), /META_OAUTH_REDIRECT_URI_INVALID/);
    assert.doesNotThrow(() => new MetaOAuthStateService(db, { redirectUri: "http://localhost:4100/meta/callback", allowInsecureLocalhost: true }));
    const pending = await service.create(context, "oauth-pending-context");
    assert.deepEqual(await service.getPendingContext(pending.state), { tenantId: context.tenantId, userId: context.userId, sessionId: context.sessionId, redirectUri });
    assert.equal(await service.getPendingContext("invalid-state"), null);
    assert.equal((await verifyAuditChain(db)).valid, true);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("wrong user cannot consume a Meta OAuth state", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_oauth_user_binding_${process.pid}_${Date.now()}`);
  const context = { tenantId: "tenant-002", userId: "user-002", sessionId: "session-002", redirectUri: "https://app.example.test/v1/meta/oauth/callback" };
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    const service = new MetaOAuthStateService(db, { redirectUri: context.redirectUri });
    const created = await service.create(context, "oauth-create-user");
    assert.equal(await service.consume(created.state, { ...context, userId: "user-attacker" }, "oauth-wrong-user"), null);
    assert.ok(await service.consume(created.state, context, "oauth-correct-user"));
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
