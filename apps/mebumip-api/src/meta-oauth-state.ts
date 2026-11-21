import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";

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

function stateHash(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function validateContext(context: MetaOAuthStateContext): void {
  for (const [name, value] of Object.entries(context)) {
    if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error(`META_OAUTH_${name.toUpperCase()}_INVALID`);
  }
  const redirect = new URL(context.redirectUri);
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.hash) throw new Error("META_OAUTH_REDIRECT_URI_INVALID");
}

export class MetaOAuthStateService {
  private readonly ttlMs: number;
  private readonly now: () => Date;

  constructor(private readonly db: Db, options: { ttlMs?: number; now?: () => Date } = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.now = options.now ?? (() => new Date());
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs < 60_000 || this.ttlMs > 15 * 60_000) throw new Error("META_OAUTH_STATE_TTL_INVALID");
  }

  async create(context: MetaOAuthStateContext): Promise<MetaOAuthStateResult> {
    validateContext(context);
    const state = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.ttlMs);
    await this.db.collection<MetaOAuthStateDocument>("metaOAuthStates").insertOne({
      ...context,
      stateHash: stateHash(state),
      createdAt,
      expiresAt,
    });
    return { state, expiresAt };
  }

  /** Atomically consumes a state value bound to the same tenant, user and session. */
  async consume(state: string, expected: Pick<MetaOAuthStateContext, "tenantId" | "userId" | "sessionId">): Promise<ConsumedMetaOAuthState | null> {
    if (typeof state !== "string" || state.length < 32 || state.length > 128) return null;
    const now = this.now();
    const hash = stateHash(state);
    const collection = this.db.collection<MetaOAuthStateDocument>("metaOAuthStates");
    const consumed = await collection.updateOne({
      stateHash: hash,
      tenantId: expected.tenantId,
      userId: expected.userId,
      sessionId: expected.sessionId,
      usedAt: { $exists: false },
      expiresAt: { $gt: now },
    }, { $set: { usedAt: now } });
    if (consumed.modifiedCount !== 1) return null;
    const record = await collection.findOne({ stateHash: hash, usedAt: now });
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
  }
}
