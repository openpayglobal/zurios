/**
 * Global MAC/MAD authorization boundary.
 *
 * This principal is intentionally separate from tenant PlatformPrincipal.
 * A tenant membership, tenant role, or tenant-scoped JWT must never be
 * promoted into a global platform-operator identity.
 */
export type PlatformOperatorPrincipal = {
  operatorId: string;
  sessionId: string;
  permissions: readonly string[];
  /** Set only by the operator authentication layer after successful MFA. */
  mfaVerifiedAt: Date;
  /** Explicit tenant scope. An empty list grants no tenant-targeted access. */
  tenantIds: readonly string[];
  /** Explicitly elevated, time-bounded break-glass grant. */
  elevation?: {
    permissions: readonly string[];
    expiresAt: Date;
    approvalId: string;
  };
};

export type PlatformOperatorAccessRequest = {
  permission: string;
  tenantId?: string;
  now?: Date;
};

export type PlatformOperatorDecision =
  | { allowed: true; source: "standing" | "elevation" }
  | { allowed: false; reason: "INVALID_PRINCIPAL" | "MFA_REQUIRED" | "PERMISSION_DENIED" | "TENANT_SCOPE_DENIED" | "ELEVATION_EXPIRED" };

/**
 * Default-deny MAC authorization. No wildcard permission is interpreted.
 * Elevated access is additive only for its exact permission list and expires.
 */
export function authorizePlatformOperator(
  principal: PlatformOperatorPrincipal | null | undefined,
  request: PlatformOperatorAccessRequest
): PlatformOperatorDecision {
  if (!principal || !principal.operatorId || !principal.sessionId || !request.permission) {
    return { allowed: false, reason: "INVALID_PRINCIPAL" };
  }

  const now = request.now ?? new Date();
  if (!(principal.mfaVerifiedAt instanceof Date) || Number.isNaN(principal.mfaVerifiedAt.getTime()) || principal.mfaVerifiedAt > now) {
    return { allowed: false, reason: "MFA_REQUIRED" };
  }

  if (request.tenantId && !principal.tenantIds.includes(request.tenantId)) {
    return { allowed: false, reason: "TENANT_SCOPE_DENIED" };
  }

  if (principal.permissions.includes(request.permission)) {
    return { allowed: true, source: "standing" };
  }

  if (principal.elevation?.permissions.includes(request.permission)) {
    if (principal.elevation.expiresAt <= now) {
      return { allowed: false, reason: "ELEVATION_EXPIRED" };
    }
    if (!principal.elevation.approvalId) {
      return { allowed: false, reason: "INVALID_PRINCIPAL" };
    }
    return { allowed: true, source: "elevation" };
  }

  return { allowed: false, reason: "PERMISSION_DENIED" };
}
