import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ObjectId, type Db, type Document } from "mongodb";
import { z } from "zod";
import { config } from "./config.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { createAuditEvent, hashToken, newOpaqueToken, PLATFORM_ROLES, TENANT_ROLES, type Principal, type PlatformRole, type TenantRole } from "./security.js";
import { decryptMfaSecret, encryptMfaSecret, generateMfaRecoveryCodes, generateTotpSecret, normalizeMfaRecoveryCode, verifyTotp } from "./mfa.js";

const bootstrapSchema = z.object({
  bootstrapToken: z.string().min(32),
  email: z.string().email().max(254),
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(2).max(100),
  companyName: z.string().trim().min(2).max(160),
  tenantSlug: z.string().trim().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

function safeSecretEqual(candidate: string, expected: string): boolean {
  const left = createHash("sha256").update(candidate).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function resolvePrincipal(db: Db, request: FastifyRequest): Promise<{ principal: Principal; sessionId: ObjectId; stepUpUntil?: Date } | null> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (token.length < 40 || token.length > 200) return null;
  const session = await db.collection("sessions").findOne({
    tokenHash: hashToken(token),
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (!session || typeof session.userId !== "string" || !ObjectId.isValid(session.userId)) return null;
  const user = await db.collection("users").findOne({ _id: new ObjectId(session.userId), status: "active" });
  if (!user) return null;
  const memberships = await db.collection("memberships").find({ userId: String(user._id), status: "active" }).toArray();
  const tenantMemberships = memberships.flatMap((membership) => {
    const tenantId = typeof membership.tenantId === "string" ? membership.tenantId : "";
    const role = membership.role as TenantRole;
    if (!tenantId || !TENANT_ROLES.includes(role)) return [];
    return [{ tenantId, role, status: "active" as const }];
  });
  const platformRole = PLATFORM_ROLES.includes(user.platformRole as PlatformRole) && user.platformAdminStatus !== "suspended" ? user.platformRole as PlatformRole : undefined;
  return {
    principal: {
      userId: String(user._id),
      ...(platformRole ? { platformRole } : {}),
      tenantMemberships,
    },
    sessionId: session._id as ObjectId,
    ...(session.stepUpUntil instanceof Date ? { stepUpUntil: session.stepUpUntil } : {}),
  };
}

async function writeAudit(db: Db, request: FastifyRequest, actorUserId: string, action: string, targetType: string, outcome: "success" | "denied" | "failure", targetId?: string) {
  await db.collection("auditEvents").insertOne(createAuditEvent({
    actorUserId, action, targetType, outcome, correlationId: request.id,
    ...(targetId ? { targetId } : {}),
  }) as Document);
}

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({ error: "UNAUTHORIZED" });
}

export function registerAuthRoutes(app: FastifyInstance, db: Db): void {
  app.post("/v1/platform/bootstrap", async (request, reply) => {
    const parsed = bootstrapSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    if (!config.PLATFORM_BOOTSTRAP_TOKEN || !safeSecretEqual(parsed.data.bootstrapToken, config.PLATFORM_BOOTSTRAP_TOKEN)) {
      await writeAudit(db, request, "anonymous", "platform.bootstrap.denied", "platform", "denied");
      return reply.code(403).send({ error: "BOOTSTRAP_NOT_AUTHORIZED" });
    }
    const owners = await db.collection("users").countDocuments({ platformRole: "platform_owner" });
    if (owners > 0) return reply.code(409).send({ error: "PLATFORM_ALREADY_BOOTSTRAPPED" });
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await db.collection("users").findOne({ normalizedEmail: email });
    if (existing) return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });

    const now = new Date();
    const passwordHash = await hashPassword(parsed.data.password);
    const userResult = await db.collection("users").insertOne({
      normalizedEmail: email,
      displayName: parsed.data.displayName,
      passwordHash,
      platformRole: "platform_owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    let tenantId: ObjectId | undefined;
    try {
      const tenantResult = await db.collection("tenants").insertOne({
        name: parsed.data.companyName,
        slug: parsed.data.tenantSlug,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      tenantId = tenantResult.insertedId;
      await db.collection("memberships").insertOne({
        tenantId: String(tenantId),
        userId: String(userResult.insertedId),
        role: "tenant_owner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await writeAudit(db, request, String(userResult.insertedId), "platform.bootstrap.completed", "platform", "success");
    } catch (error) {
      if (tenantId) {
        await db.collection("memberships").deleteOne({ tenantId: String(tenantId), userId: String(userResult.insertedId) });
        await db.collection("tenants").deleteOne({ _id: tenantId });
      }
      await db.collection("users").deleteOne({ _id: userResult.insertedId });
      throw error;
    }
    return reply.code(201).send({ status: "bootstrapped", userId: String(userResult.insertedId), note: "Owner created. Sign in to obtain a session." });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.collection("users").findOne({ normalizedEmail: email, status: "active" });
    const valid = user && typeof user.passwordHash === "string"
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;
    if (!user || !valid) {
      await writeAudit(db, request, "anonymous", "auth.login.denied", "session", "denied");
      return unauthorized(reply);
    }

    const token = newOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await db.collection("sessions").insertOne({
      userId: String(user._id),
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
    });
    await writeAudit(db, request, String(user._id), "auth.session.created", "session", "success");
    return reply.send({ accessToken: token, tokenType: "Bearer", expiresAt: expiresAt.toISOString(), user: { id: String(user._id), email, displayName: user.displayName, platformRole: user.platformRole ?? null } });
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = z.object({ token: z.string().min(40).max(200), email: z.string().email().max(254), password: z.string().min(12).max(256), displayName: z.string().trim().min(2).max(100) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const email = parsed.data.email.trim().toLowerCase();
    const invitation = await db.collection("tenantInvitations").findOne({ tokenHash: hashToken(parsed.data.token), email, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (!invitation) return reply.code(404).send({ error: "INVITATION_INVALID_OR_EMAIL_MISMATCH" });
    if (!TENANT_ROLES.includes(invitation.role as TenantRole) || invitation.role === "tenant_owner") return reply.code(400).send({ error: "INVITATION_ROLE_INVALID" });
    if (await db.collection("users").findOne({ normalizedEmail: email })) return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED_USE_ACCEPT" });
    const now = new Date();
    const userResult = await db.collection("users").insertOne({ normalizedEmail: email, displayName: parsed.data.displayName, passwordHash: await hashPassword(parsed.data.password), status: "active", createdAt: now, updatedAt: now });
    try {
      await db.collection("memberships").insertOne({ tenantId: invitation.tenantId, userId: String(userResult.insertedId), role: invitation.role, status: "active", createdAt: now, updatedAt: now });
      const accepted = await db.collection("tenantInvitations").updateOne({ _id: invitation._id, acceptedAt: { $exists: false }, revokedAt: { $exists: false } }, { $set: { acceptedAt: now, acceptedBy: String(userResult.insertedId) } });
      if (accepted.modifiedCount !== 1) throw new Error("INVITATION_ALREADY_USED");
      await writeAudit(db, request, String(userResult.insertedId), "tenant.invitation.registration.completed", "tenant_membership", "success", String(userResult.insertedId));
    } catch (error) {
      await db.collection("tenantInvitations").updateOne({ _id: invitation._id, acceptedBy: String(userResult.insertedId) }, { $unset: { acceptedAt: "", acceptedBy: "" } });
      await db.collection("memberships").deleteOne({ tenantId: invitation.tenantId, userId: String(userResult.insertedId) });
      await db.collection("users").deleteOne({ _id: userResult.insertedId });
      throw error;
    }
    return reply.code(201).send({ status: "registered", userId: String(userResult.insertedId), note: "Sign in to access the invited tenant." });
  });
  app.get("/v1/auth/me", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    return reply.send({ userId: resolved.principal.userId, platformRole: resolved.principal.platformRole ?? null, tenantMemberships: resolved.principal.tenantMemberships });
  });

  app.get("/v1/auth/sessions", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const sessions = await db.collection("sessions").find({ userId: resolved.principal.userId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { projection: { createdAt: 1, expiresAt: 1 } }).sort({ createdAt: -1 }).limit(50).toArray();
    return reply.send({ items: sessions.map((session) => ({ id: String(session._id), createdAt: session.createdAt, expiresAt: session.expiresAt, current: String(session._id) === String(resolved.sessionId) })) });
  });

  app.delete("/v1/auth/sessions/:sessionId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const { sessionId } = request.params as { sessionId: string };
    if (!ObjectId.isValid(sessionId)) return reply.code(400).send({ error: "INVALID_SESSION_ID" });
    const result = await db.collection("sessions").updateOne({ _id: new ObjectId(sessionId), userId: resolved.principal.userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokeReason: "user_revoked" } });
    if (!result.matchedCount) return reply.code(404).send({ error: "SESSION_NOT_FOUND" });
    await writeAudit(db, request, resolved.principal.userId, "auth.session.revoked", "session", "success", sessionId);
    return reply.code(204).send();
  });
  app.post("/v1/auth/refresh", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const token = newOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await db.collection("sessions").updateOne(
      { _id: resolved.sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, rotatedAt: now } },
    );
    await db.collection("sessions").insertOne({ userId: resolved.principal.userId, tokenHash: hashToken(token), createdAt: now, expiresAt });
    await writeAudit(db, request, resolved.principal.userId, "auth.session.rotated", "session", "success", String(resolved.sessionId));
    return reply.send({ accessToken: token, tokenType: "Bearer", expiresAt: expiresAt.toISOString() });
  });

  app.post("/v1/auth/password/change", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const parsed = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active" });
    if (!user || typeof user.passwordHash !== "string" || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(403).send({ error: "CURRENT_PASSWORD_INVALID" });
    }
    const now = new Date();
    await db.collection("users").updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(parsed.data.newPassword), passwordChangedAt: now, updatedAt: now } });
    await db.collection("sessions").updateMany({ userId: resolved.principal.userId, _id: { $ne: resolved.sessionId }, revokedAt: { $exists: false } }, { $set: { revokedAt: now, revokeReason: "password_changed" } });
    await db.collection("sessions").updateOne({ _id: resolved.sessionId }, { $unset: { stepUpUntil: "" } });
    await writeAudit(db, request, resolved.principal.userId, "auth.password.changed", "user", "success");
    return reply.send({ status: "password_changed", otherSessionsRevoked: true });
  });

  app.post("/v1/auth/mfa/setup", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    if (!config.MFA_ENCRYPTION_KEY) return reply.code(503).send({ error: "MFA_NOT_CONFIGURED" });
    const parsed = z.object({ currentPassword: z.string().min(1).max(256) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active" });
    if (!user || typeof user.passwordHash !== "string" || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(403).send({ error: "CURRENT_PASSWORD_INVALID" });
    }
    if (user.mfaEnabled === true) return reply.code(409).send({ error: "MFA_ALREADY_ENABLED" });
    const secret = generateTotpSecret();
    await db.collection("users").updateOne({ _id: user._id }, { $set: { mfaPendingSecret: encryptMfaSecret(secret), mfaSetupAt: new Date(), mfaSetupExpiresAt: new Date(Date.now() + 15 * 60_000) } });
    const issuer = "Zuri%20MeBuMIP";
    const label = encodeURIComponent(String(user.normalizedEmail));
    return reply.send({ secret, otpauthUrl: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`, note: "Add this secret to an authenticator app, then confirm with /v1/auth/mfa/enable. The secret is shown only once." });
  });

  app.post("/v1/auth/mfa/enable", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active" });
    if (!user || typeof user.mfaPendingSecret !== "string" || !(user.mfaSetupExpiresAt instanceof Date) || user.mfaSetupExpiresAt.getTime() <= Date.now()) return reply.code(409).send({ error: "MFA_SETUP_NOT_STARTED_OR_EXPIRED" });
    if (!verifyTotp(decryptMfaSecret(user.mfaPendingSecret), parsed.data.code)) { await writeAudit(db, request, resolved.principal.userId, "auth.mfa.enable.denied", "user", "denied"); return reply.code(400).send({ error: "MFA_CODE_INVALID" }); }
    const recoveryCodes = generateMfaRecoveryCodes();
    await db.collection("users").updateOne({ _id: user._id }, { $set: { mfaEnabled: true, mfaEnabledAt: new Date(), mfaSecretEncrypted: user.mfaPendingSecret, mfaRecoveryCodeHashes: recoveryCodes.map((code) => hashToken(normalizeMfaRecoveryCode(code))) }, $unset: { mfaPendingSecret: "", mfaSetupExpiresAt: "" } });
    await writeAudit(db, request, resolved.principal.userId, "auth.mfa.enabled", "user", "success");
    return reply.send({ status: "mfa_enabled", recoveryCodes, recoveryCodesWarning: "Shown once. Store these codes securely; each code can be used once." });
  });

  app.post("/v1/auth/step-up", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const parsed = z.union([
      z.object({ code: z.string().regex(/^\d{6}$/) }),
      z.object({ recoveryCode: z.string().min(8).max(32) }),
    ]).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active", mfaEnabled: true });
    if (!user) return reply.code(403).send({ error: "MFA_REQUIRED" });
    let verified = false;
    if ("code" in parsed.data && typeof user.mfaSecretEncrypted === "string") {
      verified = verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), parsed.data.code);
    } else if ("recoveryCode" in parsed.data) {
      const recoveryHash = hashToken(normalizeMfaRecoveryCode(parsed.data.recoveryCode));
      const consumed = await db.collection<{ mfaRecoveryCodeHashes?: string[] } & Document>("users").updateOne({ _id: user._id, mfaRecoveryCodeHashes: recoveryHash }, { $pull: { mfaRecoveryCodeHashes: recoveryHash } });
      verified = consumed.modifiedCount === 1;
    }
    if (!verified) { await writeAudit(db, request, resolved.principal.userId, "auth.step_up.denied", "session", "denied", String(resolved.sessionId)); return reply.code(403).send({ error: "MFA_CODE_INVALID" }); }
    const stepUpUntil = new Date(Date.now() + 5 * 60_000);
    await db.collection("sessions").updateOne({ _id: resolved.sessionId }, { $set: { stepUpUntil } });
    await writeAudit(db, request, resolved.principal.userId, "auth.step_up.completed", "session", "success", String(resolved.sessionId));
    return reply.send({ status: "verified", stepUpUntil: stepUpUntil.toISOString() });
  });

  app.post("/v1/auth/mfa/reset", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    const parsed = z.object({ currentPassword: z.string().min(1).max(256), recoveryCode: z.string().min(8).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active", mfaEnabled: true });
    if (!user || typeof user.passwordHash !== "string" || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return reply.code(403).send({ error: "CURRENT_PASSWORD_INVALID" });
    const recoveryHash = hashToken(normalizeMfaRecoveryCode(parsed.data.recoveryCode));
    const consumed = await db.collection<{ mfaRecoveryCodeHashes?: string[] }>("users").updateOne(
      { _id: user._id, mfaEnabled: true, mfaRecoveryCodeHashes: recoveryHash },
      { $pull: { mfaRecoveryCodeHashes: recoveryHash }, $unset: { mfaSecretEncrypted: "", mfaEnabled: "", mfaEnabledAt: "", mfaRecoveryCodeHashes: "", mfaPendingSecret: "", mfaSetupExpiresAt: "" } },
    );
    if (consumed.modifiedCount !== 1) {
      await writeAudit(db, request, resolved.principal.userId, "auth.mfa.reset.denied", "user", "denied");
      return reply.code(403).send({ error: "MFA_RECOVERY_CODE_INVALID" });
    }
    const now = new Date();
    await db.collection("sessions").updateMany({ userId: resolved.principal.userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now, revokeReason: "mfa_factor_reset" }, $unset: { stepUpUntil: "" } });
    await writeAudit(db, request, resolved.principal.userId, "auth.mfa.reset", "user", "success");
    return reply.send({ status: "mfa_reset", sessionsRevoked: true, note: "Sign in again and enroll a new authenticator. Recovery codes have been invalidated." });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    await db.collection("sessions").updateOne({ _id: resolved.sessionId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    await writeAudit(db, request, resolved.principal.userId, "auth.session.revoked", "session", "success", String(resolved.sessionId));
    return reply.code(204).send();
  });
}
