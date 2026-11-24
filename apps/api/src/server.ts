import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, corsOrigins } from "./config.js";
import { getMongoDatabase, connectMongo, closeMongo } from "./db/mongo.js";
import { authRoutes } from "./platform/auth-routes.js";
import { platformRoutes } from "./platform/platform-routes.js";
import { adminRoutes } from "./platform/admin-routes.js";
import { readPlatformRuntimeConfig } from "./platform/runtime-config-store.js";
import { decryptMacSecrets,isMacSecretVaultConfigured,readMacSecretsForService,type MacSecretEnvelope } from "./platform/secret-vault.js";
import { writeAuditEvent } from "./platform/audit.js";
import type { AuthConfig } from "./platform/auth-service.js";
import { createMongoEventBusPublisher, dispatchOutboxBatch, runOutboxWorker } from "@zuri/core-platform";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
const outboxAbortController = new AbortController();
const teamSlug = "openpayglobal-5300s-projects";
const teamId = "team_Gn7gvUwfzUbCZpxOIRrYK5gD";
const teamIssuer = `https://oidc.vercel.com/${teamSlug}`;
const teamAudience = `https://vercel.com/${teamSlug}`;
const vercelJwks = createRemoteJWKSet(new URL(`${teamIssuer}/.well-known/jwks`));
let outboxWorkerPromise: Promise<void> | undefined;
let lastOutboxDispatchAt = 0;
let outboxDispatchInFlight: Promise<void> | undefined;
const db: Db = getMongoDatabase();
let dbReady = false;
let dbInitialization: Promise<void> | undefined;
let lastMacSecretRefreshAt=0;
let macSecretRefreshPromise:Promise<void>|undefined;

const initializeDatabase = async (): Promise<void> => {
  if (dbReady) return;
  if (!dbInitialization) {
    dbInitialization = connectMongo().then(() => {
      dbReady = true;
      app.log.info("Zuri OS API database and indexes are ready");
      if (!process.env.VERCEL && !outboxWorkerPromise) {
        outboxWorkerPromise = runOutboxWorker(db, createMongoEventBusPublisher(db), outboxAbortController.signal).catch((error) => {
          app.log.error({ err: error }, "Platform outbox worker stopped unexpectedly");
        });
      }
    }).catch((error: unknown) => {
      dbInitialization = undefined;
      throw error;
    });
  }
  await dbInitialization;
};
let allowedOriginsCache = [...corsOrigins];
let allowedOriginsCacheAt = 0;

await app.register(helmet);
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" });
});

const authConfig: AuthConfig = {
  issuer: config.JWT_ISSUER,
  audience: config.JWT_AUDIENCE,
  jwtSecret: config.JWT_SECRET ?? "",
  accessTokenTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  sessionTtlSeconds: config.SESSION_TTL_SECONDS,
  mfaEncryptionKey: config.MFA_ENCRYPTION_KEY ?? "",
  accessRequestsEnabled: config.ACCESS_REQUESTS_ENABLED === "true",
  accessRequestsPrivacyNoticeUrl: config.ACCESS_REQUESTS_PRIVACY_NOTICE_URL,
};

// CORS uses the last known MAC-approved origin list. Before Atlas connects, only
// the deployment's explicit bootstrap list is available.
const isAllowedOrigin = async (origin: string): Promise<boolean> => {
  if (dbReady && Date.now() - allowedOriginsCacheAt > 5_000) {
    try {
      const runtime = await readPlatformRuntimeConfig(db);
      allowedOriginsCache = process.env.VERCEL_ENV === "preview"
        ? [...new Set([...runtime.allowedOrigins, ...corsOrigins])]
        : runtime.allowedOrigins.length ? runtime.allowedOrigins : [...corsOrigins];
    } catch {
      // Keep the last known-good list on transient MAC/database errors.
    }
    allowedOriginsCacheAt = Date.now();
  }
  return allowedOriginsCache.includes(origin);
};

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    void isAllowedOrigin(origin).then((allowed) => callback(null, allowed)).catch(() => callback(null, false));
  },
  credentials: true,
});

