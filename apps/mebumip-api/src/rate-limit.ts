import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Db } from "mongodb";
import { createHash } from "node:crypto";

const POLICIES = [
  { match: (path: string) => path === "/v1/platform/bootstrap", limit: 3, windowMs: 60 * 60_000 },
  { match: (path: string) => path === "/v1/auth/login" || path === "/v1/auth/register", limit: 8, windowMs: 15 * 60_000 },
  { match: (path: string) => path === "/v1/auth/step-up" || path === "/v1/auth/mfa/enable", limit: 8, windowMs: 5 * 60_000 },
  { match: (path: string) => path === "/v1/auth/mfa/setup", limit: 5, windowMs: 60 * 60_000 },
  { match: (path: string) => path.startsWith("/v1/"), limit: 180, windowMs: 60_000 },
] as const;

export function createRateLimitKey(ip: string, path: string, windowStart: number): string {
  const digest = createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 32);
  return createHash("sha256").update(path + ":" + digest + ":" + windowStart).digest("hex");
}
function clientKey(request: FastifyRequest, windowStart: number): string {
  const path = request.routeOptions.url ?? request.url.split("?")[0] ?? "/";
  return createRateLimitKey(request.ip || "unknown", path, windowStart);
}

export function registerDatabaseRateLimit(app: FastifyInstance, db: Db): void {
  app.addHook("preHandler", async (request, reply) => {
    const path = request.routeOptions.url ?? request.url.split("?")[0] ?? "/";
    if (path.startsWith("/health/")) return;
    const policy = POLICIES.find((candidate) => candidate.match(path));
    if (!policy) return;
    const now = Date.now();
    const windowStart = Math.floor(now / policy.windowMs) * policy.windowMs;
    const key = clientKey(request, windowStart);
    const counters = db.collection<{ _id: string; count: number; expiresAt: Date }>("rateLimitCounters");
    await counters.updateOne(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + policy.windowMs * 2) } },
      { upsert: true },
    );
    const counter = await counters.findOne({ _id: key }, { projection: { count: 1 } });
    const remaining = Math.max(0, policy.limit - (counter?.count ?? policy.limit));
    reply.header("x-ratelimit-limit", String(policy.limit));
    reply.header("x-ratelimit-remaining", String(remaining));
    reply.header("x-ratelimit-reset", String(Math.ceil((windowStart + policy.windowMs) / 1000)));
    if ((counter?.count ?? policy.limit) > policy.limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + policy.windowMs - now) / 1000));
      reply.header("retry-after", String(retryAfter));
      return reply.code(429).send({ error: "RATE_LIMITED", retryAfterSeconds: retryAfter, correlationId: request.id });
    }
  });
}
