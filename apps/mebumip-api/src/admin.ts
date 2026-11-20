import type { FastifyInstance } from "fastify";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { createAuditEvent } from "./security.js";
import { resolvePrincipal } from "./auth.js";
import { hasPlatformPermission } from "./security.js";

export function registerAdminRoutes(app: FastifyInstance, db: Db): void {
  // MAD: strictly read-only operational aggregates. No tenant content or credentials.
  app.get("/v1/mad/overview", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:metrics:read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const [tenants, activeTenants, users, activeSessions, metaConnections, pendingWebhooks] = await Promise.all([
      db.collection("tenants").countDocuments({}),
      db.collection("tenants").countDocuments({ status: "active" }),
      db.collection("users").countDocuments({ status: "active" }),
      db.collection("sessions").countDocuments({ revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }),
      db.collection("metaConnections").countDocuments({ status: "connected" }),
      db.collection("webhookEvents").countDocuments({ status: { $in: ["received", "retrying"] } }),
    ]);
    return reply.send({
      generatedAt: new Date().toISOString(),
      platform: { tenants, activeTenants, activeUsers: users, activeSessions },
      integrations: { connectedMetaAccounts: metaConnections, pendingWebhookEvents: pendingWebhooks },
      dataStatus: "live_database_aggregates",
      note: "Counts only. MAD is read-only and does not expose customer message content or credentials.",
    });
  });

  // MAC: platform control-plane visibility. This route is read-only; mutations
  // will be introduced separately with step-up verification and audited handlers.
  app.get("/v1/mac/tenants", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const tenants = await db.collection("tenants")
      .find({}, { projection: { name: 1, slug: 1, status: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(100).toArray();
    return reply.send({ items: tenants.map((tenant) => ({
      id: String(tenant._id), name: tenant.name, slug: tenant.slug,
      status: tenant.status, createdAt: tenant.createdAt,
    })), limit: 100 });
  });

  app.post("/v1/mac/tenants", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:write")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) {
      return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    }
    const schema = z.object({
      name: z.string().trim().min(2).max(160),
      slug: z.string().trim().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ownerUserId: z.string().refine((value) => /^[a-f0-9]{24}$/i.test(value), "Invalid user ID"),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    const owner = await db.collection("users").findOne({ _id: new ObjectId(parsed.data.ownerUserId), status: "active" });
    if (!owner) return reply.code(404).send({ error: "ACTIVE_OWNER_USER_NOT_FOUND" });
    const now = new Date();
    const tenantResult = await db.collection("tenants").insertOne({
      name: parsed.data.name, slug: parsed.data.slug, status: "active",
      createdAt: now, updatedAt: now, createdBy: resolved.principal.userId,
    });
    try {
      await db.collection("memberships").insertOne({
        tenantId: String(tenantResult.insertedId), userId: String(owner._id),
        role: "tenant_owner", status: "active", createdAt: now, updatedAt: now,
      });
      await db.collection("auditEvents").insertOne(createAuditEvent({
        actorUserId: resolved.principal.userId, action: "platform.tenant.created",
        targetType: "tenant", targetId: String(tenantResult.insertedId),
        outcome: "success", correlationId: request.id,
      }));
    } catch (error) {
      await db.collection("memberships").deleteOne({ tenantId: String(tenantResult.insertedId) });
      await db.collection("tenants").deleteOne({ _id: tenantResult.insertedId });
      throw error;
    }
    return reply.code(201).send({ id: String(tenantResult.insertedId), name: parsed.data.name, slug: parsed.data.slug, ownerUserId: String(owner._id), status: "active" });
  });

  app.get("/v1/mac/admins", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:admins:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    const admins = await db.collection("users").find(
      { platformRole: { $in: ["platform_owner", "platform_admin", "platform_operator", "platform_auditor"] } },
      { projection: { normalizedEmail: 1, displayName: 1, platformRole: 1, platformAdminStatus: 1, createdAt: 1 } },
    ).sort({ createdAt: 1 }).limit(100).toArray();
    return reply.send({ items: admins.map((item) => ({
      id: String(item._id), email: item.normalizedEmail, displayName: item.displayName,
      role: item.platformRole, status: item.platformRole === "platform_owner" ? "protected" : (item.platformAdminStatus ?? "active"),
    })) });
  });

  app.patch("/v1/mac/admins/:userId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:admins:write")) return reply.code(403).send({ error: "FORBIDDEN" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const { userId } = request.params as { userId: string };
    if (!ObjectId.isValid(userId)) return reply.code(400).send({ error: "INVALID_USER_ID" });
    const parsed = z.object({
      role: z.enum(["platform_admin", "platform_operator", "platform_auditor"]).optional(),
      status: z.enum(["active", "suspended"]).optional(),
    }).refine((value) => value.role !== undefined || value.status !== undefined).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const target = await db.collection("users").findOne({ _id: new ObjectId(userId), platformRole: { $in: ["platform_admin", "platform_operator", "platform_auditor"] } });
    if (!target) return reply.code(404).send({ error: "PLATFORM_ADMIN_NOT_FOUND_OR_PROTECTED" });
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now, platformAdminUpdatedBy: resolved.principal.userId };
    if (parsed.data.role) set.platformRole = parsed.data.role;
    if (parsed.data.status) set.platformAdminStatus = parsed.data.status;
    await db.collection("users").updateOne({ _id: target._id }, { $set: set });
    if (parsed.data.status === "suspended") {
      await db.collection("sessions").updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now, revokeReason: "platform_admin_suspended" } });
    }
    await db.collection("auditEvents").insertOne(createAuditEvent({
      actorUserId: resolved.principal.userId, action: "platform.admin.updated", targetType: "platform_admin", targetId: userId,
      outcome: "success", correlationId: request.id,
      metadata: { ...(parsed.data.role ? { role: parsed.data.role } : {}), ...(parsed.data.status ? { status: parsed.data.status } : {}) },
    }));
    return reply.send({ id: userId, role: parsed.data.role ?? target.platformRole, status: parsed.data.status ?? target.platformAdminStatus ?? "active" });
  });

  app.get("/v1/mac/audit-events", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:audit:read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const query = request.query as { limit?: string; before?: string };
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? "50", 10) || 50));
    if (query.before && !ObjectId.isValid(query.before)) return reply.code(400).send({ error: "INVALID_CURSOR" });
    const filter = query.before ? { _id: { $lt: new ObjectId(query.before) } } : {};
    const events = await db.collection("auditEvents")
      .find(filter, { projection: { actorUserId: 1, action: 1, targetType: 1, targetId: 1, tenantId: 1, outcome: 1, correlationId: 1, occurredAt: 1 } })
      .sort({ _id: -1 }).limit(limit + 1).toArray();
    const hasMore = events.length > limit;
    if (hasMore) events.pop();
    return reply.send({ items: events, limit, hasMore, nextCursor: hasMore && events.length ? String(events[events.length - 1]!._id) : null, retention: "No automatic TTL deletion is configured for auditEvents." });
  });
}
