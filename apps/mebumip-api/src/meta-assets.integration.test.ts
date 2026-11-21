import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { MetaTokenVault } from "./meta-token-vault.js";
import { MetaGraphClient } from "./meta-graph-client.js";
import { createMetaConnection, revokeMetaConnection } from "./meta-connections.js";
import { getMetaPageAccessToken, discoverMetaPages, listMetaPageAssets, rotateMetaPageAssetTokenEnvelopes } from "./meta-assets.js";
import { verifyAuditChain } from "./security.js";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "meta-assets-test-audit-signing-key-2026";
const mongoUri = process.env.MONGODB_TEST_URI;
const { ensureMeBuMIPIndexes } = await import("./database.js");

const oldKey = "11".repeat(32);
const newKey = "22".repeat(32);

test("Meta Page discovery paginates safely, encrypts Page tokens and reconciles removed assets", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_assets_${process.pid}_${Date.now()}`);
  const vault = new MetaTokenVault({ keyring: { "meta-old": oldKey }, activeKeyId: "meta-old" });
  let discoveryMode: "two-pages" | "one-page" = "two-pages";
  let calls = 0;
  const graph = new MetaGraphClient({
    version: "v27.0",
    appSecret: "meta-assets-test-app-secret-01234567890123456789",
    requireAppSecretProof: true,
    maxRetries: 0,
    fetchImpl: async (input, init) => {
      calls += 1;
      const url = new URL(String(input));
      assert.equal(url.hostname, "graph.facebook.com");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer EAAG_meta_user_access_token");
      assert.equal(url.searchParams.has("access_token"), false);
      assert.equal(url.searchParams.has("appsecret_proof"), true);
      if (discoveryMode === "one-page") {
        return new Response(JSON.stringify({ data: [{
          id: "111111",
          name: "Northwind Page",
          access_token: "EAAG_page_token_111",
          tasks: ["ANALYZE", "CREATE_CONTENT"],
        }] }), { status: 200, headers: { "facebook-api-version": "v27.0" } });
      }
      if (url.searchParams.get("after") === "page-2") {
        assert.equal(url.searchParams.has("access_token"), false, "pagination must strip embedded credentials");
        return new Response(JSON.stringify({ data: [{
          id: "333333",
          name: "Contoso Page",
          access_token: "EAAG_page_token_333",
          tasks: ["ADVERTISE"],
        }] }), { status: 200, headers: { "facebook-api-version": "v27.0" } });
      }
      return new Response(JSON.stringify({
        data: [{
          id: "111111",
          name: "Northwind Page",
          access_token: "EAAG_page_token_111",
          tasks: ["ANALYZE", "CREATE_CONTENT"],
          instagram_business_account: { id: "222222", username: "northwind.ig" },
        }],
        paging: { next: "https://graph.facebook.com/v27.0/me/accounts?after=page-2&access_token=provider-secret" },
      }), { status: 200, headers: { "facebook-api-version": "v27.0" } });
    },
  });

  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    const connection = await createMetaConnection(db, vault, {
      tenantId: "tenant-assets-1",
      actorUserId: "user-assets-1",
      providerUserId: "meta-user-assets-1",
      accessToken: "EAAG_meta_user_access_token",
      grantedScopes: ["pages_show_list", "pages_read_engagement", "instagram_basic"],
      correlationId: "meta-assets-connection-create",
    });

    const first = await discoverMetaPages(db, vault, graph, {
      tenantId: "tenant-assets-1",
      connectionId: connection.connectionId,
      actorUserId: "user-assets-1",
      correlationId: "meta-assets-discovery-1",
    });
    assert.equal(first.discovered, 2);
    assert.equal(first.instagramLinked, 1);
    assert.equal(first.items.some((item) => item.providerAssetId === "111111" && item.instagramBusinessAccount?.id === "222222"), true);
    assert.equal(JSON.stringify(first.items).includes("EAAG_page_token"), false);
    assert.equal(calls, 2);

    const storedPages = await db.collection("metaAssets").find({ tenantId: "tenant-assets-1", connectionId: connection.connectionId }).toArray();
    assert.equal(storedPages.length, 2);
    assert.equal(storedPages.some((page) => String(page.pageAccessTokenCiphertext).includes("EAAG_page_token")), false);
    assert.equal(await getMetaPageAccessToken(db, vault, "tenant-assets-1", connection.connectionId, "111111"), "EAAG_page_token_111");
    await assert.rejects(() => getMetaPageAccessToken(db, vault, "tenant-assets-other", connection.connectionId, "111111"), /META_CONNECTION_NOT_FOUND/);

    const rotatedVault = new MetaTokenVault({
      keyring: { "meta-old": oldKey, "meta-new": newKey },
      activeKeyId: "meta-new",
    });
    const rotation = await rotateMetaPageAssetTokenEnvelopes(db, rotatedVault, {
      tenantId: "tenant-assets-1",
      connectionId: connection.connectionId,
      actorUserId: "user-assets-1",
      correlationId: "meta-assets-key-rotation",
    });
    assert.equal(rotation.rotated, 2);
    const rotatedStored = await db.collection("metaAssets").findOne({ tenantId: "tenant-assets-1", connectionId: connection.connectionId, providerAssetId: "111111" });
    assert.equal(rotatedVault.keyId(String(rotatedStored?.pageAccessTokenCiphertext)), "meta-new");
    assert.equal(await getMetaPageAccessToken(db, rotatedVault, "tenant-assets-1", connection.connectionId, "111111"), "EAAG_page_token_111");

    discoveryMode = "one-page";
    const second = await discoverMetaPages(db, rotatedVault, graph, {
      tenantId: "tenant-assets-1",
      connectionId: connection.connectionId,
      actorUserId: "user-assets-1",
      correlationId: "meta-assets-discovery-2",
    });
    assert.equal(second.discovered, 1);
    const reconciled = await listMetaPageAssets(db, "tenant-assets-1", connection.connectionId);
    assert.equal(reconciled.length, 2);
    const retained = reconciled.find((item) => item.providerAssetId === "111111");
    assert.equal(retained?.instagramBusinessAccount, undefined, "a removed Instagram link must not remain stale");
    const removed = reconciled.find((item) => item.providerAssetId === "333333");
    assert.equal(removed?.status, "unavailable");
    const removedStored = await db.collection("metaAssets").findOne({ tenantId: "tenant-assets-1", connectionId: connection.connectionId, providerAssetId: "333333" });
    assert.equal(removedStored?.pageAccessTokenCiphertext, null);
    await assert.rejects(() => getMetaPageAccessToken(db, vault, "tenant-assets-1", connection.connectionId, "333333"), /META_ASSET_NOT_FOUND/);

    await revokeMetaConnection(db, "tenant-assets-1", connection.connectionId, "user-assets-1", "meta-assets-connection-revoke", "not_attempted");
    const afterDisconnect = await listMetaPageAssets(db, "tenant-assets-1", connection.connectionId);
    assert.equal(afterDisconnect.every((item) => item.status === "unavailable"), true);
    const remainingStored = await db.collection("metaAssets").find({ tenantId: "tenant-assets-1", connectionId: connection.connectionId }).toArray();
    assert.equal(remainingStored.every((item) => item.pageAccessTokenCiphertext === null), true);
    assert.equal((await verifyAuditChain(db)).valid, true);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
