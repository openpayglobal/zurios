import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { config, corsOrigins } from "./config.js";
import { resolvePrincipal } from "./auth.js";
import { hasPlatformPermission } from "./security.js";

const managedKmsKeyrings = [
  {
    id: "5653e1ff-fd71-4a0d-8720-380cdfcaf2c4",
    name: "Zuri OS MAC Runtime Workload Identity",
    purpose: "Vercel workload identity",
    keyId: "75899278-1e19-4444-bec0-141dc4d17eb0",
    algorithm: "RS256",
    environment: "production",
    projectId: "prj_vkIcPCsN1TW3WOturczl3FcWEJkq",
    status: "provisioned_pending_runtime_integration",
  },
  {
    id: "16d2fb82-30b7-4a0d-8c4e-49fb1de92919",
    name: "Zuri OS User Session JWT Signing",
    purpose: "User session JWT signing",
    keyId: "2900b63b-5eed-4689-8726-b05a4618967f",
    algorithm: "RS256",
    environment: "production",
    projectId: "prj_vkIcPCsN1TW3WOturczl3FcWEJkq",
    status: "provisioned_pending_runtime_integration",
  },
  {
    id: "501ff21c-7c24-4e9e-b23e-789256cd6edd",
    name: "Zuri MeBuMIP Runtime Workload Identity",
    purpose: "MeBuMIP Vercel workload identity",
    keyId: "5d401897-e851-438f-a56c-b28453aff756",
    algorithm: "RS256",
    environment: "production",
    projectId: "prj_7Ud5L31qXeLoFeguYm75Gje3sZDJ",
    status: "provisioned_pending_runtime_integration",
  },
  {
    id: "55210f93-c052-45a5-aeb8-e083ed0d5dce",
    name: "Zuri OS Audit Event Signing",
    purpose: "Audit event signing",
    keyId: "da6060ee-9fda-4389-a652-281c256be6d2",
    algorithm: "RS256",
    environment: "production",
    projectId: "prj_vkIcPCsN1TW3WOturczl3FcWEJkq",
    status: "provisioned_pending_runtime_integration",
  },
] as const;

export function registerInfrastructureRoutes(app: FastifyInstance, db: Db): void {
  app.get("/v1/mac/infrastructure", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (!hasPlatformPermission(resolved.principal, "platform:settings:read")) return reply.code(403).send({ error: "FORBIDDEN" });

    let topology: { replicaSet: boolean; writablePrimary: boolean; transactionsAvailable: boolean } = {
      replicaSet: false, writablePrimary: false, transactionsAvailable: false,
    };
    try {
      const hello = await db.command({ hello: 1 });
      topology = {
        replicaSet: typeof hello.setName === "string" && hello.setName.length > 0,
        writablePrimary: hello.isWritablePrimary === true,
        transactionsAvailable: typeof hello.logicalSessionTimeoutMinutes === "number" && hello.logicalSessionTimeoutMinutes > 0,
      };
    } catch {
      // Do not leak driver details or connection strings into the MAC response.
    }

    return reply.header("cache-control", "no-store").send({
      generatedAt: new Date().toISOString(),
      environment: config.NODE_ENV,
      database: {
        configured: Boolean(config.MONGODB_URI),
        topology,
        source: "deployment_bootstrap",
        note: "A production URI must be provider-provisioned, validated and then registered in MAC. This endpoint never returns the URI.",
      },
      keyrings: {
        managedSigning: managedKmsKeyrings,
        mfaEncryption: {
          configured: Boolean(config.MFA_ENCRYPTION_KEY || config.MFA_ENCRYPTION_KEYRING),
          activeKeyId: config.MFA_ENCRYPTION_ACTIVE_KEY_ID ?? null,
          source: "deployment_bootstrap",
          status: "requires_encryption_kms_for_MAC_managed_rotation",
        },
        legacyAuditHmac: {
          configured: Boolean(config.AUDIT_SIGNING_KEY || config.AUDIT_SIGNING_KEYRING),
          activeKeyId: config.AUDIT_SIGNING_ACTIVE_KEY_ID ?? (config.AUDIT_SIGNING_KEY ? "legacy" : null),
          source: "deployment_bootstrap",
        },
      },
      apiOrigins: {
        items: corsOrigins,
        source: "deployment_bootstrap",
        status: "runtime_MAC_origin_registry_pending",
      },
      providers: {
        email: { configured: Boolean(config.RESEND_API_KEY && config.MAIL_FROM), provider: config.RESEND_API_KEY ? "resend" : null },
        meta: { configured: false, status: "provider_authorization_required" },
        whatsapp: { configured: false, status: "provider_authorization_required" },
      },
      secretStore: {
        status: "blocked",
        reason: "A dedicated encryption KMS/HSM is required before MAC can safely persist MFA, database or provider secret values.",
      },
      note: "Only non-secret metadata is returned. Private signing keys and all credential values remain inaccessible to the browser.",
    });
  });
}
