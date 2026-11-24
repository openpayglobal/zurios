import type { ClientSession, Db } from "mongodb";

export type RuntimePublicSettings = {
  accessRequestsEnabled: boolean | null;
  privacyNoticeUrl: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  defaultLocale: string | null;
  defaultCurrency: string | null;
  timezone: string | null;
};

export type PlatformRuntimeConfig = {
  _id: "global";
  revision: number;
  allowedOrigins: string[];
  apiOrigins: { zuriOs: string; mebumip: string };
  publicSettings: RuntimePublicSettings;
  privateSettings: Record<string, unknown>;
  updatedAt?: Date;
  updatedBy?: string;
  reason?: string;
};

export const VERIFIED_BROWSER_HOSTS = new Set([
  "zurios.vercel.app",
  "zuri-mebumip-openpayglobal-5300s-projects.vercel.app",
]);

export const VERIFIED_API_HOSTS = new Set([
  "zurios-api-openpayglobal-5300s-projects.vercel.app",
  "zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app",
]);

function normalizeHttpsOrigin(value: string, verifiedHosts: Set<string>, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}_INVALID`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label}_MUST_BE_EXACT_HTTPS_ORIGIN`);
  }
  if (!verifiedHosts.has(url.hostname)) throw new Error(`${label}_DOMAIN_NOT_VERIFIED`);
  return url.origin;
}

export function normalizeVerifiedApiOrigin(value: string): string {
  return normalizeHttpsOrigin(value, VERIFIED_API_HOSTS, "API_ORIGIN");
}

export function normalizeOriginList(values: string[]): string[] {
  const normalized = [...new Set(values.map((value) => normalizeHttpsOrigin(value, VERIFIED_BROWSER_HOSTS, "BROWSER_ORIGIN")))];
  if (normalized.length < 1 || normalized.length > 20) throw new Error("BROWSER_ORIGIN_COUNT_INVALID");
  return normalized;
}

export const defaultPlatformRuntimeConfig: PlatformRuntimeConfig = {
  _id: "global",
  revision: 0,
  allowedOrigins: [
    "https://zurios.vercel.app",
    "https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app",
  ],
  apiOrigins: {
    zuriOs: "https://zurios-api-openpayglobal-5300s-projects.vercel.app",
    mebumip: "https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app",
  },
  publicSettings: { accessRequestsEnabled: null, privacyNoticeUrl: null, supportEmail: null, supportUrl: null, defaultLocale: null, defaultCurrency: null, timezone: null },
  privateSettings: {},
};

export async function readPlatformRuntimeConfig(db: Db, session?: ClientSession): Promise<PlatformRuntimeConfig> {
  const collection = db.collection<PlatformRuntimeConfig>("platformRuntimeConfig");
  const current = session
    ? await collection.findOne({ _id: "global" }, { session })
    : await collection.findOne({ _id: "global" });
  return current ?? defaultPlatformRuntimeConfig;
}


/** Safe administrative view: private runtime settings never leave the MAC API. */
export type AdminRuntimeConfig = Omit<PlatformRuntimeConfig, "privateSettings">;

export function toAdminRuntimeConfig(runtime: PlatformRuntimeConfig): AdminRuntimeConfig {
  const { privateSettings: _privateSettings, ...safe } = runtime;
  return safe;
}
