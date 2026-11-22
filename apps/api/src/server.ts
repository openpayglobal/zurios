import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, corsOrigins } from "./config.js";
import { connectMongo, closeMongo } from "./db/mongo.js";
import { authRoutes } from "./platform/auth-routes.js";
import { platformRoutes } from "./platform/platform-routes.js";
import { adminRoutes } from "./platform/admin-routes.js";
import { readPlatformRuntimeConfig } from "./platform/runtime-config-store.js";
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
let db: Db | undefined;
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
  jwtSecret: config.JWT_SECRET,
  accessTokenTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  sessionTtlSeconds: config.SESSION_TTL_SECONDS,
  mfaEncryptionKey: config.MFA_ENCRYPTION_KEY ?? "",
  accessRequestsEnabled: config.ACCESS_REQUESTS_ENABLED === "true",
  accessRequestsPrivacyNoticeUrl: config.ACCESS_REQUESTS_PRIVACY_NOTICE_URL,
};

// CORS uses the last known MAC-approved origin list. Before Atlas connects, only
// the deployment's explicit bootstrap list is available.
const isAllowedOrigin = async (origin: string): Promise<boolean> => {
  if (db && Date.now() - allowedOriginsCacheAt > 5_000) {
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
  if (!db) return reply.code(503).send({ status: "not_ready", database: "unavailable" });
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
  if (!db) return reply.code(503).send({ error: "RUNTIME_CONFIG_DATABASE_UNAVAILABLE" });
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
  if (!db) return reply.code(503).send({ error: "RUNTIME_CONFIG_DATABASE_UNAVAILABLE" });
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
    return reply.header("cache-control", "no-store").send({
      revision: runtime.revision,
      service: expectedProject,
      apiOrigin: expectedProject === "zuri-mebumip-api" ? runtime.apiOrigins.mebumip : runtime.apiOrigins.zuriOs,
      allowedOrigins: runtime.allowedOrigins,
      privateSettings: {},
      secretAccess: "blocked_until_encryption_kms_is_configured",
    });
  } catch {
    return reply.code(401).send({ error: "WORKLOAD_IDENTITY_INVALID" });
  }
};

app.get("/platform/public/runtime-config", publicRuntimeConfigHandler);
app.get("/v1/platform/public/runtime-config", publicRuntimeConfigHandler);
app.get("/platform/internal/runtime-config", internalRuntimeConfigHandler);
app.get("/v1/platform/internal/runtime-config", internalRuntimeConfigHandler);

try {
  db = await connectMongo();
  await app.register(authRoutes(db, authConfig));
  await app.register(platformRoutes(db, authConfig), { prefix: "/v1" });
  await app.register(adminRoutes(db, authConfig), { prefix: "/v1" });
  await app.register(platformRoutes(db, authConfig));
  await app.register(adminRoutes(db, authConfig));
  if (!process.env.VERCEL) {
    outboxWorkerPromise = runOutboxWorker(db, createMongoEventBusPublisher(db), outboxAbortController.signal).catch((error) => {
      app.log.error({ err: error }, "Platform outbox worker stopped unexpectedly");
    });
  }
  app.log.info("Zuri OS API database and routes initialized");
} catch (error) {
  app.log.error({ err: error }, "Zuri OS API database initialization failed; liveness remains available and readiness stays false");
}

await app.listen({ host: config.API_HOST, port: config.API_PORT });

const shutdown = async () => {
  outboxAbortController.abort();
  await app.close();
  await outboxWorkerPromise;
  await closeMongo();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
