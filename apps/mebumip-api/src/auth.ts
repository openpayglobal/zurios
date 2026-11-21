import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { config, corsOrigins } from "./config.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { appendAuditEvent, hashToken, newOpaqueToken, PLATFORM_ROLES, TENANT_ROLES, type Principal, type PlatformRole, type TenantRole } from "./security.js";
import { appendAuditEventInTransaction } from "./audit-service.js";
import { decryptMfaSecret, encryptMfaSecret, generateMfaRecoveryCodes, generateTotpSecret, normalizeMfaRecoveryCode, verifyTotp } from "./mfa.js";
import { sendPasswordRecoveryEmail } from "./mail.js";

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

function readCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { /* Ignore malformed cookie values. */ }
  }
  return result;
}

function csrfForSession(token: string): string {
  return createHmac("sha256", token).update("zuri-mebumip-csrf-v1").digest("base64url");
}

function setSessionCookies(reply: FastifyReply, token: string): void {
  const secure = config.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = config.SESSION_TTL_HOURS * 60 * 60;
  reply.header("set-cookie", [
    "mebumip_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; SameSite=" + config.SESSION_COOKIE_SAME_SITE + "; Max-Age=" + maxAge + secure,
    "mebumip_csrf=" + encodeURIComponent(csrfForSession(token)) + "; Path=/; SameSite=" + config.SESSION_COOKIE_SAME_SITE + "; Max-Age=" + maxAge + secure,
  ]);
}

