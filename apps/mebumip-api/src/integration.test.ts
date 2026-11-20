import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("MongoDB-backed auth, invitation lifecycle and tenant isolation", { skip: !process.env.MONGODB_URI }, async (t) => {
  process.env.NODE_ENV = "test";
  process.env.PLATFORM_BOOTSTRAP_TOKEN = "mebumip-integration-bootstrap-token-2026";
  process.env.MFA_ENCRYPTION_KEY = "b".repeat(64);
  process.env.AUDIT_SIGNING_KEY = "mebumip-integration-audit-signing-key";

  const [{ default: Fastify }, { MongoClient, ObjectId }, { ensureMeBuMIPIndexes }, { registerAuthRoutes }, { registerTenantMemberRoutes }, { registerAdminRoutes }, { registerDatabaseRateLimit }, { generateTotpCode }, { verifyAuditEvent }] = await Promise.all([
    import("fastify"), import("mongodb"), import("./database.js"), import("./auth.js"),
    import("./tenant-members.js"), import("./admin.js"), import("./rate-limit.js"), import("./mfa.js"), import("./security.js"),
  ]);
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db("mebumip_integration_" + randomUUID().replaceAll("-", ""));
  await ensureMeBuMIPIndexes(db);
  const app = Fastify({ logger: false });
  registerDatabaseRateLimit(app, db);
  registerAuthRoutes(app, db);
  registerTenantMemberRoutes(app, db);
  registerAdminRoutes(app, db);
  await app.ready();
  t.after(async () => { await app.close(); await db.dropDatabase(); await client.close(); });

  const bootstrap = await app.inject({ method: "POST", url: "/v1/platform/bootstrap", payload: {
    bootstrapToken: process.env.PLATFORM_BOOTSTRAP_TOKEN, email: "owner@example.test",
    password: "Integration-Owner-Password-2026!", displayName: "Integration Owner",
    companyName: "Blockchain Innovations LTD", tenantSlug: "blockchain-innovations",
  } });
  assert.equal(bootstrap.statusCode, 201);
  const tenant = await db.collection("tenants").findOne({ slug: "blockchain-innovations" });
  assert.ok(tenant);

  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "owner@example.test", password: "Integration-Owner-Password-2026!" } });
  assert.equal(login.statusCode, 200);
  const token = login.json().accessToken as string;
  const headers = { authorization: "Bearer " + token };
  const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().tenantMemberships[0].tenantId, String(tenant._id));

  const setup = await app.inject({ method: "POST", url: "/v1/auth/mfa/setup", headers, payload: { currentPassword: "Integration-Owner-Password-2026!" } });
  assert.equal(setup.statusCode, 200);
  const enabled = await app.inject({ method: "POST", url: "/v1/auth/mfa/enable", headers, payload: { code: generateTotpCode(setup.json().secret) } });
  assert.equal(enabled.statusCode, 200);
  const recoveryCode = enabled.json().recoveryCodes[0] as string;
  const stepUp = await app.inject({ method: "POST", url: "/v1/auth/step-up", headers, payload: { recoveryCode } });
  assert.equal(stepUp.statusCode, 200);
  const replay = await app.inject({ method: "POST", url: "/v1/auth/step-up", headers, payload: { recoveryCode } });
  assert.equal(replay.statusCode, 403);

  const invitation = await app.inject({ method: "POST", url: "/v1/tenants/" + String(tenant._id) + "/invitations", headers, payload: { email: "member@example.test", role: "viewer" } });
  assert.equal(invitation.statusCode, 201);
  const invitationToken = invitation.json().invitationToken as string;
  const registered = await app.inject({ method: "POST", url: "/v1/auth/register", payload: { token: invitationToken, email: "member@example.test", password: "Integration-Member-Password-2026!", displayName: "Invited Member" } });
  assert.equal(registered.statusCode, 201);
  const replayInvite = await app.inject({ method: "POST", url: "/v1/auth/register", payload: { token: invitationToken, email: "member@example.test", password: "Integration-Member-Password-2026!", displayName: "Invited Member" } });
  assert.equal(replayInvite.statusCode, 404);

  const foreignTenant = await db.collection("tenants").insertOne({ name: "Foreign Tenant", slug: "foreign-tenant", status: "active", createdAt: new Date() });
  const isolation = await app.inject({ method: "GET", url: "/v1/tenants/" + String(foreignTenant.insertedId) + "/members", headers });
  assert.equal(isolation.statusCode, 403);

  const auditEvents = await db.collection("auditEvents").find({}).toArray();
  assert.ok(auditEvents.length >= 4);
  assert.ok(auditEvents.every((event) => verifyAuditEvent(event as Record<string, unknown>)));
  assert.equal(await db.collection("tenantInvitations").countDocuments({ acceptedAt: { $exists: false } }), 0);
});
