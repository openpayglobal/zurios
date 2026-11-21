import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export type MetaGraphMethod = "GET" | "POST" | "DELETE";
export type MetaGraphScalar = string | number | boolean | null | undefined;
export type MetaGraphParams = Record<string, MetaGraphScalar>;

export interface MetaGraphClientOptions {
  /** Required, explicit Meta Graph API version (for example v27.0); no unversioned fallback. */
  version: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  appSecret?: string;
  requireAppSecretProof?: boolean;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface MetaGraphRequestOptions {
  accessToken: string;
  method?: MetaGraphMethod;
  query?: MetaGraphParams;
  body?: MetaGraphParams;
  retry?: boolean;
}

interface MetaProviderError {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  is_transient?: unknown;
  fbtrace_id?: unknown;
}

export class MetaGraphError extends Error {
  readonly status: number;
  readonly providerCode: number | undefined;
  readonly providerSubcode: number | undefined;
  readonly providerType: string | undefined;
  readonly fbtraceId: string | undefined;
  readonly retryable: boolean;

  constructor(message: string, details: {
    status: number;
    providerCode?: number;
    providerSubcode?: number;
    providerType?: string;
    fbtraceId?: string;
    retryable?: boolean;
  }) {
    super(message);
    this.name = "MetaGraphError";
    this.status = details.status;
    this.providerCode = details.providerCode;
    this.providerSubcode = details.providerSubcode;
    this.providerType = details.providerType;
    this.fbtraceId = details.fbtraceId;
    this.retryable = details.retryable ?? false;
  }
}

const GRAPH_API_ORIGIN = "https://graph.facebook.com";
const TOKEN_QUERY_KEY = "access_token";
const APP_SECRET_PROOF_QUERY_KEY = "appsecret_proof";

function safeMessage(message: unknown, token: string, appSecret?: string): string {
  const value = typeof message === "string" && message.trim() ? message : "Meta Graph API request failed";
  const redacted = value.replaceAll(token, "[REDACTED]").replace(/(?:access_token|appsecret_proof)\s*[=:]\s*[^\s&,]+/gi, "credential=[REDACTED]");
  return (appSecret ? redacted.replaceAll(appSecret, "[REDACTED]") : redacted).slice(0, 500);
}

function normalizePath(path: string, version: string): string {
  if (typeof path !== "string" || !path.trim() || path.includes("?") || path.includes("#") || /^https?:\/\//i.test(path)) {
    throw new MetaGraphError("Invalid Meta Graph API path", { status: 0 });
  }
  const normalized = path.replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..") || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(normalized)) {
    throw new MetaGraphError("Invalid Meta Graph API path", { status: 0 });
  }
  if (normalized === version || normalized.startsWith(version + "/")) {
    throw new MetaGraphError("Do not include the API version in the request path", { status: 0 });
  }
  return normalized;
}

function appendParams(url: URL, params: MetaGraphParams | undefined, rejectCredentials = true): void {
  if (!params) return;
  for (const [key, value] of Object.entries(params)) {
    if (rejectCredentials && [TOKEN_QUERY_KEY, APP_SECRET_PROOF_QUERY_KEY].includes(key.toLowerCase())) {
      throw new MetaGraphError("Credential parameters are managed by the Meta Graph client", { status: 0 });
    }
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 30_000)) : undefined;
}