function clearSessionCookies(reply: FastifyReply): void {
  const secure = config.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", [
    "mebumip_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + secure,
    "mebumip_csrf=; Path=/; SameSite=Lax; Max-Age=0" + secure,
  ]);
}
function safeSecretEqual(candidate: string, expected: string): boolean {
  const left = createHash("sha256").update(candidate).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function resolvePrincipal(db: Db, request: FastifyRequest): Promise<{ principal: Principal; sessionId: ObjectId; stepUpUntil?: Date } | null> {
  const authorization = request.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const cookies = readCookies(request.headers.cookie);
  const cookieToken = cookies.mebumip_session;
  const token = bearerToken ?? cookieToken;
  if (!token || token.length < 40 || token.length > 200) return null;
  if (!bearerToken && cookieToken && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const csrfHeader = request.headers["x-csrf-token"];
    const csrfCookie = cookies.mebumip_csrf;
    const expectedCsrf = csrfForSession(cookieToken);
    const origin = request.headers.origin;
    if (
      typeof csrfHeader !== "string" ||
      !csrfCookie ||
      !safeSecretEqual(csrfHeader, csrfCookie) ||
      !safeSecretEqual(csrfHeader, expectedCsrf) ||
      typeof origin !== "string" ||
      !corsOrigins.includes(origin)
    ) return null;
  }
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
  await appendAuditEvent(db, {
    actorUserId, action, targetType, outcome, correlationId: request.id,
    ...(targetId ? { targetId } : {}),
  });
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
    // A unique bootstrap lease serializes concurrent first-owner requests. The
    // transaction and unique owner index remain the database-level invariants.
    const now = new Date();
    const lockToken = newOpaqueToken();
    const locks = db.collection<{ _id: string; lockToken?: string; leaseExpiresAt?: Date; status?: string; acquiredAt?: Date; completedAt?: Date }>("platformBootstrapLocks");
    try {
      await locks.insertOne({
        _id: "singleton",
        lockToken,
        leaseExpiresAt: new Date(now.getTime() + 5 * 60_000),
        acquiredAt: now,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const reclaimed = await locks.updateOne(
        { _id: "singleton", status: { $ne: "completed" }, leaseExpiresAt: { $lte: now } },
        { $set: { lockToken, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), acquiredAt: now } },
      );
      if (reclaimed.modifiedCount !== 1) return reply.code(409).send({ error: "PLATFORM_BOOTSTRAP_IN_PROGRESS_OR_COMPLETED" });
    }

    const completeLock = async () => {
      const completed = await locks.updateOne(
        { _id: "singleton", lockToken },
        { $set: { status: "completed", completedAt: new Date() }, $unset: { lockToken: "", leaseExpiresAt: "" } },
      );
      if (completed.modifiedCount !== 1) throw new Error("PLATFORM_BOOTSTRAP_LOCK_LOST");
    };
    const releaseLock = async () => { await locks.deleteOne({ _id: "singleton", lockToken }); };

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await db.collection("users").findOne({ normalizedEmail: email });
    if (existing) {
      await releaseLock();
      return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });
    }

    try {
      const passwordHash = await hashPassword(parsed.data.password);
      const session = db.client.startSession();
      let userId: ObjectId | undefined;
      try {
        await session.withTransaction(async () => {
          const owners = await db.collection("users").countDocuments({ platformRole: "platform_owner" }, { session });
          if (owners > 0) throw new Error("PLATFORM_ALREADY_BOOTSTRAPPED");
          const userResult = await db.collection("users").insertOne({
            normalizedEmail: email, displayName: parsed.data.displayName, passwordHash,
            platformRole: "platform_owner", status: "active", createdAt: now, updatedAt: now,
          }, { session });
          userId = userResult.insertedId;
          const tenantResult = await db.collection("tenants").insertOne({
            name: parsed.data.companyName, slug: parsed.data.tenantSlug, status: "active", createdAt: now, updatedAt: now,
          }, { session });
          await db.collection("memberships").insertOne({
            tenantId: String(tenantResult.insertedId), userId: String(userResult.insertedId),
            role: "tenant_owner", status: "active", createdAt: now, updatedAt: now,
          }, { session });
          await appendAuditEventInTransaction(db, {
            actorUserId: String(userResult.insertedId), action: "platform.bootstrap.completed",
            targetType: "platform", outcome: "success", correlationId: request.id,
          }, session);
        });
      } finally {
        await session.endSession();
      }
      if (!userId) throw new Error("PLATFORM_BOOTSTRAP_USER_NOT_CREATED");
      await completeLock();
      return reply.code(201).send({ status: "bootstrapped", userId: String(userId), note: "Owner created. Sign in to obtain a session." });
    } catch (error) {
      if (error instanceof Error && error.message === "PLATFORM_ALREADY_BOOTSTRAPPED") {
        await completeLock();
        return reply.code(409).send({ error: "PLATFORM_ALREADY_BOOTSTRAPPED" });
      }
      if ((error as { code?: number }).code === 11000) {
        const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
        if (keyPattern.platformRole) {
          await completeLock();
          return reply.code(409).send({ error: "PLATFORM_ALREADY_BOOTSTRAPPED" });
        }
        await releaseLock();
        if (keyPattern.normalizedEmail) return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });
        if (keyPattern.slug) return reply.code(409).send({ error: "TENANT_SLUG_ALREADY_REGISTERED" });
      } else {
        await releaseLock();
      }
      throw error;
    }
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = z.object({
      token: z.string().min(40).max(200),
      email: z.string().email().max(254),
      password: z.string().min(12).max(256),
      displayName: z.string().trim().min(2).max(100),
    }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const email = parsed.data.email.trim().toLowerCase();
    const invitation = await db.collection("tenantInvitations").findOne({
      tokenHash: hashToken(parsed.data.token),
      email,
      acceptedAt: { $exists: false },
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!invitation) return reply.code(404).send({ error: "INVITATION_INVALID_OR_EMAIL_MISMATCH" });
    if (!TENANT_ROLES.includes(invitation.role as TenantRole) || invitation.role === "tenant_owner") {
      return reply.code(400).send({ error: "INVITATION_ROLE_INVALID" });
    }
    if (await db.collection("users").findOne({ normalizedEmail: email })) {
      return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED_SIGN_IN_AND_ACCEPT_INVITATION" });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date();
    const session = db.client.startSession();
    let createdUserId = "";
    try {
      await session.withTransaction(async () => {
        const currentInvitation = await db.collection("tenantInvitations").findOne({
          _id: invitation._id,
          tokenHash: hashToken(parsed.data.token),
          email,
          acceptedAt: { $exists: false },
          revokedAt: { $exists: false },
          expiresAt: { $gt: now },
        }, { session });
        if (!currentInvitation) throw new Error("INVITATION_ALREADY_USED_OR_EXPIRED");
        const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(currentInvitation.tenantId), status: "active" }, { session });
        if (!tenant) throw new Error("TENANT_NOT_ACTIVE");

        const inserted = await db.collection("users").insertOne({
          normalizedEmail: email,
          email,
          displayName: parsed.data.displayName,
          passwordHash,
          status: "active",
          emailVerifiedAt: now,
          emailVerificationMethod: "single_use_workspace_invitation",
          createdAt: now,
          updatedAt: now,
        }, { session });
        createdUserId = String(inserted.insertedId);

        await db.collection("memberships").updateOne(
          { tenantId: currentInvitation.tenantId, userId: createdUserId },
          { $setOnInsert: { tenantId: currentInvitation.tenantId, userId: createdUserId, role: currentInvitation.role, status: "active", createdAt: now, updatedAt: now } },
          { upsert: true, session },
        );
        const accepted = await db.collection("tenantInvitations").updateOne(
          { _id: currentInvitation._id, acceptedAt: { $exists: false }, revokedAt: { $exists: false } },
          { $set: { acceptedAt: now, acceptedBy: createdUserId } },
          { session },
        );
        if (accepted.modifiedCount !== 1) throw new Error("INVITATION_ALREADY_USED");

        await appendAuditEventInTransaction(db, {
          actorUserId: createdUserId,
          action: "tenant.invitation.registered",
          targetType: "tenant_membership",
          targetId: createdUserId,
          tenantId: currentInvitation.tenantId,
          outcome: "success",
          correlationId: request.id,
          metadata: { role: currentInvitation.role, emailVerifiedBy: "single_use_invitation" },
        }, session);
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000) {
        return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED_SIGN_IN_AND_ACCEPT_INVITATION" });
      }
      if (error instanceof Error && error.message === "INVITATION_ALREADY_USED") return reply.code(409).send({ error: error.message });
      if (error instanceof Error && error.message === "TENANT_NOT_ACTIVE") return reply.code(409).send({ error: error.message });
      request.log.error({ err: error, correlationId: request.id }, "Tenant invitation registration failed");
      return reply.code(500).send({ error: "REGISTRATION_FAILED" });
    } finally {
      await session.endSession();
    }
    return reply.code(201).send({ status: "registered", tenantId: invitation.tenantId, userId: createdUserId, emailVerified: true });
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
      userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 256),
      ipHash: hashToken(request.ip || "unknown"),
    });
    await writeAudit(db, request, String(user._id), "auth.session.created", "session", "success");
    setSessionCookies(reply, token);
    return reply.send({ ...(config.NODE_ENV === "production" ? {} : { accessToken: token }), tokenType: config.NODE_ENV === "production" ? "Cookie" : "Bearer", expiresAt: expiresAt.toISOString(), user: { id: String(user._id), email, displayName: user.displayName, platformRole: user.platformRole ?? null } });
  });

  app.post("/v1/auth/register-platform-admin", async (request, reply) => {
    const parsed = z.object({ token: z.string().min(40).max(200), email: z.string().email().max(254), password: z.string().min(12).max(256), displayName: z.string().trim().min(2).max(100) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const email = parsed.data.email.trim().toLowerCase();
    const invitation = await db.collection("platformAdminInvitations").findOne({ tokenHash: hashToken(parsed.data.token), email, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (!invitation || !["platform_admin", "platform_operator", "platform_auditor"].includes(String(invitation.role))) return reply.code(404).send({ error: "PLATFORM_ADMIN_INVITATION_INVALID_OR_EMAIL_MISMATCH" });
    if (await db.collection("users").findOne({ normalizedEmail: email })) return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED_USE_ACCEPT" });
    const now = new Date();
    const created = await db.collection("users").insertOne({ normalizedEmail: email, displayName: parsed.data.displayName, passwordHash: await hashPassword(parsed.data.password), platformRole: invitation.role, platformAdminStatus: "active", status: "active", platformAdminInvitedAt: invitation.createdAt, platformAdminAcceptedAt: now, createdAt: now, updatedAt: now });
    try {
      const accepted = await db.collection("platformAdminInvitations").updateOne({ _id: invitation._id, acceptedAt: { $exists: false }, revokedAt: { $exists: false } }, { $set: { acceptedAt: now, acceptedBy: String(created.insertedId) } });
      if (accepted.modifiedCount !== 1) throw new Error("PLATFORM_ADMIN_INVITATION_ALREADY_USED");
      await appendAuditEvent(db, { actorUserId: String(created.insertedId), action: "platform.admin.invitation.registration.completed", targetType: "platform_admin", targetId: String(created.insertedId), outcome: "success", correlationId: request.id, metadata: { role: String(invitation.role) } });
    } catch (error) {
      await db.collection("platformAdminInvitations").updateOne({ _id: invitation._id, acceptedBy: String(created.insertedId) }, { $unset: { acceptedAt: "", acceptedBy: "" } });
      await db.collection("users").deleteOne({ _id: created.insertedId });
      throw error;
    }
    return reply.code(201).send({ status: "registered", userId: String(created.insertedId), role: invitation.role, note: "Sign in to access the platform administrator console." });
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
    const sessions = await db.collection("sessions").find({ userId: resolved.principal.userId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { projection: { createdAt: 1, expiresAt: 1, userAgent: 1 } }).sort({ createdAt: -1 }).limit(50).toArray();
    return reply.send({ items: sessions.map((session) => ({ id: String(session._id), createdAt: session.createdAt, expiresAt: session.expiresAt, userAgent: session.userAgent ?? "Unknown device", current: String(session._id) === String(resolved.sessionId) })) });
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
    const sessions = db.collection("sessions");
    const newSession = await sessions.insertOne({
      userId: resolved.principal.userId,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
      userAgent: String(request.headers["user-agent"] ?? "unknown").slice(0, 256),
      ipHash: hashToken(request.ip || "unknown"),
      rotatedFromSessionId: String(resolved.sessionId),
    });
    const rotated = await sessions.updateOne(
      { _id: resolved.sessionId, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
      { $set: { revokedAt: now, rotatedAt: now, rotatedToSessionId: String(newSession.insertedId) } },
    );
    if (rotated.modifiedCount !== 1) {
      await sessions.deleteOne({ _id: newSession.insertedId });
      return unauthorized(reply);
    }
    try {
      await writeAudit(db, request, resolved.principal.userId, "auth.session.rotated", "session", "success", String(resolved.sessionId));
    } catch (error) {
      await sessions.deleteOne({ _id: newSession.insertedId });
      await sessions.updateOne(
        { _id: resolved.sessionId, rotatedToSessionId: String(newSession.insertedId) },
        { $unset: { revokedAt: "", rotatedAt: "", rotatedToSessionId: "" } },
      );
      throw error;
    }
    setSessionCookies(reply, token);
    return reply.send({ ...(config.NODE_ENV === "production" ? {} : { accessToken: token }), tokenType: config.NODE_ENV === "production" ? "Cookie" : "Bearer", expiresAt: expiresAt.toISOString() });
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

  app.post("/v1/auth/password/recovery", async (request, reply) => {
    const parsed = z.object({ email: z.string().email().max(254) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.collection("users").findOne({ normalizedEmail: email, status: "active" });
    if (!user) return reply.code(202).send({ status: "if_account_exists_email_sent" });

    const now = new Date();
    const token = newOpaqueToken();
    const expiresAt = new Date(now.getTime() + 30 * 60_000);
    await db.collection("passwordRecoveries").updateMany(
      { userId: String(user._id), usedAt: { $exists: false }, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokeReason: "superseded" } },
    );
    const recovery = await db.collection("passwordRecoveries").insertOne({
      userId: String(user._id),
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt,
    });
    const delivery = await sendPasswordRecoveryEmail({ to: email, token, expiresAt });
    if (!delivery.delivered) {
      await db.collection("passwordRecoveries").updateOne(
        { _id: recovery.insertedId, usedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokeReason: "email_delivery_failed" } },
      );
      await writeAudit(db, request, String(user._id), "auth.password.recovery.delivery_failed", "user", "failure");
      return reply.code(202).send({ status: "if_account_exists_email_sent" });
    }
    await writeAudit(db, request, String(user._id), "auth.password.recovery.requested", "user", "success");
    return reply.code(202).send({ status: "if_account_exists_email_sent" });
  });

  app.post("/v1/auth/password/reset", async (request, reply) => {
    const parsed = z.object({
      token: z.string().min(40).max(200),
      newPassword: z.string().min(12).max(256),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const now = new Date();
    const recovery = await db.collection("passwordRecoveries").findOne({
      tokenHash: hashToken(parsed.data.token),
      usedAt: { $exists: false },
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    });
    if (!recovery || typeof recovery.userId !== "string" || !ObjectId.isValid(recovery.userId)) {
      return reply.code(400).send({ error: "RESET_TOKEN_INVALID_OR_EXPIRED" });
    }
    const consumed = await db.collection("passwordRecoveries").updateOne(
      { _id: recovery._id, usedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
    );
    if (consumed.modifiedCount !== 1) return reply.code(400).send({ error: "RESET_TOKEN_INVALID_OR_EXPIRED" });

    const userId = recovery.userId;
    const updated = await db.collection("users").updateOne(
      { _id: new ObjectId(userId), status: "active" },
      { $set: { passwordHash: await hashPassword(parsed.data.newPassword), passwordChangedAt: now, updatedAt: now } },
    );
    if (updated.matchedCount !== 1) return reply.code(400).send({ error: "RESET_TOKEN_INVALID_OR_EXPIRED" });
    await db.collection("passwordRecoveries").updateMany(
      { userId, _id: { $ne: recovery._id }, usedAt: { $exists: false }, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokeReason: "password_reset_completed" } },
    );
    await db.collection("sessions").updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, revokeReason: "password_recovered" }, $unset: { stepUpUntil: "" } },
    );
    await writeAudit(db, request, userId, "auth.password.recovered", "user", "success");
    clearSessionCookies(reply);
    return reply.send({ status: "password_reset", sessionsRevoked: true });
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
      const recoveryHashes = Array.isArray(user.mfaRecoveryCodeHashes) ? user.mfaRecoveryCodeHashes.filter((value: unknown) => value !== recoveryHash) : [];
      const consumed = await db.collection("users").updateOne({ _id: user._id, mfaRecoveryCodeHashes: recoveryHash }, { $set: { mfaRecoveryCodeHashes: recoveryHashes } });
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
    const consumed = await db.collection("users").updateOne(
      { _id: user._id, mfaEnabled: true, mfaRecoveryCodeHashes: recoveryHash },
      { $unset: { mfaSecretEncrypted: "", mfaEnabled: "", mfaEnabledAt: "", mfaRecoveryCodeHashes: "", mfaPendingSecret: "", mfaSetupExpiresAt: "" } },
    );
    if (consumed.modifiedCount !== 1) {
      await writeAudit(db, request, resolved.principal.userId, "auth.mfa.reset.denied", "user", "denied");
      return reply.code(403).send({ error: "MFA_RECOVERY_CODE_INVALID" });
    }
    const now = new Date();
    await db.collection("sessions").updateMany({ userId: resolved.principal.userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now, revokeReason: "mfa_factor_reset" }, $unset: { stepUpUntil: "" } });
    await writeAudit(db, request, resolved.principal.userId, "auth.mfa.reset", "user", "success");
    clearSessionCookies(reply);
    return reply.send({ status: "mfa_reset", sessionsRevoked: true, note: "Sign in again and enroll a new authenticator. Recovery codes have been invalidated." });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    await db.collection("sessions").updateOne({ _id: resolved.sessionId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    await writeAudit(db, request, resolved.principal.userId, "auth.session.revoked", "session", "success", String(resolved.sessionId));
    clearSessionCookies(reply);
    return reply.code(204).send();
  });
}
