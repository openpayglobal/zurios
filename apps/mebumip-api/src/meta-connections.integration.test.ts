import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "meta-connection-test-audit-signing-key-2026";
const mongoUri = process.env.MONGODB_TEST_URI;
const { ensureMeBuMIPIndexes } = await import("./database.js");
const { MetaTokenVault } = await import("./meta-token-vault.js");
const {
  createMetaConnection, getMetaAccessToken, getMetaConnection, listMetaConnections,
  revokeMetaConnection, rotateMetaConnectionEncryptionKey,
} = await import("./meta-connections.js");
const { verifyAuditChain } = await import("./security.js");

const oldKey = "11".repeat(32);
const newKey = "22".repeat(32);

test("Meta connection tokens are tenant-bound, encrypted, rotatable and revocable", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_connections_${process.pid}_${Date.now()}`);
  const vault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
  const token = "EAAG_meta_connection_secret_token";
  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    const created = await createMetaConnection(db, vault, {
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerUserId: "meta-user-1",
      providerUserName: "Meta User",
      accessToken: token,
      grantedScopes: ["pages_show_list", "instagram_basic", "pages_show_list"],
      expiresAt: new Date(Date.now() + 60 * 60_000),
      dataAccessExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      correlationId: "meta-connection-create",
    });
    assert.equal(created.status, "connected");
    assert.deepEqual(created.grantedScopes, ["instagram_basic", "pages_show_list"]);
    assert.equal(JSON.stringify(created).includes(token), false);
    const stored = await db.collection("metaConnections").findOne({ tenantId: "tenant-1", connectionId: created.connectionId });
    assert.ok(stored?.accessTokenCiphertext);
    assert.equal(String(stored?.accessTokenCiphertext).includes(token), false);
    assert.equal(await getMetaAccessToken(db, vault, "tenant-1", created.connectionId), token);
    await assert.rejects(() => getMetaAccessToken(db, vault, "tenant-2", created.connectionId), /META_CONNECTION_NOT_FOUND/);
    assert.equal((await listMetaConnections(db, "tenant-1")).length, 1);
    assert.equal((await listMetaConnections(db, "tenant-2")).length, 0);
    await assert.rejects(() => createMetaConnection(db, vault, {
      tenantId: "tenant-1", actorUserId: "user-1", providerUserId: "meta-user-1",
      accessToken: "EAAG_duplicate_token", grantedScopes: [], correlationId: "meta-duplicate",
    }), /META_CONNECTION_ALREADY_EXISTS/);

    const newVault = new MetaTokenVault({ keyring: { "meta-old": oldKey, "meta-new": newKey }, activeKeyId: "meta-new" });
    assert.equal(await rotateMetaConnectionEncryptionKey(db, newVault, "tenant-1", created.connectionId, "user-1", "meta-key-rotation"), true);
    assert.equal(await getMetaAccessToken(db, newVault, "tenant-1", created.connectionId), token);
    await assert.rejects(() => getMetaAccessToken(db, vault, "tenant-1", created.connectionId), /META_TOKEN_DECRYPTION_KEY_UNAVAILABLE/);
    assert.equal(await rotateMetaConnectionEncryptionKey(db, newVault, "tenant-1", created.connectionId, "user-1", "meta-key-rotation-noop"), false);

    await revokeMetaConnection(db, "tenant-1", created.connectionId, "user-1", "meta-connection-revoke");
    const revoked = await getMetaConnection(db, "tenant-1", created.connectionId);
    assert.equal(revoked.status, "revoked");
    assert.equal(await db.collection("metaConnections").countDocuments({ connectionId: created.connectionId, accessTokenCiphertext: null }), 1);
    await assert.rejects(() => getMetaAccessToken(db, newVault, "tenant-1", created.connectionId), /META_CONNECTION_NOT_FOUND/);
    await assert.rejects(() => revokeMetaConnection(db, "tenant-1", created.connectionId, "user-1", "meta-connection-revoke-again"), /META_CONNECTION_NOT_FOUND/);
    assert.equal((await verifyAuditChain(db)).valid, true);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("rejects already-expired Meta access and data-access expiries", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_connection_expiry_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await ensureMeBuMIPIndexes(db);
    const vault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
    const base = { tenantId: "tenant-expiry", actorUserId: "user-expiry", providerUserId: "meta-expiry", accessToken: "EAAG_expiry_token", grantedScopes: [], correlationId: "meta-expiry" };
    await assert.rejects(() => createMetaConnection(db, vault, { ...base, expiresAt: new Date(Date.now() - 1_000) }), /META_CONNECTION_EXPIRES_AT_INVALID/);
    await assert.rejects(() => createMetaConnection(db, vault, { ...base, dataAccessExpiresAt: new Date(Date.now() - 1_000) }), /META_CONNECTION_DATA_ACCESS_EXPIRES_AT_INVALID/);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
