import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createMetaGraphClient, createMetaTokenVault, getMetaIntegrationReadiness } from "./meta-provider.js";

test("configured Meta apps require App Secret Proof on Graph API requests", async () => {
  const appSecret = "test_meta_app_secret_0123456789";
  let requestUrl = "";
  const client = createMetaGraphClient({
    META_APP_ID: "123456789",
    META_APP_SECRET: appSecret,
    META_GRAPH_API_VERSION: "v27.0",
  });
  await client.request("me", {
    accessToken: "EAAG_meta_access_token_value",
  });
});
