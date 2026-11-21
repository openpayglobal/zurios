import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MetaGraphClient, MetaGraphError } from "./meta-graph-client.js";

const token = "EAA_test_secret_token_value";

test("pins every Graph API request to the explicit version and sends the token only as a bearer header", async () => {
  let requestedUrl = "";
  let authorization = "";
  const client = new MetaGraphClient({
    version: "v27.0",
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ id: "page-1" }), { status: 200 });
    },
  });
  const result = await client.request<{ id: string }>("me/accounts", {
    accessToken: token,
    query: { fields: "id,name", limit: 25 },
  });
  assert.deepEqual(result, { id: "page-1" });
  assert.equal(new URL(requestedUrl).pathname, "/v27.0/me/accounts");
  assert.equal(new URL(requestedUrl).searchParams.get("fields"), "id,name");
  assert.equal(new URL(requestedUrl).searchParams.has("access_token"), false);
  assert.equal(requestedUrl.includes(token), false);
  assert.equal(authorization, `Bearer ${token}`);
});

test("rejects unversioned, traversal and absolute request paths", async () => {
  const client = new MetaGraphClient({ version: "v27.0", fetchImpl: async () => new Response("{}", { status: 200 }) });
  await assert.rejects(() => client.request("../me", { accessToken: token }), MetaGraphError);
  await assert.rejects(() => client.request("https://attacker.example/me", { accessToken: token }), MetaGraphError);
  await assert.rejects(() => client.request("v27.0/me", { accessToken: token }), /Do not include the API version/);
  await assert.rejects(() => client.request("me", { accessToken: token, query: { access_token: "leak" } }), /Credential parameters are managed/);
  await assert.rejects(() => client.request("me", { accessToken: token, method: "POST", body: { access_token: "leak" } }), /Authorization header/);
});

test("adds Meta app secret proof without exposing the access token in the URL", async () => {
  const appSecret = "test_meta_app_secret_0123456789";
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const client = new MetaGraphClient({
    version: "v27.0",
    appSecret,
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ id: "page-1" }), { status: 200 });
    },
  });
  await client.request("me", { accessToken: token });
  const url = new URL(requestedUrl);
  const expectedProof = createHmac("sha256", appSecret).update(token).digest("hex");
  assert.equal(url.searchParams.get("appsecret_proof"), expectedProof);
  assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(requestedUrl.includes(token), false);
  assert.equal(new Headers(requestInit?.headers).get("authorization"), `Bearer ${token}`);
  assert.equal(requestInit?.redirect, "error");
  assert.equal(requestInit?.credentials, "omit");
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(requestInit?.referrerPolicy, "no-referrer");
});

test("requires an app secret when App Secret Proof is mandatory and rejects caller-supplied proof", async () => {
  assert.throws(() => new MetaGraphClient({ version: "v27.0", requireAppSecretProof: true }), /META_APP_SECRET_PROOF_REQUIRED/);
  const client = new MetaGraphClient({ version: "v27.0", appSecret: "test_meta_app_secret_0123456789", fetchImpl: async () => new Response("{}", { status: 200 }) });
  await assert.rejects(() => client.request("me", { accessToken: token, query: { appsecret_proof: "caller-value" } }), /Credential parameters are managed/);
  await assert.rejects(() => client.request("me", { accessToken: token, method: "POST", body: { appsecret_proof: "caller-value" } }), /Credential parameters are managed/);
});

test("retries transient GET rate limits and respects Retry-After", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const client = new MetaGraphClient({
    version: "v27.0",
    maxRetries: 2,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ error: { message: "rate limited", is_transient: true } }), {
        status: 429, headers: { "retry-after": "2" },
      });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  const result = await client.request<{ data: unknown[] }>("me/accounts", { accessToken: token });
  assert.deepEqual(result, { data: [] });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
});

test("retries Meta provider throttling codes on GET without retrying mutations", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const client = new MetaGraphClient({
    version: "v27.0",
    maxRetries: 1,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ error: { message: "application throttled", code: 4 } }), { status: 400 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.deepEqual(await client.request("me/accounts", { accessToken: token }), { data: [] });
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [250]);
});

test("retries invalid JSON 5xx responses only for safe GET requests", async () => {
  let calls = 0;
  const client = new MetaGraphClient({
    version: "v27.0",
    maxRetries: 1,
    sleep: async () => undefined,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("upstream unavailable", { status: 503 })
        : new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.deepEqual(await client.request("me/accounts", { accessToken: token }), { data: [] });
  assert.equal(calls, 2);
});

test("does not automatically retry side-effecting POST requests", async () => {
  let calls = 0;
  const client = new MetaGraphClient({
    version: "v27.0",
    maxRetries: 5,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "temporary failure", is_transient: true } }), { status: 503 });
    },
  });
  await assert.rejects(() => client.request("me/feed", { accessToken: token, method: "POST", body: { message: "hello" } }), MetaGraphError);
  assert.equal(calls, 1);
});

test("redacts the bearer token from provider error messages", async () => {
  const client = new MetaGraphClient({
    version: "v27.0",
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: `Invalid token ${token}; appsecret_proof=secret-proof-value`, type: "OAuthException", code: 190 } }), { status: 400 }),
  });
  await assert.rejects(
    () => client.request("me", { accessToken: token }),
    (error: unknown) => error instanceof MetaGraphError && error.providerCode === 190 && !error.message.includes(token) && !error.message.includes("secret-proof-value") && error.message.includes("[REDACTED]"),
  );
});

test("follows only same-origin, same-version paging URLs and strips embedded access tokens", async () => {
  let requestedUrl = "";
  let authorization = "";
  const appSecret = "test_meta_app_secret_0123456789";
  const client = new MetaGraphClient({
    version: "v27.0",
    appSecret,
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  await client.requestNext(`https://graph.facebook.com/v27.0/me/accounts?after=cursor-1&access_token=OLD_TOKEN&appsecret_proof=OLD_PROOF`, token);
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, "/v27.0/me/accounts");
  assert.equal(url.searchParams.get("after"), "cursor-1");
  assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(url.searchParams.get("appsecret_proof"), createHmac("sha256", appSecret).update(token).digest("hex"));
  assert.notEqual(url.searchParams.get("appsecret_proof"), "OLD_PROOF");
  assert.equal(authorization, `Bearer ${token}`);
  await assert.rejects(() => client.requestNext("https://evil.example/v27.0/me", token), /Untrusted Meta pagination host/);
  await assert.rejects(() => client.requestNext("https://graph.facebook.com/v26.0/me", token), /version mismatch/);
});

test("requires an explicit valid API version", () => {
  assert.throws(() => new MetaGraphClient({ version: "v27" }), /META_GRAPH_API_VERSION_INVALID/);
  assert.throws(() => new MetaGraphClient({ version: "latest" }), /META_GRAPH_API_VERSION_INVALID/);
});
