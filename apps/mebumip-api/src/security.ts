import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PLATFORM_ROLES = ["platform_owner", "platform_admin", "platform_operator", "platform_auditor"] as const;
export const TENANT_ROLES = ["tenant_owner", "tenant_admin", "publisher", "advertiser", "support_agent", "viewer"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type TenantRole = (typeof TENANT_ROLES)[number];
export type Permission =
  | "platform:settings:read" | "platform:settings:write"
  | "platform:tenants:read" | "platform:tenants:write"
  | "platform:admins:read" | "platform:admins:write"
  | "platform:audit:read" | "platform:metrics:read"
  | "tenant:members:read" | "tenant:members:write"
  | "meta:connections:read" | "meta:connections:write"
  | "social:assets:read" | "social:assets:write"
  | "ads:read" | "ads:write" | "whatsapp:read" | "whatsapp:write"
  | "integrations:read" | "integrations:write";

export interface Principal {
  userId: string;
  platformRole?: PlatformRole;
  tenantMemberships: Array<{ tenantId: string; role: TenantRole; status: "active" | "suspended" }>;
}

const PLATFORM_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  platform_owner: ["platform:settings:read", "platform:settings:write", "platform:tenants:read", "platform:tenants:write", "platform:admins:read", "platform:admins:write", "platform:audit:read", "platform:metrics:read"],
  platform_admin: ["platform:settings:read", "platform:settings:write", "platform:tenants:read", "platform:tenants:write", "platform:admins:read", "platform:audit:read", "platform:metrics:read"],
  platform_operator: ["platform:tenants:read", "platform:metrics:read"],
  platform_auditor: ["platform:settings:read", "platform:tenants:read", "platform:admins:read", "platform:audit:read", "platform:metrics:read"],
};
const TENANT_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  tenant_owner: ["tenant:members:read", "tenant:members:write", "meta:connections:read", "meta:connections:write", "social:assets:read", "social:assets:write", "ads:read", "ads:write", "whatsapp:read", "whatsapp:write", "integrations:read", "integrations:write"],
  tenant_admin: ["tenant:members:read", "tenant:members:write", "meta:connections:read", "meta:connections:write", "social:assets:read", "social:assets:write", "ads:read", "ads:write", "whatsapp:read", "whatsapp:write", "integrations:read", "integrations:write"],
  publisher: ["meta:connections:read", "social:assets:read", "social:assets:write"],
  advertiser: ["meta:connections:read", "ads:read", "ads:write"],
  support_agent: ["meta:connections:read", "social:assets:read", "whatsapp:read"],
  viewer: ["tenant:members:read", "meta:connections:read", "social:assets:read", "ads:read", "whatsapp:read", "integrations:read"],
};

export function hasPlatformPermission(principal: Principal, permission: Permission): boolean {
  return principal.platformRole ? PLATFORM_PERMISSIONS[principal.platformRole].includes(permission) : false;
}

export function hasTenantPermission(principal: Principal, tenantId: string, permission: Permission): boolean {
  const membership = principal.tenantMemberships.find((item) => item.tenantId === tenantId && item.status === "active");
  return membership ? TENANT_PERMISSIONS[membership.role].includes(permission) : false;
}

export function assertTenantAccess(principal: Principal, tenantId: string): void {
  if (!tenantId || !principal.tenantMemberships.some((item) => item.tenantId === tenantId && item.status === "active")) {
    throw new AuthorizationError("TENANT_ACCESS_DENIED");
  }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "FORBIDDEN") { super(message); this.name = "AuthorizationError"; }
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AuditEventInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  tenantId?: string;
  outcome: "success" | "denied" | "failure";
  correlationId: string;
  occurredAt?: Date;
  metadata?: Record<string, string | number | boolean | null>;
}

type AuditEventPayload = Omit<AuditEventInput, "occurredAt"> & { occurredAt: Date };

function auditPayload(event: AuditEventPayload): string {
  return JSON.stringify({
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    ...(event.targetId ? { targetId: event.targetId } : {}),
    ...(event.tenantId ? { tenantId: event.tenantId } : {}),
    outcome: event.outcome,
    correlationId: event.correlationId,
    occurredAt: event.occurredAt.toISOString(),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  });
}

export function createAuditEvent(input: AuditEventInput) {
  const event: AuditEventPayload = { ...input, occurredAt: input.occurredAt ?? new Date() };
  const signingKey = process.env.AUDIT_SIGNING_KEY;
  const integrity = signingKey
    ? { algorithm: "HMAC-SHA256" as const, signature: createHmac("sha256", signingKey).update(auditPayload(event)).digest("hex") }
    : { algorithm: "unsigned" as const, signature: null };
  // Deliberately no arbitrary request/body/token fields: audit records must not contain secrets.
  return { ...event, integrity };
}

export function verifyAuditEvent(event: Record<string, unknown>, signingKey = process.env.AUDIT_SIGNING_KEY): boolean {
  if (!signingKey || !event.integrity || typeof event.integrity !== "object") return false;
  const integrity = event.integrity as { algorithm?: unknown; signature?: unknown };
  if (integrity.algorithm !== "HMAC-SHA256" || typeof integrity.signature !== "string" || !/^[a-f0-9]{64}$/.test(integrity.signature)) return false;
  if (!(event.occurredAt instanceof Date) || typeof event.actorUserId !== "string" || typeof event.action !== "string" ||
      typeof event.targetType !== "string" || typeof event.outcome !== "string" || typeof event.correlationId !== "string") return false;
  const payload: AuditEventPayload = {
    actorUserId: event.actorUserId, action: event.action, targetType: event.targetType,
    ...(typeof event.targetId === "string" ? { targetId: event.targetId } : {}),
    ...(typeof event.tenantId === "string" ? { tenantId: event.tenantId } : {}),
    outcome: event.outcome as AuditEventInput["outcome"], correlationId: event.correlationId,
    occurredAt: event.occurredAt,
    ...(event.metadata && typeof event.metadata === "object" ? { metadata: event.metadata as AuditEventInput["metadata"] } : {}),
  };
  const expected = createHmac("sha256", signingKey).update(auditPayload(payload)).digest();
  const actual = Buffer.from(integrity.signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
