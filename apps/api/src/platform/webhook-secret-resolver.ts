import type {WebhookSecretResolver} from "@zuri/core-platform";

/**
 * Environment-backed bootstrap resolver for deployments that inject secrets
 * through a managed runtime secret store. Persist only env:// references in
 * MongoDB; never persist the resolved secret value.
 */
export function createEnvironmentWebhookSecretResolver(
  environment: Record<string,string|undefined> = process.env
): WebhookSecretResolver {
  return async (secretRef: string) => {
    const match = /^env:\/\/(ZURI_WEBHOOK_SECRET_[A-Z0-9_]{1,100})$/.exec(secretRef);
    const variableName = match?.[1];
    if (!variableName) throw new Error("WEBHOOK_SECRET_REFERENCE_NOT_ALLOWED");
    const secret = environment[variableName];
    if (!secret) throw new Error("WEBHOOK_SECRET_NOT_CONFIGURED");
    if (secret.length < 32) throw new Error("WEBHOOK_SIGNING_SECRET_TOO_SHORT");
    return secret;
  };
}
