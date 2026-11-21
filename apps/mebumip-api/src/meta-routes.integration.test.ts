import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient, ObjectId } from "mongodb";
import { newOpaqueToken, hashToken, verifyAuditChain } from "./security.js";
import { MetaTokenVault } from "./meta-token-vault.js";
import { createMetaConnection } from "./meta-connections.js";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "meta-route-test-audit-signing-key-2026";
process.env.META_APP_ID = "123456789012345";
process.env.META_APP_SECRET = "meta-route-test-app-secret-01234567890123456789";
process.env.META_REDIRECT_URI = "https://api.example.test/v1/meta/oauth/callback";
process.env.META_GRAPH_API_VERSION = "v27.0";
process.env.META_TOKEN_ENCRYPTION_KEYRING = JSON.stringify({ "meta-test": "aa".repeat(32) });
process.env.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID = "meta-test";

const mongoUri = process.env.MONGODB_TEST_URI;
const { ensureMeBuMIPIndexes } = await import("./database.js");
const { registerMetaRoutes } = await import("./meta-routes.js");

test("Meta OAuth routes enforce tenant/session/step-up, persist encrypted long-lived tokens and revoke", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_meta_routes_${process.pid}_${Date.now()}`);
  const app = Fastify();
  const tenantId = new ObjectId();
  const userId = new ObjectId();
  const otherUserId = new ObjectId();
  const sessionToken = newOpaqueToken();
  const otherSessionToken = newOpaqueToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60_000);
  let providerCalls = 0;
  let failRemoteRevoke = false;
  const scopes = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];
  const fetchImpl: typeof fetch = async (input, init) => {
    providerCalls += 1;
    const url = new URL(String(input));
    if (init?.method === "DELETE") {
      assert.equal(url.pathname, "/v27.0/meta-route-user-1/permissions");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer EAAG_long_lived_meta_route_token");
      if (failRemoteRevoke) {
        return new Response(JSON.stringify({ error: { message: "remote permission revoke denied", code: 190 } }), {
          status: 401, headers: { "facebook-api-version": "v27.0" },
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "facebook-api-version": "v27.0" } });
    }
    if (url.pathname.endsWith("/oauth/access_token")) {
      if (url.searchParams.get("grant_type") === "fb_exchange_token") {
        return new Response(JSON.stringify({ access_token: "EAAG_long_lived_meta_route_token", token_type: "bearer", expires_in: 5_184_000 }), {
          status: 200, headers: { "facebook-api-version": "v27.0" },
        });
      }
      return new Response(JSON.stringify({ access_token: "EAAG_short_lived_meta_route_token", token_type: "bearer", expires_in: 3600 }), {
        status: 200, headers: { "facebook-api-version": "v27.0" },
      });
    }
    assert.equal(url.pathname, "/v27.0/debug_token");
    assert.ok(new Headers(init?.headers).get("authorization")?.startsWith("Bearer 123456789012345|"));
    return new Response(JSON.stringify({ data: {
      app_id: "123456789012345",
      type: "USER",
      is_valid: true,
      user_id: "meta-route-user-1",
      scopes,
      expires_at: 1_900_000_000,
      data_access_expires_at: 1_900_000_000,
    } }), { status: 200, headers: { "facebook-api-version": "v27.0" } });
  };

  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    await db.collection("users").insertMany([
      { _id: userId, normalizedEmail: "meta-owner@example.test", displayName: "Meta Owner", status: "active" },
      { _id: otherUserId, normalizedEmail: "other@example.test", displayName: "Other User", status: "active" },
    ]);
    await db.collection("memberships").insertOne({
      tenantId: String(tenantId), userId: String(userId), role: "tenant_owner", status: "active",
    });
    await db.collection("sessions").insertMany([
      { userId: String(userId), tokenHash: hashToken(sessionToken), createdAt: now, expiresAt, stepUpUntil: expiresAt },
      { userId: String(otherUserId), tokenHash: hashToken(otherSessionToken), createdAt: now, expiresAt, stepUpUntil: expiresAt },
    ]);
    registerMetaRoutes(app, db, { fetchImpl });
    await app.ready();

    const ownerHeaders = { authorization: `Bearer ${sessionToken}` };
    const otherHeaders = { authorization: `Bearer ${otherSessionToken}` };
    const denied = await app.inject({ method: "GET", url: `/v1/tenants/${new ObjectId()}/meta/connections`, headers: ownerHeaders });
    assert.equal(denied.statusCode, 403);

    const listBefore = await app.inject({ method: "GET", url: `/v1/tenants/${tenantId}/meta/connections`, headers: ownerHeaders });
    assert.equal(listBefore.statusCode, 200);
    assert.deepEqual(listBefore.json(), { items: [] });

    const start = await app.inject({
      method: "POST",
      url: `/v1/tenants/${tenantId}/meta/oauth/start`,
      headers: ownerHeaders,
      payload: {},
    });
    assert.equal(start.statusCode, 200, start.body);
    const authorizationUrl = new URL(start.json().authorizationUrl);
    assert.equal(authorizationUrl.origin, "https://www.facebook.com");
    assert.equal(authorizationUrl.pathname, "/v27.0/dialog/oauth");
    const state = authorizationUrl.searchParams.get("state")!;
    const stateHash = (await import("node:crypto")).createHash("sha256").update(state).digest("hex");
    const storedState = await db.collection("metaOAuthStates").findOne({ stateHash });
    assert.ok(storedState);
    assert.equal(JSON.stringify(storedState).includes(state), false);
    assert.deepEqual(storedState?.requestedScopes, [...scopes].sort());

    const wrongSession = await app.inject({
      method: "GET",
      url: `/v1/meta/oauth/callback?state=${encodeURIComponent(state)}&code=AQAB_valid_meta_route_code_123456`,
      headers: otherHeaders,
    });
    assert.equal(wrongSession.statusCode, 403);

    const callback = await app.inject({
      method: "GET",
      url: `/v1/meta/oauth/callback?state=${encodeURIComponent(state)}&code=AQAB_valid_meta_route_code_123456`,
      headers: ownerHeaders,
    });
    assert.equal(callback.statusCode, 201, callback.body);
    assert.equal(callback.json().status, "connected");
    assert.equal(callback.body.includes("EAAG_"), false);
    assert.equal(providerCalls, 4);
    const connectionId = callback.json().connection.connectionId;
    const storedConnection = await db.collection("metaConnections").findOne({ tenantId: String(tenantId), connectionId });
    assert.ok(storedConnection?.accessTokenCiphertext);
    assert.equal(String(storedConnection?.accessTokenCiphertext).includes("EAAG_long_lived_meta_route_token"), false);

    const listAfter = await app.inject({ method: "GET", url: `/v1/tenants/${tenantId}/meta/connections`, headers: ownerHeaders });
    assert.equal(listAfter.statusCode, 200);
    assert.equal(listAfter.json().items.length, 1);
    assert.equal(JSON.stringify(listAfter.json()).includes("accessToken"), false);

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/tenants/${tenantId}/meta/connections/${connectionId}`,
      headers: ownerHeaders,
    });
    assert.equal(revoked.statusCode, 200, revoked.body);
    assert.deepEqual(revoked.json(), { status: "disconnected", remoteRevocation: "succeeded" });
    assert.equal(providerCalls, 5);
    const storedRevoked = await db.collection("metaConnections").findOne({ tenantId: String(tenantId), connectionId });
    assert.equal(storedRevoked?.status, "revoked");
    assert.equal(storedRevoked?.accessTokenCiphertext, null);
    assert.equal(storedRevoked?.revocationStatus, "succeeded");

    const testVault = new MetaTokenVault({ keyring: { "meta-test": "aa".repeat(32) }, activeKeyId: "meta-test" });
    const secondConnection = await createMetaConnection(db, testVault, {
      tenantId: String(tenantId),
      actorUserId: String(userId),
      providerUserId: "meta-route-user-2",
      accessToken: "EAAG_second_meta_route_token",
      grantedScopes: scopes,
      correlationId: "meta-route-second-create",
    });
    failRemoteRevoke = true;
    const remoteFailure = await app.inject({
      method: "DELETE",
      url: "/v1/tenants/" + tenantId + "/meta/connections/" + secondConnection.connectionId,
      headers: ownerHeaders,
    });
    assert.equal(remoteFailure.statusCode, 200, remoteFailure.body);
    assert.deepEqual(remoteFailure.json(), { status: "disconnected", remoteRevocation: "failed" });
    const locallyErased = await db.collection("metaConnections").findOne({ tenantId: String(tenantId), connectionId: secondConnection.connectionId });
    assert.equal(locallyErased?.status, "revoked");
    assert.equal(locallyErased?.accessTokenCiphertext, null);
    assert.equal(locallyErased?.revocationStatus, "failed");
    assert.equal((await verifyAuditChain(db)).valid, true);
  } finally {
    await app.close();
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
