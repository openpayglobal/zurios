import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { Db } from "mongodb";

process.env.NODE_ENV = "test";
for (const key of [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_REDIRECT_URI",
  "META_GRAPH_API_VERSION",
  "META_TOKEN_ENCRYPTION_KEYRING",
  "META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID",
]) delete process.env[key];

const { registerMetaRoutes } = await import("./meta-routes.js");

test("tenant Meta read and disconnect routes remain registered when provider configuration is absent", async () => {
  const app = Fastify();
  try {
    registerMetaRoutes(app, {} as Db);
    await app.ready();
    assert.equal(app.hasRoute({ method: "GET", url: "/v1/tenants/:tenantId/meta/connections" }), true);
    assert.equal(app.hasRoute({ method: "GET", url: "/v1/tenants/:tenantId/meta/connections/:connectionId/assets" }), true);
    assert.equal(app.hasRoute({ method: "DELETE", url: "/v1/tenants/:tenantId/meta/connections/:connectionId" }), true);
    assert.equal(app.hasRoute({ method: "POST", url: "/v1/tenants/:tenantId/meta/oauth/start" }), true);
    assert.equal(app.hasRoute({ method: "POST", url: "/v1/tenants/:tenantId/meta/connections/:connectionId/assets/discover" }), true);
  } finally {
    await app.close();
  }
});
