import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient } from "mongodb";

process.env.NODE_ENV = "test";
process.env.PLATFORM_BOOTSTRAP_TOKEN = "mebumip-integration-bootstrap-secret-2026";

const { registerAuthRoutes } = await import("./auth.js");
const { ensureMeBuMIPIndexes } = await import("./database.js");
const mongoUri = process.env.MONGODB_TEST_URI;

test("MongoDB-backed bootstrap is concurrency-safe and session lifecycle revokes and rotates credentials", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const databaseName = `mebumip_auth_lifecycle_${process.pid}_${Date.now()}`;
  const db = client.db(databaseName);
  const app = Fastify({ logger: false });
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    registerAuthRoutes(app, db);
    await app.ready();

    const bootstrapPayload = (email: string, slug: string) => ({
      bootstrapToken: process.env.PLATFORM_BOOTSTRAP_TOKEN,
      email,
      password: "owner-secure-password-123",
      displayName: "Platform Owner",
      companyName: "MeBuMIP Integration Tenant",
      tenantSlug: slug,
    });
    const [bootstrapA, bootstrapB] = await Promise.all([
      app.inject({ method: "POST", url: "/v1/platform/bootstrap", payload: bootstrapPayload("owner-a@example.test", `owner-a-${process.pid}`) }),
      app.inject({ method: "POST", url: "/v1/platform/bootstrap", payload: bootstrapPayload("owner-b@example.test", `owner-b-${process.pid}`) }),
    ]);
    const bootstrapResponses = [bootstrapA, bootstrapB];
    assert.equal(bootstrapResponses.filter((response) => response.statusCode === 201).length, 1);
    assert.equal(bootstrapResponses.filter((response) => response.statusCode === 409).length, 1);
    assert.equal(await db.collection("users").countDocuments({ platformRole: "platform_owner" }), 1);
    assert.equal(await db.collection("tenants").countDocuments({}), 1);
    assert.equal(await db.collection("memberships").countDocuments({ role: "tenant_owner", status: "active" }), 1);
    assert.equal((await db.collection<{ _id: string; status?: string }>("platformBootstrapLocks").findOne({ _id: "singleton" }))?.status, "completed");

    const winningEmail = bootstrapA.statusCode === 201 ? "owner-a@example.test" : "owner-b@example.test";
    const invalidBootstrap = await app.inject({
      method: "POST",
      url: "/v1/platform/bootstrap",
      payload: { ...bootstrapPayload("intruder@example.test", `intruder-${process.pid}`), bootstrapToken: "incorrect-bootstrap-secret-2026" },
    });
    assert.equal(invalidBootstrap.statusCode, 403);

    const invalidLogin = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { email: winningEmail, password: "incorrect-password" },
    });
    assert.equal(invalidLogin.statusCode, 401);

    const login = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { email: winningEmail, password: "owner-secure-password-123" },
    });
    assert.equal(login.statusCode, 200);
    const primaryToken = (login.json() as { accessToken: string }).accessToken;
    assert.ok(primaryToken.length >= 40);
    assert.ok(await db.collection("sessions").findOne({ tokenHash: hashToken(primaryToken) }));

    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${primaryToken}` } });
    assert.equal(me.statusCode, 200);
    const meBody = me.json() as { userId: string; platformRole: string };
    assert.equal(meBody.platformRole, "platform_owner");

    const secondLogin = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { email: winningEmail, password: "owner-secure-password-123" },
    });
    assert.equal(secondLogin.statusCode, 200);
    const secondToken = (secondLogin.json() as { accessToken: string }).accessToken;
    const sessions = await app.inject({ method: "GET", url: "/v1/auth/sessions", headers: { authorization: `Bearer ${primaryToken}` } });
    assert.equal(sessions.statusCode, 200);
    const sessionItems = (sessions.json() as { items: Array<{ id: string; current: boolean }> }).items;
    assert.equal(sessionItems.length, 2);
    assert.equal(sessionItems.filter((item) => item.current).length, 1);
    const secondarySession = sessionItems.find((item) => !item.current);
    assert.ok(secondarySession);

    const revoke = await app.inject({
      method: "DELETE", url: `/v1/auth/sessions/${secondarySession.id}`,
      headers: { authorization: `Bearer ${primaryToken}` },
    });
    assert.equal(revoke.statusCode, 204);
    assert.equal((await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${secondToken}` } })).statusCode, 401);

    const refreshResponses = await Promise.all([app.inject({ method: "POST", url: "/v1/auth/refresh", headers: { authorization: `Bearer ${primaryToken}` } }), app.inject({ method: "POST", url: "/v1/auth/refresh", headers: { authorization: `Bearer ${primaryToken}` } })]);
    assert.equal(refreshResponses.filter((response) => response.statusCode === 200).length, 1);
    assert.equal(refreshResponses.filter((response) => response.statusCode === 401).length, 1);
    const refresh = refreshResponses.find((response) => response.statusCode === 200)!;
    const rotatedToken = (refresh.json() as { accessToken: string }).accessToken;
    assert.notEqual(rotatedToken, primaryToken);
    assert.equal((await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${primaryToken}` } })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${rotatedToken}` } })).statusCode, 200);

    const parallelSessionLogin = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { email: winningEmail, password: "owner-secure-password-123" },
    });
    assert.equal(parallelSessionLogin.statusCode, 200);
    const parallelToken = (parallelSessionLogin.json() as { accessToken: string }).accessToken;
    const changePassword = await app.inject({
      method: "POST", url: "/v1/auth/password/change",
      headers: { authorization: `Bearer ${rotatedToken}` },
      payload: { currentPassword: "owner-secure-password-123", newPassword: "owner-new-secure-password-456" },
    });
    assert.equal(changePassword.statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${parallelToken}` } })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: winningEmail, password: "owner-secure-password-123" } })).statusCode, 401);

    const newPasswordLogin = await app.inject({
      method: "POST", url: "/v1/auth/login",
      payload: { email: winningEmail, password: "owner-new-secure-password-456" },
    });
    assert.equal(newPasswordLogin.statusCode, 200);
    const finalToken = (newPasswordLogin.json() as { accessToken: string }).accessToken;
    const logout = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { authorization: `Bearer ${finalToken}` } });
    assert.equal(logout.statusCode, 204);
    assert.equal((await app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: `Bearer ${finalToken}` } })).statusCode, 401);

    const auditActions = await db.collection("auditEvents").distinct("action");
    assert.ok(auditActions.includes("platform.bootstrap.completed"));
    assert.ok(auditActions.includes("platform.bootstrap.denied"));
    assert.ok(auditActions.includes("auth.login.denied"));
    assert.ok(auditActions.includes("auth.session.rotated"));
    assert.ok(auditActions.includes("auth.password.changed"));
  } finally {
    await app.close();
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