// Keep health probes independent from Atlas startup. Ordinary API requests wait
// for the bounded connection/index initialization and fail closed while unavailable.
app.addHook("onRequest", async (request, reply) => {
  if (request.url.startsWith("/health/live")) return;
  if (!dbReady) {
    try {
      await initializeDatabase();
    } catch (error) {
      app.log.error({ err: error }, "Database initialization unavailable for request");
      return reply.code(503).send({ error: "DATABASE_UNAVAILABLE" });
    }
  }
  if (process.env.VERCEL_ENV !== "production") return;
  if (!macSecretRefreshPromise && Date.now() - lastMacSecretRefreshAt > 5_000) {
    lastMacSecretRefreshAt=Date.now();
    macSecretRefreshPromise=(async()=>{
      try {
        const oidcToken=request.headers["x-vercel-oidc-token"];
        if(typeof oidcToken!=="string"||!oidcToken)throw new Error("MAC_WORKLOAD_OIDC_UNAVAILABLE");
        const secrets=await readMacSecretsForService(db,"zurios-api",oidcToken,["zuri-os-jwt-secret","zuri-os-mfa-encryption-key"]);
        const values=Object.fromEntries(secrets.map(item=>[item.secretId,item.value]));
        const jwtSecret=values["zuri-os-jwt-secret"];
        const mfaKey=values["zuri-os-mfa-encryption-key"];
        if(typeof jwtSecret!=="string"||jwtSecret.length<32)throw new Error("MAC_JWT_SECRET_UNAVAILABLE");
        if(typeof mfaKey!=="string"||Buffer.from(mfaKey,"base64").length!==32)throw new Error("MAC_MFA_KEY_UNAVAILABLE");
        authConfig.jwtSecret=jwtSecret;
        authConfig.mfaEncryptionKey=mfaKey;
        for(const item of secrets){
          await writeAuditEvent({
            tenantId:"platform",actor:{service:"zurios-api"},action:"platform.mac_secret.accessed",
            resourceType:"mac_secret",resourceId:item.secretId,outcome:"success",
            metadata:{service:"zurios-api",version:item.version}
          });
        }
      } catch(error) {
        authConfig.jwtSecret="";
        authConfig.mfaEncryptionKey="";
        app.log.warn({code:error instanceof Error?error.name:"UNKNOWN"},"MAC-managed API secrets unavailable; privileged authentication remains fail-closed");
      }
    })().finally(()=>{macSecretRefreshPromise=undefined;});
  }
  if(macSecretRefreshPromise)await macSecretRefreshPromise;
});

// Vercel Functions are request-scoped. Do not leave a permanent polling loop
// alive in a serverless instance; dispatch a bounded batch during live traffic.
// Local long-running deployments retain the dedicated worker below.
if (process.env.VERCEL) {
  app.addHook("onRequest", async (request) => {
    const currentDb = db;
    if (!currentDb || request.url.startsWith("/health/") || Date.now() - lastOutboxDispatchAt < 5_000 || outboxDispatchInFlight) return;
    lastOutboxDispatchAt = Date.now();
    outboxDispatchInFlight = dispatchOutboxBatch(currentDb, createMongoEventBusPublisher(currentDb), { batchSize: 5 })
      .then((result) => {
        if (result.claimed > 0) app.log.info({ ...result }, "Dispatched bounded outbox batch");
      })
      .catch((error) => {
        app.log.error({ err: error }, "Bounded outbox dispatch failed");
      })
      .finally(() => {
        outboxDispatchInFlight = undefined;
      });
    await outboxDispatchInFlight;
  });
}

// Health routes are registered before database initialization so liveness remains
// observable during Atlas outages; readiness separately reports database state.
app.get("/health/live", async () => ({ status: "ok", service: "zuri-api" }));
app.get("/health/ready", async (_req, reply) => {
  if (!dbReady) return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  if (process.env.VERCEL_ENV === "production" && (!authConfig.jwtSecret || !authConfig.mfaEncryptionKey)) {
    return reply.code(503).send({status:"not_ready",reason:"mac_runtime_secrets_unavailable",missing:["zuri-os-jwt-secret","zuri-os-mfa-encryption-key"]});
  }
  try {
    await db.command({ ping: 1 });
    const hello = await db.command({ hello: 1 });
    if (typeof hello.setName !== "string" || hello.isWritablePrimary !== true || typeof hello.logicalSessionTimeoutMinutes !== "number") {
      return reply.code(503).send({ status: "not_ready", database: "replica_set_required" });
    }
    return { status: "ready", database: "replica_set_connected", transactions: true };
  } catch {
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  }
});

const publicRuntimeConfigHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!dbReady) return reply.code(503).send({ error: "RUNTIME_CONFIG_DATABASE_UNAVAILABLE" });
  const runtime = await readPlatformRuntimeConfig(db);
  const etag = `W/"mac-runtime-${runtime.revision}"`;
  if (request.headers["if-none-match"] === etag) return reply.code(304).header("etag", etag).send();
  return reply
    .header("etag", etag)
    .header("cache-control", "public, max-age=30, stale-while-revalidate=60")
    .send({
      revision: runtime.revision,
      apiOrigins: runtime.apiOrigins,
      publicSettings: {
        ...runtime.publicSettings,
        accessRequestsEnabled: runtime.publicSettings.accessRequestsEnabled ?? authConfig.accessRequestsEnabled,
        privacyNoticeUrl: runtime.publicSettings.privacyNoticeUrl ?? authConfig.accessRequestsPrivacyNoticeUrl ?? null,
      },
    });
};

const internalRuntimeConfigHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  // The database handle exists before the asynchronous connection/index phase completes.
  // Do not attempt a runtime-config read until readiness has been established.
  if (!dbReady) return reply.code(503).send({ error: "RUNTIME_CONFIG_DATABASE_UNAVAILABLE" });
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return reply.code(401).send({ error: "WORKLOAD_IDENTITY_REQUIRED" });
  try {
    const { payload } = await jwtVerify(token, vercelJwks, {
      issuer: teamIssuer,
      audience: teamAudience,
      algorithms: ["RS256"],
    });
    const projectId = typeof payload.project_id === "string" ? payload.project_id : "";
    const expectedProjects: Record<string, string> = {
      "prj_vkIcPCsN1TW3WOturczl3FcWEJkq": "zurios-api",
      "prj_7Ud5L31qXeLoFeguYm75Gje3sZDJ": "zuri-mebumip-api",
    };
    const expectedProject = expectedProjects[projectId];
    const expectedSubject = expectedProject
      ? `owner:${teamSlug}:project:${expectedProject}:environment:production`
      : "";
    if (
      payload.owner_id !== teamId ||
      payload.environment !== "production" ||
      !expectedProject ||
      payload.sub !== expectedSubject
    ) return reply.code(403).send({ error: "WORKLOAD_IDENTITY_NOT_AUTHORIZED" });

    const runtime = await readPlatformRuntimeConfig(db);
    let secrets: Record<string,string> = {};
    const secretVaultEnabled = isMacSecretVaultConfigured() && process.env.VERCEL_ENV === "production";
    if (secretVaultEnabled) {
      const macOidcToken = request.headers["x-vercel-oidc-token"];
      if (typeof macOidcToken !== "string" || !macOidcToken) {
        return reply.code(503).send({ error: "MAC_SECRET_VAULT_OIDC_UNAVAILABLE" });
      }
      try {
        const records = await db.collection<{
          secretId:string; version:number; allowedServices:string[]; environment:string;
          envelope:MacSecretEnvelope; revokedAt?:Date;
        }>("mac_secrets").find({
          environment:"production",
          allowedServices:expectedProject,
          revokedAt:{$exists:false}
        },{projection:{_id:0,secretId:1,version:1,envelope:1}}).toArray();
        const values = await decryptMacSecrets(records,macOidcToken);
        for (const item of values) {
          secrets[item.secretId] = item.value;
        }
        for (const item of values) {
          await writeAuditEvent({
            tenantId:"platform",
            actor:{service:expectedProject},
            action:"platform.mac_secret.accessed",
            resourceType:"mac_secret",
            resourceId:item.secretId,
            outcome:"success",
            metadata:{service:expectedProject,version:item.version}
          });
        }
      } catch (error) {
        request.log.error({code:error instanceof Error?error.name:"UNKNOWN"},"MAC secret delivery failed");
        return reply.code(503).send({error:"MAC_SECRET_DELIVERY_UNAVAILABLE"});
      }
    }
    return reply.header("cache-control", "no-store").send({
      revision: runtime.revision,
      service: expectedProject,
      apiOrigin: expectedProject === "zuri-mebumip-api" ? runtime.apiOrigins.mebumip : runtime.apiOrigins.zuriOs,
      allowedOrigins: runtime.allowedOrigins,
      secrets,
      secretAccess: secretVaultEnabled ? "enabled" : "blocked_until_encryption_kms_is_configured",
    });
  } catch {
    return reply.code(401).send({ error: "WORKLOAD_IDENTITY_INVALID" });
  }
};

app.get("/platform/public/runtime-config", publicRuntimeConfigHandler);
app.get("/v1/platform/public/runtime-config", publicRuntimeConfigHandler);
app.get("/platform/internal/runtime-config", internalRuntimeConfigHandler);
app.get("/v1/platform/internal/runtime-config", internalRuntimeConfigHandler);

await app.register(authRoutes(db, authConfig));
await app.register(platformRoutes(db, authConfig), { prefix: "/v1" });
await app.register(adminRoutes(db, authConfig), { prefix: "/v1" });
await app.register(platformRoutes(db, authConfig));
await app.register(adminRoutes(db, authConfig));

// Begin connection work without holding module evaluation or the HTTP listener.
// Vercel can export the Fastify app immediately; readiness remains false until
// connection and all required indexes have completed successfully.
void initializeDatabase().catch((error: unknown) => {
  app.log.error({ err: error }, "Zuri OS API database initialization failed; liveness remains available and readiness stays false");
});

export default app;

// Vercel owns the HTTP listener for this exported Fastify application.
// Local development starts the listener from src/dev.ts.

const shutdown = async () => {
  outboxAbortController.abort();
  await app.close();
  await outboxWorkerPromise;
  await closeMongo();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
