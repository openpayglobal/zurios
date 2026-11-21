import type { FastifyInstance } from "fastify";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { appendAuditEvent, hashToken, newOpaqueToken, signAuditExport, verifyAuditChain } from "./security.js";
import { resolvePrincipal } from "./auth.js";
import { hasPlatformPermission, verifyAuditEvent } from "./security.js";
import { buildAuditArchivePackage } from "./audit-archive.js";
import { config, corsOrigins } from "./config.js";
import { sendPlatformAdminInvitationEmail, sendTenantInvitationEmail } from "./mail.js";

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
    const tenantResult = await withAuditTransaction(
      db,
      async (session) => {
        const created = await db.collection("tenants").insertOne({
          name: parsed.data.name, slug: parsed.data.slug, status: "active",
          createdAt: now, updatedAt: now, createdBy: resolved.principal.userId,
        }, { session });
        await db.collection("memberships").insertOne({
          tenantId: String(created.insertedId), userId: String(owner._id),
          role: "tenant_owner", status: "active", createdAt: now, updatedAt: now,
        }, { session });
        return created;
      },
      (created) => ({
        actorUserId: resolved.principal.userId, action: "platform.tenant.created",
        targetType: "tenant", targetId: String(created.insertedId),
        outcome: "success", correlationId: request.id,
      }),
    );
    return reply.code(201).send({ id: String(tenantResult.insertedId), name: parsed.data.name, slug: parsed.data.slug, ownerUserId: String(owner._id), status: "active" });
  });

  app.get("/v1/mac/settings", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:settings:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    return reply.send({ settings: {
      environment: config.NODE_ENV, sessionTtlHours: config.SESSION_TTL_HOURS, sessionCookieSameSite: config.SESSION_COOKIE_SAME_SITE,
      secureCookies: config.NODE_ENV === "production", trustedProxyConfigured: Boolean(config.TRUSTED_PROXY_CIDRS),
      trustedProxyCount: config.TRUSTED_PROXY_CIDRS ? config.TRUSTED_PROXY_CIDRS.split(",").filter((value) => value.trim()).length : 0,
      corsOrigins, emailDeliveryConfigured: Boolean(config.RESEND_API_KEY && config.MAIL_FROM), emailProvider: config.RESEND_API_KEY ? "resend" : "not_configured",
      auditSigningConfigured: Boolean(config.AUDIT_SIGNING_KEY || config.AUDIT_SIGNING_KEYRING), auditSigningKeyRingConfigured: Boolean(config.AUDIT_SIGNING_KEYRING), auditSigningActiveKeyId: config.AUDIT_SIGNING_ACTIVE_KEY_ID ?? (config.AUDIT_SIGNING_KEY ? "legacy" : null), mfaEncryptionConfigured: Boolean(config.MFA_ENCRYPTION_KEY || config.MFA_ENCRYPTION_KEYRING), mfaEncryptionKeyRingConfigured: Boolean(config.MFA_ENCRYPTION_KEYRING), mfaEncryptionActiveKeyId: config.MFA_ENCRYPTION_ACTIVE_KEY_ID ?? (config.MFA_ENCRYPTION_KEY ? "legacy" : null),
    }, mode: "read_only_runtime_configuration", note: "Secret values are never returned. Runtime configuration changes are managed through the deployment secret manager." });
  });
  app.get("/v1/mac/tenants/:tenantId/members", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    const { tenantId } = request.params as { tenantId: string };
    if (!ObjectId.isValid(tenantId)) return reply.code(400).send({ error: "INVALID_TENANT_ID" });
    const [members, invitations] = await Promise.all([
      db.collection("memberships").find({ tenantId, status: { $in: ["active", "suspended"] } }).limit(200).toArray(),
      db.collection("tenantInvitations").find({ tenantId, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { projection: { tokenHash: 0 } }).limit(100).toArray(),
    ]);
    const userIds = members.map((member) => String(member.userId)).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const users = await db.collection("users").find({ _id: { $in: userIds } }, { projection: { normalizedEmail: 1, displayName: 1 } }).toArray();
    const userById = new Map(users.map((user) => [String(user._id), user]));
    return reply.send({ members: members.map((member) => { const user = userById.get(String(member.userId)); return { id: String(member._id), userId: member.userId, email: user?.normalizedEmail ?? "", displayName: user?.displayName ?? "", role: member.role, status: member.status, createdAt: member.createdAt }; }), invitations: invitations.map((invite) => ({ id: String(invite._id), email: invite.email, role: invite.role, expiresAt: invite.expiresAt })) });
  });

  app.post("/v1/mac/tenants/:tenantId/invitations", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:write")) return reply.code(403).send({ error: "FORBIDDEN" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const { tenantId } = request.params as { tenantId: string };
    if (!ObjectId.isValid(tenantId)) return reply.code(400).send({ error: "INVALID_TENANT_ID" });
    const parsed = z.object({ email: z.string().email().max(254), role: z.enum(["tenant_admin", "publisher", "advertiser", "support_agent", "viewer"]) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId), status: "active" });
    if (!tenant) return reply.code(404).send({ error: "TENANT_NOT_FOUND" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await db.collection("users").findOne({ normalizedEmail: email, status: "active" });
    if (user && await db.collection("memberships").findOne({ tenantId, userId: String(user._id), status: "active" })) return reply.code(409).send({ error: "USER_ALREADY_MEMBER" });
    const pending = await db.collection("tenantInvitations").findOne({ tenantId, email, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (pending) return reply.code(409).send({ error: "INVITATION_ALREADY_PENDING" });
    const token = newOpaqueToken(); const now = new Date(); const expiresAt = new Date(now.getTime() + 72 * 60 * 60_000);
    const inserted = await withAuditTransaction(
      db,
      (session) => db.collection("tenantInvitations").insertOne({ tenantId, email, role: parsed.data.role, tokenHash: hashToken(token), invitedBy: resolved.principal.userId, createdAt: now, expiresAt }, { session }),
      (created) => ({ actorUserId: resolved.principal.userId, action: "platform.tenant.invitation.created", targetType: "tenant_invitation", targetId: String(created.insertedId), tenantId, outcome: "success", correlationId: request.id }),
    );
    const delivery = await sendTenantInvitationEmail({ to: email, tenantName: String(tenant.name), role: parsed.data.role, token, expiresAt });
    if (!delivery.delivered) {
      await withAuditTransaction(
        db,
        (session) => db.collection("tenantInvitations").updateOne({ _id: inserted.insertedId, acceptedAt: { $exists: false }, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokeReason: "email_delivery_failed" } }, { session }),
        () => ({ actorUserId: resolved.principal.userId, action: "platform.tenant.invitation.delivery_failed", targetType: "tenant_invitation", targetId: String(inserted.insertedId), tenantId, outcome: "failure", correlationId: request.id }),
      );
      return reply.code(503).send({ error: "INVITATION_DELIVERY_UNAVAILABLE" });
    }
    return reply.code(201).send({ invitationId: String(inserted.insertedId), email, role: parsed.data.role, expiresAt, delivery: delivery.provider });
  });

  app.patch("/v1/mac/tenants/:tenantId/members/:userId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:write")) return reply.code(403).send({ error: "FORBIDDEN" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId)) return reply.code(400).send({ error: "INVALID_IDENTIFIER" });
    const parsed = z.object({ role: z.enum(["tenant_admin", "publisher", "advertiser", "support_agent", "viewer"]).optional(), status: z.enum(["active", "suspended"]).optional() }).refine((value) => value.role !== undefined || value.status !== undefined).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    try {
      await withAuditTransaction(
        db,
        async (session) => {
          const result = await db.collection("memberships").updateOne(
            { tenantId, userId, role: { $ne: "tenant_owner" }, status: { $in: ["active", "suspended"] } },
            { $set: { ...parsed.data, updatedAt: new Date() } },
            { session },
          );
          if (!result.matchedCount) throw new Error("MEMBERSHIP_NOT_FOUND_OR_PROTECTED");
          return result;
        },
        () => ({ actorUserId: resolved.principal.userId, action: "platform.tenant.membership.updated", targetType: "tenant_membership", targetId: userId, tenantId, outcome: "success", correlationId: request.id, metadata: { ...(parsed.data.role ? { role: parsed.data.role } : {}), ...(parsed.data.status ? { status: parsed.data.status } : {}) } }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "MEMBERSHIP_NOT_FOUND_OR_PROTECTED") return reply.code(404).send({ error: "MEMBERSHIP_NOT_FOUND_OR_PROTECTED" });
      throw error;
    }
    return reply.send({ status: "updated" });
  });

  app.delete("/v1/mac/tenants/:tenantId/members/:userId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:write")) return reply.code(403).send({ error: "FORBIDDEN" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId)) return reply.code(400).send({ error: "INVALID_IDENTIFIER" });
    try {
      await withAuditTransaction(
        db,
        async (session) => {
          const result = await db.collection("memberships").updateOne(
            { tenantId, userId, role: { $ne: "tenant_owner" }, status: { $in: ["active", "suspended"] } },
            { $set: { status: "removed", removedAt: new Date(), removedBy: resolved.principal.userId } },
            { session },
          );
          if (!result.matchedCount) throw new Error("MEMBERSHIP_NOT_FOUND_OR_PROTECTED");
          return result;
        },
        () => ({ actorUserId: resolved.principal.userId, action: "platform.tenant.membership.removed", targetType: "tenant_membership", targetId: userId, tenantId, outcome: "success", correlationId: request.id }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "MEMBERSHIP_NOT_FOUND_OR_PROTECTED") return reply.code(404).send({ error: "MEMBERSHIP_NOT_FOUND_OR_PROTECTED" });
      throw error;
    }
    return reply.code(204).send();
  });

  app.delete("/v1/mac/tenants/:tenantId/invitations/:invitationId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:tenants:write")) return reply.code(403).send({ error: "FORBIDDEN" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const { tenantId, invitationId } = request.params as { tenantId: string; invitationId: string };
    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(invitationId)) return reply.code(400).send({ error: "INVALID_IDENTIFIER" });
    try {
      await withAuditTransaction(
        db,
        async (session) => {
          const result = await db.collection("tenantInvitations").updateOne(
            { _id: new ObjectId(invitationId), tenantId, acceptedAt: { $exists: false }, revokedAt: { $exists: false } },
            { $set: { revokedAt: new Date(), revokedBy: resolved.principal.userId } },
            { session },
          );
          if (!result.matchedCount) throw new Error("PENDING_INVITATION_NOT_FOUND");
          return result;
        },
        () => ({ actorUserId: resolved.principal.userId, action: "platform.tenant.invitation.revoked", targetType: "tenant_invitation", targetId: invitationId, tenantId, outcome: "success", correlationId: request.id }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "PENDING_INVITATION_NOT_FOUND") return reply.code(404).send({ error: "PENDING_INVITATION_NOT_FOUND" });
      throw error;
    }
    return reply.code(204).send();
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
    let updatedState: { role: string; status: string };
    try {
      updatedState = await withAuditTransaction(
        db,
        async (session) => {
          const set: Record<string, unknown> = { updatedAt: now, platformAdminUpdatedBy: resolved.principal.userId };
          if (parsed.data.role) set.platformRole = parsed.data.role;
          if (parsed.data.status) set.platformAdminStatus = parsed.data.status;
          const updated = await db.collection("users").updateOne(
            { _id: target._id, platformRole: { $in: ["platform_admin", "platform_operator", "platform_auditor"] } },
            { $set: set },
            { session },
          );
          if (updated.modifiedCount !== 1) throw new Error("PLATFORM_ADMIN_NOT_FOUND_OR_PROTECTED");
          if (parsed.data.status === "suspended") {
            await db.collection("sessions").updateMany(
              { userId, revokedAt: { $exists: false } },
              { $set: { revokedAt: now, revokeReason: "platform_admin_suspended" } },
              { session },
            );
          }
          return { role: parsed.data.role ?? String(target.platformRole), status: parsed.data.status ?? String(target.platformAdminStatus ?? "active") };
        },
        (state) => ({
          actorUserId: resolved.principal.userId, action: "platform.admin.updated", targetType: "platform_admin", targetId: userId,
          outcome: "success", correlationId: request.id,
          metadata: { ...(parsed.data.role ? { role: parsed.data.role } : {}), ...(parsed.data.status ? { status: parsed.data.status } : {}) },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "PLATFORM_ADMIN_NOT_FOUND_OR_PROTECTED") return reply.code(404).send({ error: "PLATFORM_ADMIN_NOT_FOUND_OR_PROTECTED" });
      throw error;
    }
    return reply.send({ id: userId, role: updatedState.role, status: updatedState.status });
  });

  app.get("/v1/mac/admin-invitations", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:admins:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    const items = await db.collection("platformAdminInvitations").find({ acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { projection: { tokenHash: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
    return reply.send({ items: items.map((item) => ({ id: String(item._id), email: item.email, role: item.role, expiresAt: item.expiresAt, createdAt: item.createdAt })) });
  });

  app.post("/v1/mac/admin-invitations", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (resolved.principal.platformRole !== "platform_owner") return reply.code(403).send({ error: "PLATFORM_OWNER_REQUIRED" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const parsed = z.object({ email: z.string().email().max(254), role: z.enum(["platform_admin", "platform_operator", "platform_auditor"]) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await db.collection("users").findOne({ normalizedEmail: email, platformRole: { $exists: true } });
    if (existing) return reply.code(409).send({ error: "USER_ALREADY_HAS_PLATFORM_ROLE" });
    const pending = await db.collection("platformAdminInvitations").findOne({ email, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (pending) return reply.code(409).send({ error: "PLATFORM_ADMIN_INVITATION_ALREADY_PENDING" });
    const token = newOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60_000);
    const inserted = await withAuditTransaction(
      db,
      (session) => db.collection("platformAdminInvitations").insertOne({ email, role: parsed.data.role, tokenHash: hashToken(token), invitedBy: resolved.principal.userId, createdAt: now, expiresAt }, { session }),
      (created) => ({ actorUserId: resolved.principal.userId, action: "platform.admin.invitation.created", targetType: "platform_admin_invitation", targetId: String(created.insertedId), outcome: "success", correlationId: request.id }),
    );
    const delivery = await sendPlatformAdminInvitationEmail({ to: email, role: parsed.data.role, token, expiresAt });
    if (!delivery.delivered) {
      await withAuditTransaction(
        db,
        (session) => db.collection("platformAdminInvitations").updateOne({ _id: inserted.insertedId, acceptedAt: { $exists: false }, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokeReason: "email_delivery_failed" } }, { session }),
        () => ({ actorUserId: resolved.principal.userId, action: "platform.admin.invitation.delivery_failed", targetType: "platform_admin_invitation", targetId: String(inserted.insertedId), outcome: "failure", correlationId: request.id }),
      );
      return reply.code(503).send({ error: "PLATFORM_ADMIN_INVITATION_DELIVERY_UNAVAILABLE" });
    }
    return reply.code(201).send({ invitationId: String(inserted.insertedId), email, role: parsed.data.role, expiresAt, delivery: delivery.provider });
  });

  app.delete("/v1/mac/admin-invitations/:invitationId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (resolved.principal.platformRole !== "platform_owner") return reply.code(403).send({ error: "PLATFORM_OWNER_REQUIRED" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const { invitationId } = request.params as { invitationId: string };
    if (!ObjectId.isValid(invitationId)) return reply.code(400).send({ error: "INVALID_INVITATION_ID" });
    const revokedAt = new Date();
    try {
      await withAuditTransaction(
        db,
        async (session) => {
          const result = await db.collection("platformAdminInvitations").updateOne(
            { _id: new ObjectId(invitationId), acceptedAt: { $exists: false }, revokedAt: { $exists: false } },
            { $set: { revokedAt, revokedBy: resolved.principal.userId } },
            { session },
          );
          if (!result.matchedCount) throw new Error("PENDING_PLATFORM_ADMIN_INVITATION_NOT_FOUND");
          return result;
        },
        () => ({ actorUserId: resolved.principal.userId, action: "platform.admin.invitation.revoked", targetType: "platform_admin_invitation", targetId: invitationId, outcome: "success", correlationId: request.id }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "PENDING_PLATFORM_ADMIN_INVITATION_NOT_FOUND") return reply.code(404).send({ error: "PENDING_PLATFORM_ADMIN_INVITATION_NOT_FOUND" });
      throw error;
    }
    return reply.code(204).send();
  });
  app.post("/v1/mac/admin-invitations/accept", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = z.object({ token: z.string().min(40).max(200) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active" });
    if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const invitation = await db.collection("platformAdminInvitations").findOne({ tokenHash: hashToken(parsed.data.token), email: user.normalizedEmail, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (!invitation) return reply.code(404).send({ error: "PLATFORM_ADMIN_INVITATION_INVALID_OR_EMAIL_MISMATCH" });
    try {
      await withAuditTransaction(
        db,
        async (session) => {
          const claimed = await db.collection("platformAdminInvitations").updateOne(
            { _id: invitation._id, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
            { $set: { acceptedAt: new Date(), acceptedBy: resolved.principal.userId } },
            { session },
          );
          if (claimed.modifiedCount !== 1) throw new Error("PLATFORM_ADMIN_INVITATION_ALREADY_USED");
          const updated = await db.collection("users").updateOne(
            { _id: user._id, platformRole: { $exists: false } },
            { $set: { platformRole: invitation.role, platformAdminStatus: "active", platformAdminInvitedAt: invitation.createdAt, platformAdminAcceptedAt: new Date() } },
            { session },
          );
          if (updated.modifiedCount !== 1) throw new Error("USER_ALREADY_HAS_PLATFORM_ROLE");
          return { userId: resolved.principal.userId, role: String(invitation.role) };
        },
        (accepted) => ({ actorUserId: accepted.userId, action: "platform.admin.invitation.accepted", targetType: "platform_admin", targetId: accepted.userId, outcome: "success", correlationId: request.id, metadata: { role: accepted.role } }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "PLATFORM_ADMIN_INVITATION_ALREADY_USED") return reply.code(409).send({ error: "PLATFORM_ADMIN_INVITATION_ALREADY_USED" });
      if (error instanceof Error && error.message === "USER_ALREADY_HAS_PLATFORM_ROLE") return reply.code(409).send({ error: "USER_ALREADY_HAS_PLATFORM_ROLE" });
      throw error;
    }
    return reply.send({ status: "accepted", role: invitation.role });
  });
  app.get("/v1/mac/audit-events/verify", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:audit:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    const chain = await verifyAuditChain(db);
    const events = await db.collection("auditEvents").find({}).sort({ sequence: -1, _id: -1 }).limit(500).toArray();
    const verified = events.filter((event) => verifyAuditEvent(event as Record<string, unknown>)).length;
    const unsigned = events.filter((event) => !event.integrity || (event.integrity as { algorithm?: string }).algorithm === "unsigned").length;
    const sequenced = events.filter((event) => Number.isSafeInteger(event.sequence)).sort((left, right) => Number(left.sequence) - Number(right.sequence));
    let sequenceGaps = 0;
    for (let index = 1; index < sequenced.length; index += 1) if (Number(sequenced[index]!.sequence) !== Number(sequenced[index - 1]!.sequence) + 1) sequenceGaps += 1;
    return reply.send({ checked: events.length, verified, invalid: events.length - verified - unsigned, unsigned, sequenceGaps, chain: { valid: chain.valid, chainValid: chain.chainValid, checked: chain.checked, legacyUnchainedEvents: chain.legacyUnchainedEvents, firstInvalidSequence: chain.firstInvalidSequence, latestSequence: chain.latestSequence, counterSequence: chain.counterSequence, counterMatches: chain.counterMatches }, integrity: process.env.AUDIT_SIGNING_KEYRING ? "hmac_sha256_v2_key_ring" : process.env.AUDIT_SIGNING_KEY ? "hmac_sha256_legacy" : "signing_key_not_configured", scope: "latest_500_event_signatures_and_full_chain_integrity", note: "Event signatures and the full predecessor-linked chain are verified separately; neither replaces restricted database roles or independent immutable archives." });
  });

  app.get("/v1/mac/audit-events/archive", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:audit:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    const query = request.query as { fromSequence?: string; toSequence?: string };
    const fromSequence = Number(query.fromSequence), toSequence = Number(query.toSequence);
    if (!Number.isSafeInteger(fromSequence) || !Number.isSafeInteger(toSequence) || fromSequence < 1 || toSequence < fromSequence) return reply.code(400).send({ error: "INVALID_AUDIT_ARCHIVE_SEQUENCE_RANGE" });
    const events = await db.collection("auditEvents").find({ sequence: { $gte: fromSequence, $lte: toSequence } }).sort({ sequence: 1 }).limit(1001).toArray();
    try {
      const archive = buildAuditArchivePackage(events as Array<Record<string, unknown>>, fromSequence, toSequence);
      await appendAuditEvent(db, { actorUserId: resolved.principal.userId, action: "audit.archive.package.prepared", targetType: "audit_archive", targetId: archive.objectKey, outcome: "success", correlationId: request.id, metadata: { fromSequence, toSequence, eventCount: archive.eventCount, sha256: archive.sha256 } });
      reply.header("Cache-Control", "no-store");
      reply.header("X-Audit-Archive-SHA256", archive.sha256);
      reply.header("X-Audit-Archive-Object-Key", archive.objectKey);
      reply.header("X-Audit-Archive-Status", "prepared-not-archived");
      reply.header("Content-Disposition", `attachment; filename="mebumip-audit-${fromSequence}-${toSequence}.json"`);
      return reply.type("application/json").send(archive.content);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUDIT_ARCHIVE_PREPARATION_FAILED";
      const status = code === "AUDIT_ARCHIVE_MANIFEST_UNSIGNED" ? 503 : code.startsWith("AUDIT_ARCHIVE") ? 409 : 500;
      return reply.code(status).send({ error: code });
    }
  });

  app.get("/v1/mac/audit-events/export", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:audit:read")) return reply.code(403).send({ error: "FORBIDDEN" });
    const query = request.query as { before?: string; limit?: string };
    const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit ?? "200", 10) || 200));
    if (query.before && !ObjectId.isValid(query.before)) return reply.code(400).send({ error: "INVALID_CURSOR" });
    const filter = query.before ? { _id: { $lt: new ObjectId(query.before) } } : {};
    const events = await db.collection("auditEvents").find(filter).sort({ _id: -1 }).limit(limit).toArray();
    const signed = events.filter((event) => verifyAuditEvent(event as Record<string, unknown>)).length;
    const generatedAt = new Date().toISOString();
    const manifest = signAuditExport(events as Array<Record<string, unknown>>, generatedAt);
    return reply.send({ manifest, integrity: { signed, unsignedOrInvalid: events.length - signed, algorithm: manifest.integrity.algorithm }, events, nextCursor: events.length === limit && events.length ? String(events[events.length - 1]!._id) : null, archiveStatus: "exported_not_archived" });
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
      .find(filter, { projection: { actorUserId: 1, action: 1, targetType: 1, targetId: 1, tenantId: 1, outcome: 1, correlationId: 1, occurredAt: 1, integrity: 1 } })
      .sort({ _id: -1 }).limit(limit + 1).toArray();
    const hasMore = events.length > limit;
    if (hasMore) events.pop();
    return reply.send({ items: events, limit, hasMore, nextCursor: hasMore && events.length ? String(events[events.length - 1]!._id) : null, retention: "No automatic TTL deletion is configured for auditEvents." });
  });
}
