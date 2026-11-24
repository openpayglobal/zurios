import { signJWT } from "@vercel/kms";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import type { AuthConfig } from "./auth-service.js";

export const USER_SESSION_KMS_ISSUER_ID = "16d2fb82-30b7-4a0d-8c4e-49fb1de92919";
const sessionJwks = createRemoteJWKSet(
  new URL(`https://kms.vercel.com/${USER_SESSION_KMS_ISSUER_ID}/jwks.json`),
);
const legacyKey = (config: AuthConfig) => new TextEncoder().encode(config.jwtSecret);
const usesManagedSigning = () => process.env.VERCEL_ENV === "production";

export type SessionTokenClaims = {
  userId: string;
  tenantId: string;
  membershipId: string;
  sessionId: string;
  permissions: string[];
};

/**
 * Production access tokens are signed by the project/environment-scoped Vercel
 * KMS issuer. Local and Preview tokens retain HS256 so non-production
 * deployments do not need permission to use the Production KMS grant.
 */
export async function signSessionAccessToken(config: AuthConfig, claims: SessionTokenClaims): Promise<string> {
  if (usesManagedSigning()) {
    const result = await signJWT({
      issuerId: USER_SESSION_KMS_ISSUER_ID,
      claims: {
        purpose: "user-session",
        iss: config.issuer,
        aud: config.audience,
        sub: claims.userId,
        tenantId: claims.tenantId,
        membershipId: claims.membershipId,
        sessionId: claims.sessionId,
        permissions: claims.permissions,
      },
      ttl: config.accessTokenTtlSeconds,
    });
    return result.token;
  }

  return new SignJWT({
    tenantId: claims.tenantId,
    membershipId: claims.membershipId,
    sessionId: claims.sessionId,
    permissions: claims.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(legacyKey(config));
}

export async function verifySessionAccessToken(token: string, config: AuthConfig) {
  if (usesManagedSigning()) {
    return jwtVerify(token, sessionJwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"],
    });
  }

  return jwtVerify(token, legacyKey(config), {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["HS256"],
  });
}
