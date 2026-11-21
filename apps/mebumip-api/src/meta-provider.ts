import { config } from "./config.js";
import { MetaGraphClient } from "./meta-graph-client.js";
import { MetaTokenVault } from "./meta-token-vault.js";

export interface MetaProviderConfig {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_REDIRECT_URI?: string;
  META_GRAPH_API_VERSION?: string;
  META_MARKETING_API_VERSION?: string;
  META_TOKEN_ENCRYPTION_KEYRING?: string;
  META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
}

export function createMetaGraphClient(providerConfig: MetaProviderConfig): MetaGraphClient {
  if (!providerConfig.META_GRAPH_API_VERSION) throw new Error("META_GRAPH_API_VERSION_REQUIRED");
  if (providerConfig.META_APP_ID && !providerConfig.META_APP_SECRET) throw new Error("META_APP_SECRET_REQUIRED");
  if (!providerConfig.META_APP_ID && providerConfig.META_APP_SECRET) throw new Error("META_APP_CONFIGURATION_INCOMPLETE");
  return new MetaGraphClient({
    version: providerConfig.META_GRAPH_API_VERSION,
    ...(providerConfig.META_APP_SECRET ? { appSecret: providerConfig.META_APP_SECRET } : {}),
    requireAppSecretProof: Boolean(providerConfig.META_APP_ID),
  });
}

export function createMetaTokenVault(providerConfig: MetaProviderConfig): MetaTokenVault {
  if (!providerConfig.META_TOKEN_ENCRYPTION_KEYRING || !providerConfig.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID) {
    throw new Error("META_TOKEN_VAULT_NOT_CONFIGURED");
  }
  const keyring: unknown = JSON.parse(providerConfig.META_TOKEN_ENCRYPTION_KEYRING);
  if (!keyring || typeof keyring !== "object" || Array.isArray(keyring)) throw new Error("META_TOKEN_KEYRING_INVALID");
  return new MetaTokenVault({
    keyring: keyring as Record<string, string>,
    activeKeyId: providerConfig.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID,
  });
}

export function createConfiguredMetaGraphClient(): MetaGraphClient {
  return createMetaGraphClient(config);
}

export function createConfiguredMetaTokenVault(): MetaTokenVault {
  return createMetaTokenVault(config);
}

/** Safe operational diagnostics only; never returns app secrets or key material. */
export function getMetaIntegrationReadiness(providerConfig: MetaProviderConfig = config) {
  return {
    appConfigured: Boolean(providerConfig.META_APP_ID && providerConfig.META_APP_SECRET && providerConfig.META_REDIRECT_URI),
    graphApiVersionConfigured: Boolean(providerConfig.META_GRAPH_API_VERSION),
    graphApiVersion: providerConfig.META_GRAPH_API_VERSION ?? null,
    marketingApiVersionConfigured: Boolean(providerConfig.META_MARKETING_API_VERSION),
    marketingApiVersion: providerConfig.META_MARKETING_API_VERSION ?? null,
    appSecretProofConfigured: Boolean(providerConfig.META_APP_ID && providerConfig.META_APP_SECRET),
    tokenVaultConfigured: Boolean(providerConfig.META_TOKEN_ENCRYPTION_KEYRING && providerConfig.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID),
    webhookVerificationConfigured: Boolean(providerConfig.META_WEBHOOK_VERIFY_TOKEN),
  };
}
