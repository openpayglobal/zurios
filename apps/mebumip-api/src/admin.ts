import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
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

  app.get("/v1/mac/audit-events", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:audit:read")) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const events = await db.collection("auditEvents")
      .find({}, { projection: { actorUserId: 1, action: 1, targetType: 1, targetId: 1, tenantId: 1, outcome: 1, correlationId: 1, occurredAt: 1 } })
      .sort({ occurredAt: -1 }).limit(100).toArray();
    return reply.send({ items: events, limit: 100 });
  });
}