export class MetaGraphClient {
  readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly appSecret: string | undefined;
  private readonly requireAppSecretProof: boolean;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: MetaGraphClientOptions) {
    if (!/^v\d+\.\d+$/.test(options.version)) throw new Error("META_GRAPH_API_VERSION_INVALID");
    this.version = options.version;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.appSecret = options.appSecret;
    this.requireAppSecretProof = options.requireAppSecretProof ?? Boolean(options.appSecret);
    this.sleep = options.sleep ?? ((milliseconds) => delay(milliseconds));
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 60_000) throw new Error("META_GRAPH_TIMEOUT_INVALID");
    if (!Number.isSafeInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 5) throw new Error("META_GRAPH_RETRY_LIMIT_INVALID");
    if (this.appSecret !== undefined && (this.appSecret.length < 16 || this.appSecret.length > 512)) throw new Error("META_APP_SECRET_INVALID");
    if (this.requireAppSecretProof && !this.appSecret) throw new Error("META_APP_SECRET_PROOF_REQUIRED");
  }

  async request<T = Record<string, unknown>>(path: string, options: MetaGraphRequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const accessToken = options.accessToken;
    if (typeof accessToken !== "string" || accessToken.length < 8 || accessToken.length > 4096) {
      throw new MetaGraphError("Meta access token is missing or invalid", { status: 0 });
    }
    if (method !== "POST" && options.body) throw new MetaGraphError("A request body is only supported for POST", { status: 0 });
    const safePath = normalizePath(path, this.version);
    const url = new URL(`/${this.version}/${safePath}`, GRAPH_API_ORIGIN);
    appendParams(url, options.query);
    if (this.appSecret) url.searchParams.set(APP_SECRET_PROOF_QUERY_KEY, createHmac("sha256", this.appSecret).update(accessToken).digest("hex"));
    const headers = new Headers({ accept: "application/json", authorization: `Bearer ${accessToken}` });
    let body: URLSearchParams | undefined;
    if (options.body) {
      body = new URLSearchParams();
      appendParams(new URL("https://params.invalid"), options.body);
      for (const [key, value] of Object.entries(options.body)) {
        if (value !== undefined && value !== null) body.set(key, String(value));
      }
      headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    }
    const retryableMethod = method === "GET" && options.retry !== false;
    const attempts = retryableMethod ? this.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          ...(body ? { body } : {}),
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
      } catch {
        if (retryableMethod && attempt + 1 < attempts) {
          await this.sleep(Math.min(250 * (2 ** attempt), 4_000));
          continue;
        }
        throw new MetaGraphError("Meta Graph API network request failed", { status: 0, retryable: true });
      }

      const responseVersion = response.headers.get("facebook-api-version");
      if (responseVersion && responseVersion !== this.version) {
        throw new MetaGraphError("Meta Graph API returned an unexpected version", { status: response.status });
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        const retryableResponse = response.status === 429 || response.status >= 500;
        if (retryableMethod && retryableResponse && attempt + 1 < attempts) {
          await this.sleep(retryAfterMs(response.headers.get("retry-after")) ?? Math.min(250 * (2 ** attempt), 4_000));
          continue;
        }
        throw new MetaGraphError("Meta Graph API returned invalid JSON", { status: response.status, retryable: retryableResponse });
      }
      const providerError = payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: MetaProviderError }).error
        : undefined;
      const hasProviderError = Boolean(providerError && typeof providerError === "object");
      if (!response.ok || hasProviderError) {
        const details = providerError && typeof providerError === "object" ? providerError : {};
        const retryable = response.status === 429 || response.status >= 500 || details.is_transient === true || [1, 2, 4, 17, 341].includes(Number(details.code));
        if (retryableMethod && retryable && attempt + 1 < attempts) {
          await this.sleep(retryAfterMs(response.headers.get("retry-after")) ?? Math.min(250 * (2 ** attempt), 4_000));
          continue;
        }
        throw new MetaGraphError(safeMessage(details.message, accessToken, this.appSecret), {
          status: response.status,
          ...(typeof details.code === "number" ? { providerCode: details.code } : {}),
          ...(typeof details.error_subcode === "number" ? { providerSubcode: details.error_subcode } : {}),
          ...(typeof details.type === "string" ? { providerType: details.type } : {}),
          ...(typeof details.fbtrace_id === "string" ? { fbtraceId: details.fbtrace_id.slice(0, 128) } : {}),
          retryable,
        });
      }
      return payload as T;
    }
    throw new MetaGraphError("Meta Graph API retry budget exhausted", { status: 0, retryable: true });
  }

  /** Follow a provider paging URL without trusting its host or forwarding its embedded access token. */
  async requestNext<T = Record<string, unknown>>(nextUrl: string, accessToken: string): Promise<T> {
    let parsed: URL;
    try { parsed = new URL(nextUrl); } catch { throw new MetaGraphError("Invalid Meta pagination URL", { status: 0 }); }
    if (parsed.protocol !== "https:" || parsed.hostname !== "graph.facebook.com" || parsed.port || parsed.username || parsed.password) {
      throw new MetaGraphError("Untrusted Meta pagination host", { status: 0 });
    }
    const prefix = `/${this.version}/`;
    if (!parsed.pathname.startsWith(prefix)) throw new MetaGraphError("Meta pagination version mismatch", { status: 0 });
    const path = parsed.pathname.slice(prefix.length);
    const query: MetaGraphParams = {};
    for (const [key, value] of parsed.searchParams.entries()) {
      if (key.toLowerCase() === TOKEN_QUERY_KEY || key.toLowerCase() === APP_SECRET_PROOF_QUERY_KEY) continue;
      query[key] = value;
    }
    return this.request<T>(path, { accessToken, query });
  }
}
