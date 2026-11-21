import type { FastifyInstance } from "fastify";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { config } from "./config.js";
import { resolvePrincipal } from "./auth.js";
import { hasTenantPermission } from "./security.js";
import { MetaOAuthService, META_PAGES_INSTAGRAM_SCOPES, type MetaOAuthScope } from "./meta-oauth.js";
import { MetaGraphClient } from "./meta-graph-client.js";
import { MetaOAuthStateService } from "./meta-oauth-state.js";
import { MetaTokenVault } from "./meta-token-vault.js";
import { createMetaConnection, getMetaAccessToken, listMetaConnections, revokeMetaConnection } from "./meta-connections.js";
import { discoverMetaPages, listMetaPageAssets } from "./meta-assets.js";

const scopeValues = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
] as const;

const startSchema = z.object({
  scopes: z.array(z.enum(scopeValues)).min(1).max(20).optional(),
}).strict();

const callbackSchema = z.object({
  state: z.string().min(32).max(128),
  code: z.string().min(8).max(4096).optional(),
  error: z.string().max(128).optional(),
  error_description: z.string().max(2048).optional(),
  error_reason: z.string().max(128).optional(),
  error_code: z.string().max(32).optional(),
}).passthrough().refine((value) => Boolean(value.code) !== Boolean(value.error), {
  message: "Exactly one of code or provider error is required",
});

export interface MetaRouteDependencies { fetchImpl?: typeof fetch; }

function configuredServices(dependencies: MetaRouteDependencies) {
  if (!config.META_APP_ID || !config.META_APP_SECRET || !config.META_REDIRECT_URI ||
      !config.META_GRAPH_API_VERSION || !config.META_TOKEN_ENCRYPTION_KEYRING ||
      !config.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID) return null;
  const keyring = JSON.parse(config.META_TOKEN_ENCRYPTION_KEYRING) as Record<string, string>;
  const allowInsecureLocalhost = config.NODE_ENV !== "production";
  return {
    oauth: new MetaOAuthService({
      appId: config.META_APP_ID,
      appSecret: config.META_APP_SECRET,
      version: config.META_GRAPH_API_VERSION,
      redirectUri: config.META_REDIRECT_URI,
      allowInsecureLocalhost,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
      ...(config.META_LOGIN_CONFIG_ID ? { loginConfigId: config.META_LOGIN_CONFIG_ID } : {}),
    }),
    graph: new MetaGraphClient({
      version: config.META_GRAPH_API_VERSION,
      appSecret: config.META_APP_SECRET,
      requireAppSecretProof: true,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    }),
    vault: new MetaTokenVault({ keyring, activeKeyId: config.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID }),
    redirectUri: config.META_REDIRECT_URI,
    allowInsecureLocalhost,
  };
}

function frontendReturnUrl(status: string, tenantId: string, connectionId?: string): string | null {
  const origin = config.CORS_ORIGINS.split(",").map((value) => value.trim()).find(Boolean);
  if (!origin) return null;
  const target = new URL("/", origin);
  target.searchParams.set("section", "connections");
  target.searchParams.set("meta_connection", status);
  target.searchParams.set("tenantId", tenantId);
  if (connectionId) target.searchParams.set("connectionId", connectionId);
  return target.toString();
}

function isBrowserNavigation(request: { headers: { accept: string | string[] | undefined } }): boolean {
  return typeof request.headers.accept === "string" && request.headers.accept.includes("text/html");
}

function hasRecentStepUp(stepUpUntil: Date | undefined): boolean {
  return stepUpUntil instanceof Date && stepUpUntil.getTime() > Date.now();
}

/**
 * Meta connection routes are deliberately absent unless the complete provider and
 * token-vault configuration is present. No route accepts or returns provider tokens.
 */
