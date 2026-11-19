import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { MongoClient } from "mongodb";
import { config, corsOrigins } from "./config.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
let mongo: MongoClient | undefined;
let databaseReady = false;

await app.register(helmet);
await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

// No tenant or Meta resource endpoints are exposed until authentication,
// tenant resolution, authorization and audit middleware are implemented.
app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({ error: "NOT_FOUND" });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Unhandled API error");
  return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR" });
});

if (config.MONGODB_URI) {
  mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  try {
    await mongo.connect();
    await mongo.db(config.MONGODB_DATABASE).command({ ping: 1 });
    databaseReady = true;
    app.log.info("MeBuMIP database connection established");
  } catch (error) {
    app.log.error({ err: error }, "Database connection unavailable; API will remain unready");
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