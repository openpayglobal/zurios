import test from "node:test";
import assert from "node:assert/strict";
import {createEnvironmentWebhookSecretResolver} from "./webhook-secret-resolver.js";

test("environment webhook resolver resolves only explicitly prefixed secret references",async()=>{
  const resolve=createEnvironmentWebhookSecretResolver({ZURI_WEBHOOK_SECRET_CARRIER_A:"a".repeat(48)});
  assert.equal(await resolve("env://ZURI_WEBHOOK_SECRET_CARRIER_A"),"a".repeat(48));
  await assert.rejects(()=>resolve("env://JWT_SECRET"),/WEBHOOK_SECRET_REFERENCE_NOT_ALLOWED/);
  await assert.rejects(()=>resolve("https://vault.example/secret/1"),/WEBHOOK_SECRET_REFERENCE_NOT_ALLOWED/);
});
test("environment webhook resolver fails closed for missing and short secrets",async()=>{
  const resolve=createEnvironmentWebhookSecretResolver({ZURI_WEBHOOK_SECRET_SHORT:"short"});
  await assert.rejects(()=>resolve("env://ZURI_WEBHOOK_SECRET_MISSING"),/WEBHOOK_SECRET_NOT_CONFIGURED/);
  await assert.rejects(()=>resolve("env://ZURI_WEBHOOK_SECRET_SHORT"),/WEBHOOK_SIGNING_SECRET_TOO_SHORT/);
});
