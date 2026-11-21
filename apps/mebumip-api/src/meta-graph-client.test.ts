import test from "node:test";
import assert from "node:assert/strict";
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
  await assert.rejects(() => client.request("me", { accessToken: token, query: { access_token: "leak" } }), /Authorization header/);
  await assert.rejects(() => client.request("me", { accessToken: token, method: "POST", body: { access_token: "leak" } }), /Authorization header/);
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
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: `Invalid token ${token}`, type: "OAuthException", code: 190 } }), { status: 400 }),
  });
  await assert.rejects(
    () => client.request("me", { accessToken: token }),
    (error: unknown) => error instanceof MetaGraphError && error.providerCode === 190 && !error.message.includes(token) && error.message.includes("[REDACTED]"),
  );
});

test("follows only same-origin, same-version paging URLs and strips embedded access tokens", async () => {
  let requestedUrl = "";
  let authorization = "";
  const client = new MetaGraphClient({
    version: "v27.0",
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  await client.requestNext(`https://graph.facebook.com/v27.0/me/accounts?after=cursor-1&access_token=OLD_TOKEN`, token);
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, "/v27.0/me/accounts");
  assert.equal(url.searchParams.get("after"), "cursor-1");
  assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(authorization, `Bearer ${token}`);
  await assert.rejects(() => client.requestNext("https://evil.example/v27.0/me", token), /Untrusted Meta pagination host/);
  await assert.rejects(() => client.requestNext("https://graph.facebook.com/v26.0/me", token), /version mismatch/);
});

test("requires an explicit valid API version", () => {
  assert.throws(() => new MetaGraphClient({ version: "v27" }), /META_GRAPH_API_VERSION_INVALID/);
  assert.throws(() => new MetaGraphClient({ version: "latest" }), /META_GRAPH_API_VERSION_INVALID/);
});
