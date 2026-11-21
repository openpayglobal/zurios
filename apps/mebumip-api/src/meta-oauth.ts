import { MetaGraphClient, type MetaGraphParams } from "./meta-graph-client.js";

export type MetaOAuthMode = "standard" | "business";
export type MetaOAuthScope =
  | "public_profile"
  | "pages_show_list"
  | "pages_read_engagement"
  | "pages_manage_posts"
  | "pages_manage_metadata"
  | "instagram_basic"
  | "instagram_content_publish"
  | "instagram_manage_comments";

export const META_PAGES_INSTAGRAM_SCOPES: readonly MetaOAuthScope[] = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

export interface MetaOAuthServiceOptions {
  appId: string;
  appSecret: string;
  version: string;
  redirectUri: string;
  allowInsecureLocalhost?: boolean;
  loginConfigId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface MetaAuthorizationOptions {
  state: string;
  mode?: MetaOAuthMode;
  scopes?: readonly MetaOAuthScope[];
  reRequest?: boolean;
}

export interface MetaOAuthToken {
  accessToken: string;
  tokenType: "bearer";
  expiresInSeconds: number | null;
}

export interface MetaValidatedUserToken {
  appId: string;
  userId: string;
  tokenType: "USER";
  scopes: string[];
  granularScopes: Array<{ scope: string; targetIds: string[] }>;
  expiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
}

interface ProviderTokenResponse {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  error?: { code?: unknown; error_subcode?: unknown; fbtrace_id?: unknown };
}

export class MetaOAuthError extends Error {
  readonly status: number;
  readonly providerCode: number | undefined;
  readonly providerSubcode: number | undefined;
  readonly fbtraceId: string | undefined;

