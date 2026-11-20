import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { resolvePrincipal } from "./auth.js";
import { hashToken, hasTenantPermission, TENANT_ROLES, type TenantRole } from "./security.js";
import { appendAuditEvent } from "./audit-service.js";
import { sendTenantInvitationEmail } from "./mail.js";

const invitationSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["tenant_admin", "publisher", "advertiser", "support_agent", "viewer"]),
});
const acceptSchema = z.object({ token: z.string().min(40).max(200) });
const updateSchema = z.object({ role: z.enum(["tenant_admin", "publisher", "advertiser", "support_agent", "viewer"]), status: z.enum(["active", "suspended"]).optional() });

async function audit(db: Db, actorUserId: string, requestId: string, action: string, tenantId: string, targetId: string) {
  await appendAuditEvent(db, {
    actorUserId, action, targetType: "tenant_membership", targetId, tenantId,
    outcome: "success", correlationId: requestId,
  });
}

export function registerTenantMemberRoutes(app: FastifyInstance, db: Db): void {
  app.get("/v1/tenants/:tenantId/members", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId } = request.params as { tenantId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "tenant:members:read")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    const [members, invitations] = await Promise.all([
      db.collection("memberships").find({ tenantId, status: { $in: ["active", "suspended"] } }).limit(200).toArray(),
      db.collection("tenantInvitations").find({ tenantId, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { projection: { tokenHash: 0 } }).limit(100).toArray(),
    ]);
    return reply.send({
      members: members.map((member) => ({ id: String(member._id), userId: member.userId, role: member.role, status: member.status, createdAt: member.createdAt })),
      invitations: invitations.map((invite) => ({ id: String(invite._id), email: invite.email, role: invite.role, expiresAt: invite.expiresAt })),
    });
  });

  app.post("/v1/tenants/:tenantId/invitations", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId } = request.params as { tenantId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "tenant:members:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) {
      return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    }
    const parsed = invitationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    const email = parsed.data.email.trim().toLowerCase();
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId), status: "active" });
    if (!tenant) return reply.code(404).send({ error: "TENANT_NOT_FOUND" });
    const user = await db.collection("users").findOne({ normalizedEmail: email, status: "active" });
    if (user) {
      const existing = await db.collection("memberships").findOne({ tenantId, userId: String(user._id) });
      if (existing?.status === "active") return reply.code(409).send({ error: "USER_ALREADY_MEMBER" });
    }
    const pending = await db.collection("tenantInvitations").findOne({ tenantId, email, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (pending) return reply.code(409).send({ error: "INVITATION_ALREADY_PENDING" });
    const token = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const inserted = await db.collection("tenantInvitations").insertOne({
      tenantId, email, role: parsed.data.role, tokenHash: hashToken(token),
      invitedBy: resolved.principal.userId, createdAt: now, expiresAt,
    });
    const delivery = await sendTenantInvitationEmail({
      to: email,
      tenantName: String(tenant.name),
      role: parsed.data.role,
      token,
      expiresAt,
    });
    if (!delivery.delivered) {
      await db.collection("tenantInvitations").updateOne(
        { _id: inserted.insertedId, acceptedAt: { $exists: false }, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokeReason: "email_delivery_failed" } },
      );
      await appendAuditEvent(db, {
        actorUserId: resolved.principal.userId, action: "tenant.invitation.delivery_failed",
        targetType: "tenant_invitation", targetId: String(inserted.insertedId), tenantId,
        outcome: "failure", correlationId: request.id,
      });
      return reply.code(503).send({ error: "INVITATION_DELIVERY_UNAVAILABLE" });
    }
    await appendAuditEvent(db, {
      actorUserId: resolved.principal.userId, action: "tenant.invitation.created",
      targetType: "tenant_invitation", targetId: String(inserted.insertedId), tenantId,
      outcome: "success", correlationId: request.id,
      metadata: { deliveryProvider: delivery.provider },
    });
    // The raw one-time token is sent only to the requested recipient by the mail provider.
    return reply.code(201).send({ invitationId: String(inserted.insertedId), email, role: parsed.data.role, expiresAt, delivery: delivery.provider });
  });

  app.post("/v1/tenant-invitations/accept", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const parsed = acceptSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    const invitation = await db.collection("tenantInvitations").findOne({
      tokenHash: hashToken(parsed.data.token), acceptedAt: { $exists: false },
      revokedAt: { $exists: false }, expiresAt: { $gt: new Date() },
    });
    if (!invitation) return reply.code(404).send({ error: "INVITATION_INVALID_OR_EXPIRED" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(resolved.principal.userId), status: "active" });
    if (!user || user.normalizedEmail !== invitation.email) return reply.code(403).send({ error: "INVITATION_EMAIL_MISMATCH" });
    if (!TENANT_ROLES.includes(invitation.role as TenantRole) || invitation.role === "tenant_owner") return reply.code(400).send({ error: "INVITATION_ROLE_INVALID" });
    await db.collection("memberships").updateOne(
      { tenantId: invitation.tenantId, userId: resolved.principal.userId },
      { $set: { role: invitation.role, status: "active", updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    const accepted = await db.collection("tenantInvitations").updateOne(
      { _id: invitation._id, acceptedAt: { $exists: false }, revokedAt: { $exists: false } },
      { $set: { acceptedAt: new Date(), acceptedBy: resolved.principal.userId } },
    );
    if (accepted.modifiedCount !== 1) return reply.code(409).send({ error: "INVITATION_ALREADY_USED" });
    await audit(db, resolved.principal.userId, request.id, "tenant.invitation.accepted", invitation.tenantId, resolved.principal.userId);
    return reply.send({ status: "accepted", tenantId: invitation.tenantId, role: invitation.role });
  });

  app.patch("/v1/tenants/:tenantId/members/:userId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId) || !hasTenantPermission(resolved.principal, tenantId, "tenant:members:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (userId === resolved.principal.userId) return reply.code(409).send({ error: "SELF_ROLE_CHANGE_NOT_ALLOWED" });
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) {
      return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    }
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    const result = await db.collection("memberships").updateOne(
      { tenantId, userId, role: { $ne: "tenant_owner" } },
      { $set: { ...parsed.data, updatedAt: new Date() } },
    );
    if (!result.matchedCount) return reply.code(404).send({ error: "MEMBERSHIP_NOT_FOUND_OR_PROTECTED" });
    await audit(db, resolved.principal.userId, request.id, "tenant.membership.updated", tenantId, userId);
    return reply.send({ status: "updated" });
  });

  app.delete("/v1/tenants/:tenantId/invitations/:invitationId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId, invitationId } = request.params as { tenantId: string; invitationId: string };
    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(invitationId) || !hasTenantPermission(resolved.principal, tenantId, "tenant:members:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) {
      return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    }
    const result = await db.collection("tenantInvitations").updateOne(
      { _id: new ObjectId(invitationId), tenantId, acceptedAt: { $exists: false }, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokedBy: resolved.principal.userId } },
    );
    if (!result.matchedCount) return reply.code(404).send({ error: "PENDING_INVITATION_NOT_FOUND" });
    await audit(db, resolved.principal.userId, request.id, "tenant.invitation.revoked", tenantId, invitationId);
    return reply.code(204).send();
  });

  app.delete("/v1/tenants/:tenantId/members/:userId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    if (!ObjectId.isValid(tenantId) || !ObjectId.isValid(userId) || !hasTenantPermission(resolved.principal, tenantId, "tenant:members:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!resolved.stepUpUntil || resolved.stepUpUntil.getTime() <= Date.now()) {
      return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    }
    const result = await db.collection("memberships").updateOne(
      { tenantId, userId, role: { $ne: "tenant_owner" }, status: "active" },
      { $set: { status: "removed", removedAt: new Date(), removedBy: resolved.principal.userId } },
    );
    if (!result.matchedCount) return reply.code(404).send({ error: "MEMBERSHIP_NOT_FOUND_OR_PROTECTED" });
    await audit(db, resolved.principal.userId, request.id, "tenant.membership.removed", tenantId, userId);
    return reply.code(204).send();
  });
}
