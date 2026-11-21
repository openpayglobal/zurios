import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { config, corsOrigins } from "./config.js";
import { connectMongo, closeMongo } from "./database.js";
import { registerAuthRoutes } from "./auth.js";
import { registerAdminRoutes } from "./admin.js";
import { registerTenantMemberRoutes } from "./tenant-members.js";
import { registerCustomerWorkflowRoutes } from "./customer-workflow.js";
import { registerInfrastructureRoutes } from "./infrastructure.js";
import { getMacRuntimeConfig } from "./runtime-config-client.js";
import { registerAuthHooks } from "./security.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
let db: Awaited<ReturnType<typeof connectMongo>> | undefined;

await app.register(helmet);
try {
  db = await connectMongo();
  const initialRuntime = await getMacRuntimeConfig().catch((error) => {
    app.log.warn({ err: error }, "MAC runtime config unavailable; using bootstrap CORS origins");
    return null;
  });
  let allowedOriginsCache = initialRuntime?.allowedOrigins ?? corsOrigins;
  let allowedOriginsCacheAt = Date.now();
  let lastRuntimeRefreshAt = 0;

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (Date.now() - allowedOriginsCacheAt > 5_000) {
        allowedOriginsCacheAt = Date.now();
        void getMacRuntimeConfig(true).then((runtime) => {
          if (runtime) allowedOriginsCache = runtime.allowedOrigins;
        }).catch((error) => {
          app.log.warn({ err: error }, "MAC origin refresh failed; retaining last known-good origin list");
        });
      }
      callback(null, allowedOriginsCache.includes(origin));
    },
    credentials: true,
  });

  app.addHook("preHandler", async (request) => {
    if (Date.now() - lastRuntimeRefreshAt <= 5_000) return;
    lastRuntimeRefreshAt = Date.now();
    const oidcHeader = request.headers["x-vercel-oidc-token"];
    const runtime = await getMacRuntimeConfig(true, typeof oidcHeader === "string" ? oidcHeader : undefined).catch((error) => {
      app.log.warn({ err: error }, "MAC runtime refresh unavailable; retaining last known-good settings");
      return null;
    });
    if (runtime) {
      allowedOriginsCache = runtime.allowedOrigins;
      allowedOriginsCacheAt = Date.now();
    }
  });

  app.get("/health/live", async () => ({ status: "ok", service: "mebumip-api" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await db!.command({ ping: 1 });
      const hello = await db!.command({ hello: 1 });
      if (typeof hello.setName !== "string" || hello.isWritablePrimary !== true || typeof hello.logicalSessionTimeoutMinutes !== "number") {
        return reply.code(503).send({ status: "not_ready", database: "replica_set_required" });
      }
      return { status: "ready", database: "replica_set_connected", transactions: true };
    } catch {
      return reply.code(503).send({ status: "not_ready", database: "unavailable" });
    }
  });

  registerAuthHooks(app, db);
  registerAuthRoutes(app, db);
  registerAdminRoutes(app, db);
  registerTenantMemberRoutes(app, db);
  registerCustomerWorkflowRoutes(app, db);
  registerInfrastructureRoutes(app, db);

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

const shutdown = async () => {
  await app.close();
  await closeMongo();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
