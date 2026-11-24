import { getVercelOidcToken } from "@vercel/oidc";

export type MacRuntimeConfig = {
  revision: number;
  service: "zuri-mebumip-api";
  apiOrigin: string;
  allowedOrigins: string[];
  secrets: Record<string,string>;
  secretAccess: "enabled" | "blocked_until_encryption_kms_is_configured";
};

const MEBUMIP_SECRET_IDS = [
  "resend-api-key",
  "mail-from",
  "mebumip-mfa-encryption-key",
  "mfa-encryption-keyring",
  "mfa-encryption-active-key-id",
  "mebumip-audit-signing-key",
  "audit-signing-keyring",
  "audit-signing-active-key-id",
] as const;

const MAC_RUNTIME_CONFIG_HOST = "zurios-api-openpayglobal-5300s-projects.vercel.app";
const MAC_RUNTIME_CONFIG_PATH = "/platform/internal/runtime-config";
const DEFAULT_MAC_RUNTIME_CONFIG_URL = `https://${MAC_RUNTIME_CONFIG_HOST}${MAC_RUNTIME_CONFIG_PATH}`;

function isExactHttpsOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;
  } catch {
    return false;
  }
}

/** Pin the identity-bearing request to MAC's approved host and exact endpoint. */
export function validateMacRuntimeConfigUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 1024) {
    throw new Error("MAC_RUNTIME_CONFIG_URL_INVALID");
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== MAC_RUNTIME_CONFIG_HOST ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== MAC_RUNTIME_CONFIG_PATH ||
      url.search !== "" ||
      url.hash !== "" ||
      url.href !== value
    ) {
      throw new Error("MAC_RUNTIME_CONFIG_URL_INVALID");
    }
    return url.href;
  } catch {
    throw new Error("MAC_RUNTIME_CONFIG_URL_INVALID");
  }
}

/** Validate the entire control-plane response before any runtime state is changed. */
export function validateMacRuntimeConfig(value: unknown): MacRuntimeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MAC_RUNTIME_CONFIG_INVALID");
  }
  const body = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(body.revision) ||
    (body.revision as number) < 0 ||
    body.service !== "zuri-mebumip-api" ||
    !isExactHttpsOrigin(body.apiOrigin) ||
    !Array.isArray(body.allowedOrigins) ||
    body.allowedOrigins.length < 1 ||
    body.allowedOrigins.length > 20 ||
    !body.allowedOrigins.every(isExactHttpsOrigin) ||
    new Set(body.allowedOrigins).size !== body.allowedOrigins.length ||
    (body.secretAccess !== "enabled" &&
      body.secretAccess !== "blocked_until_encryption_kms_is_configured")
  ) {
    throw new Error("MAC_RUNTIME_CONFIG_INVALID");
  }

  const rawSecrets = body.secrets === undefined ? {} : body.secrets;
  if (!rawSecrets || typeof rawSecrets !== "object" || Array.isArray(rawSecrets)) {
    throw new Error("MAC_RUNTIME_CONFIG_INVALID");
  }
  const secrets = rawSecrets as Record<string, unknown>;
  const allowedSecretIds = new Set<string>(MEBUMIP_SECRET_IDS);
  if (Object.entries(secrets).some(([key, secret]) =>
    !allowedSecretIds.has(key) || typeof secret !== "string"
  )) {
    throw new Error("MAC_RUNTIME_CONFIG_INVALID");
  }
  if (body.secretAccess !== "enabled" && Object.keys(secrets).length > 0) {
    throw new Error("MAC_RUNTIME_CONFIG_INVALID");
  }

  return {
    revision: body.revision as number,
    service: "zuri-mebumip-api",
    apiOrigin: body.apiOrigin,
    allowedOrigins: [...body.allowedOrigins] as string[],
    secrets: { ...secrets } as Record<string,string>,
    secretAccess: body.secretAccess,
  };
}

export function buildMacRuntimeConfigHeaders(token: string): Record<string, string> {
  if (typeof token !== "string" || token.trim() === "" || /[\\r\\n]/.test(token)) {
    throw new Error("MAC_RUNTIME_CONFIG_TOKEN_INVALID");
  }
  return {
    authorization: `Bearer ${token}`,
    "x-vercel-trusted-oidc-idp-token": token,
    accept: "application/json",
  };
}

const MAC_RUNTIME_CONFIG_URL = validateMacRuntimeConfigUrl(
  process.env.MAC_RUNTIME_CONFIG_URL ?? DEFAULT_MAC_RUNTIME_CONFIG_URL,
);
let cached: MacRuntimeConfig | null = null;
let cachedUntil = 0;
let inFlight: Promise<MacRuntimeConfig | null> | null = null;

export async function getMacRuntimeConfig(forceRefresh = false, suppliedOidcToken?: string): Promise<MacRuntimeConfig | null> {
  if (!process.env.VERCEL) return null;
  if (!forceRefresh && cached && Date.now() < cachedUntil) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const token = suppliedOidcToken ?? await getVercelOidcToken();
    const response = await fetch(MAC_RUNTIME_CONFIG_URL, {
      method: "GET",
      headers: buildMacRuntimeConfigHeaders(token),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`MAC_RUNTIME_CONFIG_UNAVAILABLE_${response.status}`);
    const body = validateMacRuntimeConfig(await response.json());
    cached = body;
    cachedUntil = Date.now() + 5_000;
    return body;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
