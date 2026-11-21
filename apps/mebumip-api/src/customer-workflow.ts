import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { z } from "zod";
import { resolvePrincipal } from "./auth.js";
import { appendAuditEventInTransaction, hasTenantPermission } from "./security.js";

const tenantQuery = z.object({ tenantId: z.string().min(1).max(128) });
const businessProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  industry: z.string().trim().min(2).max(100),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  timezone: z.string().trim().min(3).max(80),
  website: z.string().url().optional().or(z.literal("")),
  contactEmail: z.string().email().max(254),
}).strict();

function forbidden(reply: any) {
  return reply.code(403).send({ error: "WORKSPACE_ACCESS_DENIED" });
}

export function registerCustomerWorkflowRoutes(app: FastifyInstance, db: Db): void {
  app.get("/v1/workspace/onboarding", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = tenantQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const { tenantId } = parsed.data;
    if (!hasTenantPermission(resolved.principal, tenantId, "tenant:members:read")) return forbidden(reply);

    const [profile, members, connections] = await Promise.all([
      db.collection("tenantOnboarding").findOne({ tenantId }, { projection: { _id: 0, tenantId: 0 } }),
      db.collection("memberships").countDocuments({ tenantId, status: "active" }),
      db.collection("metaConnections").find(
        { tenantId },
        { projection: { _id: 1, connectionId: 1, provider: 1, status: 1, connectedAt: 1, expiresAt: 1, scopes: 1, updatedAt: 1 } },
      ).sort({ updatedAt: -1 }).limit(50).toArray(),
    ]);
    const completeProfile = Boolean(profile && profile.legalName && profile.displayName && profile.industry && profile.countryCode && profile.timezone && profile.contactEmail);
    const connectedMeta = connections.filter((item) => item.status === "connected").length;
    const safeConnections = connections.map((item) => ({
      id: String(item.connectionId ?? item._id),
      provider: String(item.provider ?? "meta"),
      status: String(item.status ?? "pending"),
      connectedAt: item.connectedAt ?? null,
      expiresAt: item.expiresAt ?? null,
      scopes: Array.isArray(item.scopes) ? item.scopes : [],
    }));
    return reply.header("cache-control", "no-store").send({
      tenantId,
      businessProfile: profile ?? null,
      connections: safeConnections,
      steps: [
        { id: "business-profile", label: "Complete business profile", status: completeProfile ? "complete" : "action_required" },
        { id: "team", label: "Invite your team", status: members > 1 ? "complete" : "recommended" },
        { id: "meta", label: "Connect Meta Business", status: connectedMeta > 0 ? "complete" : "blocked" },
        { id: "assets", label: "Select Pages, Instagram and ad assets", status: connectedMeta > 0 ? "action_required" : "blocked" },
        { id: "social", label: "Set up publishing and inbox", status: "planned", phase: 2, objective: "A" },
        { id: "ads", label: "Set up advertising", status: "planned", phase: 3, objective: "B" },
        { id: "whatsapp", label: "Set up WhatsApp Business", status: "planned", phase: 4, objective: "C" },
        { id: "integrations", label: "Connect external software", status: "planned", phase: 6, objective: "E" },
      ],
      providerReadiness: {
        metaOAuth: "not_configured",
        message: "Meta OAuth is not activated. Configure the Meta app and provider-issued credentials through MAC after the owner's Meta prerequisites are completed.",
      },
      memberCount: members,
      generatedAt: new Date().toISOString(),
    });
  });

  app.put("/v1/workspace/onboarding/business-profile", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = z.object({ ...tenantQuery.shape, ...businessProfileSchema.shape }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    const { tenantId, ...profile } = parsed.data;
    if (!hasTenantPermission(resolved.principal, tenantId, "tenant:members:write")) return forbidden(reply);

    const now = new Date();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection("tenantOnboarding").updateOne(
          { tenantId },
          { $set: { ...profile, updatedAt: now, updatedBy: resolved.principal.userId }, $setOnInsert: { tenantId, createdAt: now, createdBy: resolved.principal.userId } },
          { upsert: true, session },
        );
        await appendAuditEventInTransaction(db, {
          actorUserId: resolved.principal.userId,
          action: "tenant.onboarding.business_profile.updated",
          targetType: "tenant_onboarding",
          targetId: tenantId,
          tenantId,
          outcome: "success",
          correlationId: request.id,
          metadata: { changedFields: Object.keys(profile).join(",") },
        }, session);
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    } finally {
      await session.endSession();
    }
    return reply.send({ status: "saved", tenantId, updatedAt: now.toISOString() });
  });

  app.post("/v1/workspace/onboarding/meta/connect", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = tenantQuery.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    if (!hasTenantPermission(resolved.principal, parsed.data.tenantId, "meta:connections:write")) return forbidden(reply);
    return reply.code(503).send({
      error: "META_OAUTH_NOT_CONFIGURED",
      status: "blocked",
      message: "The Meta OAuth adapter is not activated. MAC must first hold verified Meta app configuration and provider-issued credentials; no fake connection will be created.",
    });
  });
}
