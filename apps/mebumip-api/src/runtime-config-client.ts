import { getVercelOidcToken } from "@vercel/oidc";

export type MacRuntimeConfig = {
  revision: number;
  service: string;
  apiOrigin: string;
  allowedOrigins: string[];
  privateSettings: Record<string, unknown>;
  secretAccess: string;
};

export function buildMacRuntimeConfigHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "x-vercel-trusted-oidc-idp-token": token,
    accept: "application/json",
  };
}

const MAC_RUNTIME_CONFIG_URL = process.env.MAC_RUNTIME_CONFIG_URL
  ?? "https://zurios-api-openpayglobal-5300s-projects.vercel.app/platform/internal/runtime-config";
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
    const body = await response.json() as MacRuntimeConfig;
    if (
      typeof body.revision !== "number" ||
      body.service !== "zuri-mebumip-api" ||
      typeof body.apiOrigin !== "string" ||
      !Array.isArray(body.allowedOrigins)
    ) throw new Error("MAC_RUNTIME_CONFIG_INVALID");
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
