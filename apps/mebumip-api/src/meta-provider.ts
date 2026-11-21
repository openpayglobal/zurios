import { config } from "./config.js";
import { MetaGraphClient } from "./meta-graph-client.js";
import { MetaTokenVault } from "./meta-token-vault.js";

export function createConfiguredMetaGraphClient(): MetaGraphClient {
  if (!config.META_GRAPH_API_VERSION) throw new Error("META_GRAPH_API_VERSION_REQUIRED");
  return new MetaGraphClient({ version: config.META_GRAPH_API_VERSION });
}

export function createConfiguredMetaTokenVault(): MetaTokenVault {
  if (!config.META_TOKEN_ENCRYPTION_KEYRING || !config.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID) {
    throw new Error("META_TOKEN_VAULT_NOT_CONFIGURED");
  }
  const keyring: unknown = JSON.parse(config.META_TOKEN_ENCRYPTION_KEYRING);
  if (!keyring || typeof keyring !== "object" || Array.isArray(keyring)) throw new Error("META_TOKEN_KEYRING_INVALID");
  return new MetaTokenVault({
    keyring: keyring as Record<string, string>,
    activeKeyId: config.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID,
  });
}

/** Safe operational diagnostics only; never returns app secrets or key material. */
export function getMetaIntegrationReadiness() {
  return {
    appConfigured: Boolean(config.META_APP_ID && config.META_APP_SECRET && config.META_REDIRECT_URI),
    graphApiVersionConfigured: Boolean(config.META_GRAPH_API_VERSION),
    graphApiVersion: config.META_GRAPH_API_VERSION ?? null,
    marketingApiVersionConfigured: Boolean(config.META_MARKETING_API_VERSION),
    marketingApiVersion: config.META_MARKETING_API_VERSION ?? null,
    tokenVaultConfigured: Boolean(config.META_TOKEN_ENCRYPTION_KEYRING && config.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID),
    webhookVerificationConfigured: Boolean(config.META_WEBHOOK_VERIFY_TOKEN),
  };
}
