import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ObjectId, type Db, type Document } from "mongodb";
import { z } from "zod";
import { config } from "./config.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { createAuditEvent, hashToken, newOpaqueToken, PLATFORM_ROLES, TENANT_ROLES, type Principal, type PlatformRole, type TenantRole } from "./security.js";

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

export async function resolvePrincipal(db: Db, request: FastifyRequest): Promise<{ principal: Principal; sessionId: ObjectId } | null> {
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
  const platformRole = PLATFORM_ROLES.includes(user.platformRole as PlatformRole) ? user.platformRole as PlatformRole : undefined;
  return {
    principal: {
      userId: String(user._id),
      ...(platformRole ? { platformRole } : {}),
      tenantMemberships,
    },
    sessionId: session._id as ObjectId,
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
    if (!user || !valid) return unauthorized(reply);

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

  app.get("/v1/auth/me", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    return reply.send({ userId: resolved.principal.userId, platformRole: resolved.principal.platformRole ?? null, tenantMemberships: resolved.principal.tenantMemberships });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return unauthorized(reply);
    await db.collection("sessions").updateOne({ _id: resolved.sessionId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    await writeAudit(db, request, resolved.principal.userId, "auth.session.revoked", "session", "success", String(resolved.sessionId));
    return reply.code(204).send();
  });
}