export function registerMetaRoutes(app: FastifyInstance, db: Db, dependencies: MetaRouteDependencies = {}): void {
  const configured = configuredServices(dependencies);
  if (!configured) {
    app.log.info("Meta integration routes disabled: provider and token-vault configuration is incomplete");
    return;
  }
  const states = new MetaOAuthStateService(db, {
    redirectUri: configured.redirectUri,
    allowInsecureLocalhost: configured.allowInsecureLocalhost,
  });
  const { oauth, graph, vault } = configured;

  app.addHook("onRequest", async (request, reply) => {
    if ((request.routeOptions.url ?? "").includes("/meta/")) {
      reply.header("cache-control", "no-store, max-age=0");
      reply.header("pragma", "no-cache");
      reply.header("referrer-policy", "no-referrer");
    }
  });

  app.post("/v1/tenants/:tenantId/meta/oauth/start", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId } = request.params as { tenantId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "meta:connections:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!hasRecentStepUp(resolved.stepUpUntil)) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const parsed = startSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", details: parsed.error.flatten() });
    const scopes = [...new Set(parsed.data.scopes ?? META_PAGES_INSTAGRAM_SCOPES)] as MetaOAuthScope[];
    // Preflight validates scopes and provider configuration before creating a persisted state.
    oauth.buildAuthorizationUrl({ state: "A".repeat(43), scopes });
    const context = {
      tenantId,
      userId: resolved.principal.userId,
      sessionId: String(resolved.sessionId),
      redirectUri: configured.redirectUri,
      requestedScopes: scopes,
    };
    const created = await states.create(context, request.id);
    const authorizationUrl = oauth.buildAuthorizationUrl({ state: created.state, scopes });
    return reply.code(200).send({ authorizationUrl, expiresAt: created.expiresAt.toISOString() });
  });

  app.get("/v1/meta/oauth/callback", async (request, reply) => {
    const parsed = callbackSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_OAUTH_CALLBACK" });
    const pending = await states.getPendingContext(parsed.data.state);
    if (!pending) return reply.code(400).send({ error: "OAUTH_STATE_INVALID_OR_EXPIRED" });
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    if (pending.userId !== resolved.principal.userId || pending.sessionId !== String(resolved.sessionId)) {
      return reply.code(403).send({ error: "OAUTH_SESSION_MISMATCH" });
    }
    if (!hasTenantPermission(resolved.principal, pending.tenantId, "meta:connections:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!hasRecentStepUp(resolved.stepUpUntil)) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    const consumed = await states.consume(parsed.data.state, {
      tenantId: pending.tenantId,
      userId: pending.userId,
      sessionId: pending.sessionId,
    }, request.id);
    if (!consumed) return reply.code(400).send({ error: "OAUTH_STATE_INVALID_OR_EXPIRED" });
    if (parsed.data.error) {
      const returnUrl = isBrowserNavigation(request) ? frontendReturnUrl("denied", pending.tenantId) : null;
      if (returnUrl) return reply.redirect(returnUrl, 303);
      return reply.code(400).send({ error: "META_AUTHORIZATION_DENIED" });
    }

    try {
      const requiredScopes = (pending.requestedScopes ?? META_PAGES_INSTAGRAM_SCOPES) as MetaOAuthScope[];
      const shortLived = await oauth.exchangeAuthorizationCodeAndValidate(parsed.data.code!, requiredScopes);
      const longLived = await oauth.exchangeLongLivedTokenAndValidate(shortLived.accessToken, requiredScopes);
      const connection = await createMetaConnection(db, vault, {
        tenantId: pending.tenantId,
        actorUserId: pending.userId,
        providerUserId: longLived.identity.userId,
        accessToken: longLived.accessToken,
        grantedScopes: longLived.identity.scopes,
        ...(longLived.identity.expiresAt ? { expiresAt: longLived.identity.expiresAt } : {}),
        ...(longLived.identity.dataAccessExpiresAt ? { dataAccessExpiresAt: longLived.identity.dataAccessExpiresAt } : {}),
        correlationId: request.id,
      });
      const returnUrl = isBrowserNavigation(request) ? frontendReturnUrl("connected", pending.tenantId, connection.connectionId) : null;
      if (returnUrl) return reply.redirect(returnUrl, 303);
      return reply.code(201).send({ status: "connected", connection });
    } catch (error) {
      if (error instanceof Error && error.message === "META_CONNECTION_ALREADY_EXISTS") {
        return reply.code(409).send({ error: "META_CONNECTION_ALREADY_EXISTS" });
      }
      request.log.warn({
        errorName: error instanceof Error ? error.name : "UnknownError",
        providerStatus: error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : undefined,
        correlationId: request.id,
      }, "Meta OAuth callback failed");
      const returnUrl = isBrowserNavigation(request) ? frontendReturnUrl("failed", pending.tenantId) : null;
      if (returnUrl) return reply.redirect(returnUrl, 303);
      return reply.code(502).send({ error: "META_CONNECTION_FAILED", correlationId: request.id });
    }
  });

  app.get("/v1/tenants/:tenantId/meta/connections", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId } = request.params as { tenantId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "meta:connections:read")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    return reply.send({ items: await listMetaConnections(db, tenantId) });
  });

  app.get("/v1/tenants/:tenantId/meta/connections/:connectionId/assets", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId, connectionId } = request.params as { tenantId: string; connectionId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "social:assets:read")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    const connection = await db.collection("metaConnections").findOne({ tenantId, connectionId });
    if (!connection) return reply.code(404).send({ error: "META_CONNECTION_NOT_FOUND" });
    return reply.send({ items: await listMetaPageAssets(db, tenantId, connectionId) });
  });

  app.post("/v1/tenants/:tenantId/meta/connections/:connectionId/assets/discover", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId, connectionId } = request.params as { tenantId: string; connectionId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "social:assets:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!hasRecentStepUp(resolved.stepUpUntil)) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    try {
      const result = await discoverMetaPages(db, vault, graph, {
        tenantId,
        connectionId,
        actorUserId: resolved.principal.userId,
        correlationId: request.id,
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === "META_CONNECTION_NOT_FOUND") return reply.code(404).send({ error: "META_CONNECTION_NOT_FOUND" });
      if (error instanceof Error && error.message === "META_CONNECTION_TOKEN_EXPIRED") return reply.code(409).send({ error: "META_CONNECTION_TOKEN_EXPIRED" });
      if (error instanceof Error && error.message === "META_CONNECTION_DATA_ACCESS_EXPIRED") return reply.code(409).send({ error: "META_CONNECTION_DATA_ACCESS_EXPIRED" });
      request.log.warn({
        errorName: error instanceof Error ? error.name : "UnknownError",
        providerStatus: error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : undefined,
        correlationId: request.id,
      }, "Meta Page discovery failed");
      return reply.code(502).send({ error: "META_ASSET_DISCOVERY_FAILED", correlationId: request.id });
    }
  });

  app.delete("/v1/tenants/:tenantId/meta/connections/:connectionId", async (request, reply) => {
    const resolved = await resolvePrincipal(db, request);
    if (!resolved) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const { tenantId, connectionId } = request.params as { tenantId: string; connectionId: string };
    if (!ObjectId.isValid(tenantId) || !hasTenantPermission(resolved.principal, tenantId, "meta:connections:write")) {
      return reply.code(403).send({ error: "TENANT_ACCESS_DENIED" });
    }
    if (!hasRecentStepUp(resolved.stepUpUntil)) return reply.code(403).send({ error: "STEP_UP_REQUIRED", action: "POST /v1/auth/step-up" });
    let remoteRevocation: "succeeded" | "failed" | "not_attempted" = "not_attempted";
    try {
      const connection = await db.collection<{ providerUserId: string }>("metaConnections")
        .findOne({ tenantId, connectionId, status: "connected" }, { projection: { providerUserId: 1 } });
      if (!connection) return reply.code(404).send({ error: "META_CONNECTION_NOT_FOUND" });
      const accessToken = await getMetaAccessToken(db, vault, tenantId, connectionId);
      const result = await graph.request<{ success?: boolean } | boolean>(`${connection.providerUserId}/permissions`, {
        accessToken,
        method: "DELETE",
        retry: false,
      });
      remoteRevocation = result === true || (typeof result === "object" && result.success === true) ? "succeeded" : "failed";
    } catch (error) {
      if (error instanceof Error && error.message === "META_CONNECTION_NOT_FOUND") return reply.code(404).send({ error: "META_CONNECTION_NOT_FOUND" });
      if (error instanceof Error && (error.message === "META_CONNECTION_TOKEN_EXPIRED" || error.message === "META_CONNECTION_DATA_ACCESS_EXPIRED")) {
        remoteRevocation = "not_attempted";
      } else {
        remoteRevocation = "failed";
        request.log.warn({
          errorName: error instanceof Error ? error.name : "UnknownError",
          providerStatus: error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : undefined,
          correlationId: request.id,
        }, "Meta remote permission revocation failed; local token will still be erased");
      }
    }
    await revokeMetaConnection(db, tenantId, connectionId, resolved.principal.userId, request.id, remoteRevocation);
    return reply.code(200).send({ status: "disconnected", remoteRevocation });
  });
}
