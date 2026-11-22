import test from "node:test";
import assert from "node:assert/strict";
import { buildMacRuntimeConfigHeaders } from "./runtime-config-client.js";

test("MAC runtime config requests carry both workload identity and Vercel trusted-source proof", () => {
  const token = "short-lived-vercel-oidc-token";
  assert.deepEqual(buildMacRuntimeConfigHeaders(token), {
    authorization: `Bearer ${token}`,
    "x-vercel-trusted-oidc-idp-token": token,
    accept: "application/json",
  });
});
