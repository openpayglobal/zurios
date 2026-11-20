import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MongoClient, ObjectId } from "mongodb";
import { registerAuthRoutes } from "./auth.js";
import { registerTenantMemberRoutes } from "./tenant-members.js";
import { ensureMeBuMIPIndexes } from "./database.js";
import { hashToken, newOpaqueToken } from "./security.js";
import { normalizeMfaRecoveryCode } from "./mfa.js";
import { hashPassword } from "./passwords.js";

const mongoUri = process.env.MONGODB_TEST_URI;

test("MongoDB-backed invitation lifecycle is tenant-isolated, one-time, and audited", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const databaseName = `mebumip_integration_${process.pid}_${Date.now()}`;
  const db = client.db(databaseName);
  const app = Fastify({ logger: false });
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    registerAuthRoutes(app, db);
    registerTenantMemberRoutes(app, db);

    const ownerId = new ObjectId();
    const tenantA = new ObjectId();
    const tenantB = new ObjectId();
    const bearer = newOpaqueToken();
    const now = new Date();
    await db.collection("users").insertOne({
      _id: ownerId,
      normalizedEmail: "owner@example.test",
      displayName: "Tenant Owner",
      passwordHash: await hashPassword("owner-secure-password-123"),
      mfaEnabled: true,
      mfaRecoveryCodeHashes: [
        hashToken(normalizeMfaRecoveryCode("AAAA-BBBB-CCCC-DDDD")),
        hashToken(normalizeMfaRecoveryCode("EEEE-FFFF-1111-2222")),
      ],
      status: "active",
    });
    await db.collection("tenants").insertMany([
      { _id: tenantA, name: "Tenant A", slug: `tenant-a-${process.pid}`, status: "active" },
      { _id: tenantB, name: "Tenant B", slug: `tenant-b-${process.pid}`, status: "active" },
    ]);
    await db.collection("memberships").insertOne({
      tenantId: String(tenantA),
      userId: String(ownerId),
      role: "tenant_owner",
      status: "active",
    });
    await db.collection("sessions").insertOne({
      userId: String(ownerId),
      tokenHash: hashToken(bearer),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
      stepUpUntil: new Date(now.getTime() + 5 * 60_000),
    });

    const auth = { authorization: `Bearer ${bearer}` };
    const crossTenantRead = await app.inject({
      method: "GET",
      url: `/v1/tenants/${tenantB}/members`,
      headers: auth,
    });
    assert.equal(crossTenantRead.statusCode, 403);

    const invitationResponse = await app.inject({
      method: "POST",
      url: `/v1/tenants/${tenantA}/invitations`,
      headers: auth,
      payload: { email: "new-member@example.test", role: "viewer" },
    });
    assert.equal(invitationResponse.statusCode, 201);
    const invitation = invitationResponse.json() as { invitationToken: string; invitationId: string };
    assert.ok(invitation.invitationToken.length >= 40);

    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        token: invitation.invitationToken,
        email: "new-member@example.test",
        password: "a-secure-integration-password",
        displayName: "New Member",
      },
    });
    assert.equal(registration.statusCode, 201);
    const registered = registration.json() as { userId: string };
    const membership = await db.collection("memberships").findOne({
      tenantId: String(tenantA),
      userId: registered.userId,
      status: "active",
      role: "viewer",
    });
    assert.ok(membership);

    const replay = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        token: invitation.invitationToken,
        email: "new-member@example.test",
        password: "a-secure-integration-password",
        displayName: "New Member",
      },
    });
    assert.equal(replay.statusCode, 404);

    const audit = await db.collection("auditEvents").findOne({
      action: "tenant.invitation.created",
      tenantId: String(tenantA),
      outcome: "success",
    });
    assert.ok(audit);
    assert.equal(await db.collection("tenantInvitations").countDocuments({
      _id: new ObjectId(invitation.invitationId),
      acceptedAt: { $exists: true },
      acceptedBy: registered.userId,
    }), 1);
    const recoveryStepUp = await app.inject({
      method: "POST",
      url: "/v1/auth/step-up",
      headers: auth,
      payload: { recoveryCode: "AAAA-BBBB-CCCC-DDDD" },
    });
    assert.equal(recoveryStepUp.statusCode, 200);
    const recoveryReplay = await app.inject({
      method: "POST",
      url: "/v1/auth/step-up",
      headers: auth,
      payload: { recoveryCode: "AAAA-BBBB-CCCC-DDDD" },
    });
    assert.equal(recoveryReplay.statusCode, 403);

    const factorReset = await app.inject({
      method: "POST",
      url: "/v1/auth/mfa/reset",
      headers: auth,
      payload: { currentPassword: "owner-secure-password-123", recoveryCode: "EEEE-FFFF-1111-2222" },
    });
    assert.equal(factorReset.statusCode, 200);
    assert.equal((factorReset.json() as { sessionsRevoked: boolean }).sessionsRevoked, true);
    const resetUser = await db.collection("users").findOne({ _id: ownerId });
    assert.notEqual(resetUser?.mfaEnabled, true);
    assert.equal(Array.isArray(resetUser?.mfaRecoveryCodeHashes), false);
    const revokedSession = await db.collection("sessions").findOne({ tokenHash: hashToken(bearer) });
    assert.ok(revokedSession?.revokedAt instanceof Date);
  } finally {
    await app.close();
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
