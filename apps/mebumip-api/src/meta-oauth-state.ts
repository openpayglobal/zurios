import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { withAuditTransaction } from "./security.js";

export interface MetaOAuthStateContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  redirectUri: string;
}

export interface MetaOAuthStateResult {
  state: string;
  expiresAt: Date;
}

export interface ConsumedMetaOAuthState extends MetaOAuthStateContext {
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date;
}

interface MetaOAuthStateDocument extends MetaOAuthStateContext {
  stateHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

export interface MetaOAuthStateServiceOptions {
  /** Exact callback URI registered with Meta; callers cannot override it. */
  redirectUri: string;
  ttlMs?: number;
  now?: () => Date;
}

function stateHash(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function requiredText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new Error("META_OAUTH_" + field.toUpperCase() + "_INVALID");
  return value.trim();
}

function normalizeRedirectUri(value: string): string {
  let redirect: URL;
  try {
    redirect = new URL(value);
  } catch {
    throw new Error("META_OAUTH_REDIRECT_URI_INVALID");
  }
  const localDevelopmentHost = ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if (redirect.username || redirect.password || redirect.hash || (redirect.protocol !== "https:" && !localDevelopmentHost)) {
    throw new Error("META_OAUTH_REDIRECT_URI_INVALID");
  }
  return redirect.toString();
}

export class MetaOAuthStateService {
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private readonly redirectUri: string;

  constructor(private readonly db: Db, options: MetaOAuthStateServiceOptions) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.now = options.now ?? (() => new Date());
    this.redirectUri = normalizeRedirectUri(options.redirectUri);
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 60_000 || this.ttlMs > 15 * 60_000) throw new Error("META_OAUTH_STATE_TTL_INVALID");
  }

  async create(context: MetaOAuthStateContext, correlationIdInput: string): Promise<MetaOAuthStateResult> {
    const tenantId = requiredText(context.tenantId, "tenant_id");
    const userId = requiredText(context.userId, "user_id");
    const sessionId = requiredText(context.sessionId, "session_id");
    const correlationId = requiredText(correlationIdInput, "correlation_id");
    if (normalizeRedirectUri(context.redirectUri) !== this.redirectUri) throw new Error("META_OAUTH_REDIRECT_URI_MISMATCH");
    const state = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.ttlMs);
    const document: MetaOAuthStateDocument = {
      tenantId, userId, sessionId, redirectUri: this.redirectUri,
      stateHash: stateHash(state), createdAt, expiresAt,
    };
    await withAuditTransaction(
      this.db,
      async (session) => {
        await this.db.collection<MetaOAuthStateDocument>("metaOAuthStates").insertOne(document, { session });
        return document.stateHash;
      },
      (hash) => ({
        actorUserId: userId,
        action: "meta.oauth.state.created",
        targetType: "meta_oauth_state",
        targetId: hash.slice(0, 24),
        tenantId,
        outcome: "success",
        correlationId,
        metadata: { expiresAt: expiresAt.toISOString(), redirectHost: new URL(this.redirectUri).hostname },
      }),
    );
    return { state, expiresAt };
  }

  /** Atomically consumes a one-time state bound to the same tenant, user and authenticated session. */
  async consume(
    state: string,
    expected: Pick<MetaOAuthStateContext, "tenantId" | "userId" | "sessionId">,
    correlationIdInput: string,
  ): Promise<ConsumedMetaOAuthState | null> {
    if (typeof state !== "string" || state.length < 32 || state.length > 128) return null;
    const tenantId = requiredText(expected.tenantId, "tenant_id");
    const userId = requiredText(expected.userId, "user_id");
    const sessionId = requiredText(expected.sessionId, "session_id");
    const correlationId = requiredText(correlationIdInput, "correlation_id");
    const now = this.now();
    const hash = stateHash(state);
    const collection = this.db.collection<MetaOAuthStateDocument>("metaOAuthStates");
    return withAuditTransaction(
      this.db,
      async (session) => {
        const updated = await collection.updateOne({
          stateHash: hash,
          tenantId,
          userId,
          sessionId,
          redirectUri: this.redirectUri,
          usedAt: { $exists: false },
          expiresAt: { $gt: now },
        }, { $set: { usedAt: now } }, { session });
        if (updated.modifiedCount !== 1) return null;
        const record = await collection.findOne({ stateHash: hash, usedAt: now }, { session });
        if (!record) return null;
        return {
          tenantId: record.tenantId,
          userId: record.userId,
          sessionId: record.sessionId,
          redirectUri: record.redirectUri,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          usedAt: now,
        };
      },
      (consumed) => ({
        actorUserId: userId,
        action: consumed ? "meta.oauth.state.consumed" : "meta.oauth.state.rejected",
        targetType: "meta_oauth_state",
        targetId: hash.slice(0, 24),
        tenantId,
        outcome: consumed ? "success" : "denied",
        correlationId,
        metadata: { stateHashPrefix: hash.slice(0, 12) },
      }),
    );
  }
}
