import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { MongoClient } from "mongodb";
import { config, corsOrigins } from "./config.js";
import { registerAuthRoutes } from "./auth.js";
import { registerAdminRoutes } from "./admin.js";
import { ensureMeBuMIPIndexes } from "./database.js";
import { registerDatabaseRateLimit } from "./rate-limit.js";
import { registerTenantMemberRoutes } from "./tenant-members.js";
import { registerCustomerWorkflowRoutes } from "./customer-workflow.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576, trustProxy: config.TRUSTED_PROXY_CIDRS ? config.TRUSTED_PROXY_CIDRS.split(",").map((value) => value.trim()).filter(Boolean) : false, genReqId: (request) => {
  const supplied = request.headers["x-correlation-id"];
  return typeof supplied === "string" && /^[a-zA-Z0-9._-]{8,100}$/.test(supplied)
    ? supplied
    : randomUUID();
} });
let mongo: MongoClient | undefined;
let databaseReady = false;

await app.register(helmet);
await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "authorization", "x-correlation-id", "x-csrf-token"],
  exposedHeaders: ["X-Audit-Archive-SHA256", "X-Audit-Archive-Object-Key", "X-Audit-Archive-Status"],
});

app.get("/health/live", async () => ({
  status: "ok",
  service: "zuri-mebumip-api",
  environment: config.NODE_ENV,
}));

app.get("/health/ready", async (_request, reply) => {
  if (!config.MONGODB_URI) {
    return reply.code(503).send({ status: "not_ready", reason: "database_not_configured" });
  }
  if (!databaseReady) {
    return reply.code(503).send({ status: "not_ready", reason: "database_unavailable" });
  }
  return { status: "ready", database: "connected" };
});

// All application routes are registered only after MongoDB indexes are ready.
// Authenticated tenant-membership routes enforce active membership, role permissions
// and recent MFA step-up on sensitive mutations. Meta product routes remain disabled
// until provider-specific token, webhook, consent and audit controls are implemented.
app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({ error: "NOT_FOUND", correlationId: reply.request.id });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, correlationId: request.id }, "Unhandled API error");
  return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", correlationId: request.id });
});

if (config.MONGODB_URI) {
  mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  try {
    await mongo.connect();
    const db = mongo.db(config.MONGODB_DATABASE);
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    registerDatabaseRateLimit(app, db);
    registerAuthRoutes(app, db);
    registerTenantMemberRoutes(app, db);
    registerCustomerWorkflowRoutes(app, db);
    registerAdminRoutes(app, db);
    databaseReady = true;
    app.log.info("MeBuMIP database connection and foundation indexes established");
  } catch (error) {
    app.log.error({ err: error }, "Database initialization unavailable; API will remain unready");
  }
} else {
  app.log.warn("MONGODB_URI is not configured; readiness will remain unavailable");
}

await app.listen({ host: config.API_HOST, port: config.API_PORT });

const shutdown = async () => {
  await app.close();
  if (mongo) await mongo.close();
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