  constructor(message: string, details: { status: number; providerCode?: number; providerSubcode?: number; fbtraceId?: string }) {
    super(message);
    this.name = "MetaOAuthError";
    this.status = details.status;
    this.providerCode = details.providerCode;
    this.providerSubcode = details.providerSubcode;
    this.fbtraceId = details.fbtraceId;
  }
}

const GRAPH_ORIGIN = "https://graph.facebook.com";
const DIALOG_ORIGIN = "https://www.facebook.com";
const ALLOWED_SCOPES = new Set<MetaOAuthScope>([
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
]);

function validateToken(token: string): void {
  if (typeof token !== "string" || token.length < 8 || token.length > 16_384) throw new Error("META_OAUTH_TOKEN_INVALID");
}

function parseTokenResponse(payload: ProviderTokenResponse, status: number): MetaOAuthToken {
  if (typeof payload.access_token !== "string" || payload.access_token.length < 8 || payload.access_token.length > 16_384) {
    throw new MetaOAuthError("Meta token exchange returned an invalid token", { status });
  }
  if (payload.token_type !== undefined && (typeof payload.token_type !== "string" || payload.token_type.toLowerCase() !== "bearer")) {
    throw new MetaOAuthError("Meta token exchange returned an unsupported token type", { status });
  }
  const expiresIn = payload.expires_in;
  if (expiresIn !== undefined && (typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0)) {
    throw new MetaOAuthError("Meta token exchange returned an invalid expiry", { status });
  }
  return {
    accessToken: payload.access_token,
    tokenType: "bearer",
    expiresInSeconds: typeof expiresIn === "number" ? expiresIn : null,
  };
}

export class MetaOAuthService {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: MetaOAuthServiceOptions) {
    if (!/^\d{6,32}$/.test(options.appId)) throw new Error("META_APP_ID_INVALID");
    if (typeof options.appSecret !== "string" || options.appSecret.length < 32 || options.appSecret.length > 512) throw new Error("META_APP_SECRET_INVALID");
    if (!/^v\d+\.\d+$/.test(options.version)) throw new Error("META_GRAPH_API_VERSION_INVALID");
    const redirect = new URL(options.redirectUri);
    const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
    if (redirect.username || redirect.password || redirect.hash || (redirect.protocol !== "https:" && !(options.allowInsecureLocalhost && localhost))) throw new Error("META_REDIRECT_URI_INVALID");
    if (options.loginConfigId !== undefined && !/^[A-Za-z0-9_-]{4,128}$/.test(options.loginConfigId)) throw new Error("META_LOGIN_CONFIG_ID_INVALID");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 60_000) throw new Error("META_OAUTH_TIMEOUT_INVALID");
  }

  buildAuthorizationUrl(input: MetaAuthorizationOptions): string {
    if (typeof input.state !== "string" || input.state.length < 32 || input.state.length > 128 || !/^[A-Za-z0-9_-]+$/.test(input.state)) {
      throw new Error("META_OAUTH_STATE_INVALID");
    }
    const mode = input.mode ?? "standard";
    if (mode !== "standard" && mode !== "business") throw new Error("META_OAUTH_MODE_INVALID");
    const url = new URL(`/${this.options.version}/dialog/oauth`, DIALOG_ORIGIN);
    url.searchParams.set("client_id", this.options.appId);
    url.searchParams.set("redirect_uri", this.options.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("display", "page");
    url.searchParams.set("state", input.state);
    if (mode === "business") {
      if (!this.options.loginConfigId) throw new Error("META_LOGIN_CONFIG_ID_REQUIRED");
      if (input.scopes?.length) throw new Error("META_BUSINESS_LOGIN_SCOPES_ARE_CONFIGURED_IN_META");
      url.searchParams.set("config_id", this.options.loginConfigId);
    } else {
      if (!input.scopes?.length || input.scopes.length > 20) throw new Error("META_OAUTH_SCOPES_REQUIRED");
      const scopes = [...new Set(input.scopes)];
      if (scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) throw new Error("META_OAUTH_SCOPE_NOT_ALLOWED");
      url.searchParams.set("scope", scopes.join(","));
    }
    if (input.reRequest) url.searchParams.set("auth_type", "rerequest");
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<MetaOAuthToken> {
    if (typeof code !== "string" || code.length < 8 || code.length > 4096 || /\s/.test(code)) throw new Error("META_OAUTH_CODE_INVALID");
    const url = new URL(`/${this.options.version}/oauth/access_token`, GRAPH_ORIGIN);
    const params: MetaGraphParams = {
      client_id: this.options.appId,
      client_secret: this.options.appSecret,
      redirect_uri: this.options.redirectUri,
      code,
    };
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    return this.fetchToken(url);
  }

  async debugAccessToken(accessToken: string): Promise<MetaValidatedUserToken> {
    validateToken(accessToken);
    const graph = new MetaGraphClient({
      version: this.options.version,
      appSecret: this.options.appSecret,
      requireAppSecretProof: true,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    });
    let payload: { data?: Record<string, unknown> };
    try {
      payload = await graph.request("debug_token", {
        accessToken: this.options.appId + "|" + this.options.appSecret,
        query: { input_token: accessToken },
      }) as { data?: Record<string, unknown> };
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        const details = error as Error & { status?: number; providerCode?: number; providerSubcode?: number; fbtraceId?: string };
        throw new MetaOAuthError("Meta access token validation failed", {
          status: details.status ?? 0,
          ...(typeof details.providerCode === "number" ? { providerCode: details.providerCode } : {}),
          ...(typeof details.providerSubcode === "number" ? { providerSubcode: details.providerSubcode } : {}),
          ...(typeof details.fbtraceId === "string" ? { fbtraceId: details.fbtraceId } : {}),
        });
      }
      throw new MetaOAuthError("Meta access token validation failed", { status: 0 });
    }
    const data = payload.data;
    if (!data || data.app_id !== this.options.appId || data.is_valid !== true || data.type !== "USER" || typeof data.user_id !== "string" || !data.user_id) {
      throw new MetaOAuthError("Meta access token is invalid or belongs to another app/user type", { status: 200 });
    }
    if (!Array.isArray(data.scopes) || !data.scopes.every((scope) => typeof scope === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(scope))) {
      throw new MetaOAuthError("Meta access token returned invalid scopes", { status: 200 });
    }
    const granularScopes: MetaValidatedUserToken["granularScopes"] = [];
    if (data.granular_scopes !== undefined) {
      if (!Array.isArray(data.granular_scopes)) throw new MetaOAuthError("Meta access token returned invalid granular scopes", { status: 200 });
      for (const entry of data.granular_scopes) {
        if (!entry || typeof entry !== "object" || typeof (entry as Record<string, unknown>).scope !== "string") {
          throw new MetaOAuthError("Meta access token returned invalid granular scopes", { status: 200 });
        }
        const targetIds = (entry as Record<string, unknown>).target_ids;
        if (targetIds !== undefined && (!Array.isArray(targetIds) || !targetIds.every((id) => typeof id === "string"))) {
          throw new MetaOAuthError("Meta access token returned invalid granular scopes", { status: 200 });
        }
        granularScopes.push({ scope: (entry as Record<string, unknown>).scope as string, targetIds: (targetIds as string[] | undefined) ?? [] });
      }
    }
    const toDate = (value: unknown, field: string): Date | null => {
      if (value === undefined || value === null || value === 0) return null;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new MetaOAuthError("Meta access token returned invalid " + field, { status: 200 });
      return new Date(value * 1000);
    };
    return {
      appId: this.options.appId,
      userId: data.user_id,
      tokenType: "USER",
      scopes: [...new Set(data.scopes as string[])].sort(),
      granularScopes,
      expiresAt: toDate(data.expires_at, "expiry"),
      dataAccessExpiresAt: toDate(data.data_access_expires_at, "data access expiry"),
    };
  }

  async exchangeAuthorizationCodeAndValidate(code: string): Promise<MetaOAuthToken & { identity: MetaValidatedUserToken }> {
    const token = await this.exchangeAuthorizationCode(code);
    const identity = await this.debugAccessToken(token.accessToken);
    return { ...token, identity };
  }

  async exchangeLongLivedTokenAndValidate(shortLivedToken: string): Promise<MetaOAuthToken & { identity: MetaValidatedUserToken }> {
    const token = await this.exchangeLongLivedToken(shortLivedToken);
    const identity = await this.debugAccessToken(token.accessToken);
    return { ...token, identity };
  }

  async exchangeLongLivedToken(shortLivedToken: string): Promise<MetaOAuthToken> {
    validateToken(shortLivedToken);
    const url = new URL(`/${this.options.version}/oauth/access_token`, GRAPH_ORIGIN);
    const params: MetaGraphParams = {
      grant_type: "fb_exchange_token",
      client_id: this.options.appId,
      client_secret: this.options.appSecret,
      fb_exchange_token: shortLivedToken,
    };
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    return this.fetchToken(url);
  }

  private async fetchToken(url: URL): Promise<MetaOAuthToken> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MetaOAuthError("Meta OAuth token exchange request failed", { status: 0 });
    }
    const responseVersion = response.headers.get("facebook-api-version");
    if (responseVersion && responseVersion !== this.options.version) {
      throw new MetaOAuthError("Meta OAuth token exchange returned an unexpected API version", { status: response.status });
    }
    let payload: ProviderTokenResponse;
    try {
      payload = await response.json() as ProviderTokenResponse;
    } catch {
      throw new MetaOAuthError("Meta OAuth token exchange returned invalid JSON", { status: response.status });
    }
    if (!response.ok || payload.error) {
      throw new MetaOAuthError("Meta OAuth token exchange was rejected", {
        status: response.status,
        ...(typeof payload.error?.code === "number" ? { providerCode: payload.error.code } : {}),
        ...(typeof payload.error?.error_subcode === "number" ? { providerSubcode: payload.error.error_subcode } : {}),
        ...(typeof payload.error?.fbtrace_id === "string" ? { fbtraceId: payload.error.fbtrace_id.slice(0, 128) } : {}),
      });
    }
    return parseTokenResponse(payload, response.status);
  }
}
