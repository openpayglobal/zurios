import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { MetaOAuthStateService } from "./meta-oauth-state.js";
import { ensureMeBuMIPIndexes } from "./database.js";

const mongoUri = process.env.MONGODB_TEST_URI;

test("Meta OAuth state is hashed, tenant/session-bound and consumed once", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_oauth_state_${process.pid}_${Date.now()}`);
  const context = {
    tenantId: "tenant-001",
    userId: "user-001",
    sessionId: "session-001",
    redirectUri: "https://app.example.test/v1/meta/oauth/callback",
  };
  try {
    await client.connect();
    await ensureMeBuMIPIndexes(db);
    const service = new MetaOAuthStateService(db);
    const created = await service.create(context);
    assert.equal(created.state.length, 43);
    const hash = createHash("sha256").update(created.state).digest("hex");
    const stored = await db.collection("metaOAuthStates").findOne({ stateHash: hash });
    assert.ok(stored);
    assert.equal(stored.stateHash === created.state, false);
    assert.equal(stored.usedAt, undefined);

    const concurrent = await Promise.all([
      service.consume(created.state, context),
      service.consume(created.state, context),
    ]);
    assert.equal(concurrent.filter(Boolean).length, 1);
    const consumed = concurrent.find(Boolean);
    assert.equal(consumed?.tenantId, context.tenantId);
    assert.equal(consumed?.userId, context.userId);
    assert.equal(consumed?.sessionId, context.sessionId);
    assert.equal(consumed?.redirectUri, context.redirectUri);
    assert.ok(consumed?.usedAt instanceof Date);
    assert.equal(await service.consume(created.state, context), null);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("wrong tenant, user or session cannot consume an OAuth state", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_oauth_binding_${process.pid}_${Date.now()}`);
  const context = {
    tenantId: "tenant-002",
    userId: "user-002",
    sessionId: "session-002",
    redirectUri: "https://app.example.test/v1/meta/oauth/callback",
  };
  try {
    await client.connect();
    await ensureMeBuMIPIndexes(db);
    const service = new MetaOAuthStateService(db);
    const created = await service.create(context);
    assert.equal(await service.consume(created.state, { ...context, tenantId: "tenant-attacker" }), null);
    assert.equal(await service.consume(created.state, { ...context, userId: "user-attacker" }), null);
    assert.equal(await service.consume(created.state, { ...context, sessionId: "session-attacker" }), null);
    assert.ok(await service.consume(created.state, context));
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("expired OAuth states and unsafe redirect URIs are rejected", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_oauth_expiry_${process.pid}_${Date.now()}`);
  const context = {
    tenantId: "tenant-003",
    userId: "user-003",
    sessionId: "session-003",
    redirectUri: "https://app.example.test/v1/meta/oauth/callback",
  };
  let now = new Date("2026-11-21T00:00:00.000Z");
  try {
    await client.connect();
    await ensureMeBuMIPIndexes(db);
    const service = new MetaOAuthStateService(db, { ttlMs: 60_000, now: () => now });
    const created = await service.create(context);
    now = new Date(now.getTime() + 60_001);
    assert.equal(await service.consume(created.state, context), null);
    await assert.rejects(() => service.create({ ...context, redirectUri: "http://app.example.test/callback" }), /META_OAUTH_REDIRECT_URI_INVALID/);
    await assert.rejects(() => service.create({ ...context, redirectUri: "https://user:pass@app.example.test/callback" }), /META_OAUTH_REDIRECT_URI_INVALID/);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
