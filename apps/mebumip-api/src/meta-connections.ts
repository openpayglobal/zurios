import { randomUUID } from "node:crypto";
import type { Db, Document } from "mongodb";
import { withAuditTransaction } from "./security.js";
import type { MetaTokenVault } from "./meta-token-vault.js";

export interface MetaConnectionDocument extends Document {
  tenantId: string;
  connectionId: string;
  provider: "meta";
  providerUserId: string;
  providerUserName?: string;
  accessTokenCiphertext: string | null;
  grantedScopes: string[];
  expiresAt?: Date;
  dataAccessExpiresAt?: Date;
  status: "connected" | "revoked";
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  revocationStatus?: "succeeded" | "failed" | "not_attempted";
}

export interface MetaConnectionSummary {
  tenantId: string;
  connectionId: string;
  provider: "meta";
  providerUserId: string;
  providerUserName?: string;
  grantedScopes: string[];
  expiresAt?: Date;
  dataAccessExpiresAt?: Date;
  status: "connected" | "revoked";
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  revocationStatus?: "succeeded" | "failed" | "not_attempted";
}

export interface CreateMetaConnectionInput {
  tenantId: string;
  actorUserId: string;
  providerUserId: string;
  providerUserName?: string;
  accessToken: string;
  grantedScopes: string[];
  expiresAt?: Date;
  dataAccessExpiresAt?: Date;
  correlationId: string;
}

function requiredText(value: string, field: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error("META_CONNECTION_" + field.toUpperCase() + "_INVALID");
  return value.trim();
}

function normalizeScopes(scopes: string[]): string[] {
  if (!Array.isArray(scopes) || scopes.length > 200) throw new Error("META_CONNECTION_SCOPES_INVALID");
  const normalized = [...new Set(scopes.map((scope) => requiredText(scope, "scope", 128)))].sort();
  if (normalized.some((scope) => !/^[A-Za-z0-9_.:-]+$/.test(scope))) throw new Error("META_CONNECTION_SCOPES_INVALID");
  return normalized;
}

function validateExpiry(value: Date | undefined, field: string, now: Date): void {
  if (value !== undefined && (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value <= now)) {
    throw new Error("META_CONNECTION_" + field.toUpperCase() + "_INVALID");
  }
}

function toSummary(document: MetaConnectionDocument): MetaConnectionSummary {
  return {
    tenantId: document.tenantId,
    connectionId: document.connectionId,
    provider: document.provider,
    providerUserId: document.providerUserId,
    ...(document.providerUserName ? { providerUserName: document.providerUserName } : {}),
    grantedScopes: [...document.grantedScopes],
    ...(document.expiresAt ? { expiresAt: document.expiresAt } : {}),
    ...(document.dataAccessExpiresAt ? { dataAccessExpiresAt: document.dataAccessExpiresAt } : {}),
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(document.revokedAt ? { revokedAt: document.revokedAt } : {}),
    ...(document.revocationStatus ? { revocationStatus: document.revocationStatus } : {}),
  };
}

export async function createMetaConnection(
  db: Db,
  vault: MetaTokenVault,
  input: CreateMetaConnectionInput,
): Promise<MetaConnectionSummary> {
  const tenantId = requiredText(input.tenantId, "tenant_id");
  const actorUserId = requiredText(input.actorUserId, "actor_user_id");
  const providerUserId = requiredText(input.providerUserId, "provider_user_id");
  const correlationId = requiredText(input.correlationId, "correlation_id");
  const providerUserName = input.providerUserName === undefined ? undefined : requiredText(input.providerUserName, "provider_user_name");
  const grantedScopes = normalizeScopes(input.grantedScopes);
  const now = new Date();
  validateExpiry(input.expiresAt, "expires_at", now);
  validateExpiry(input.dataAccessExpiresAt, "data_access_expires_at", now);
  const connectionId = randomUUID();
  const document: MetaConnectionDocument = {
    tenantId,
    connectionId,
    provider: "meta",
    providerUserId,
    ...(providerUserName ? { providerUserName } : {}),
    accessTokenCiphertext: vault.encrypt(input.accessToken, { tenantId, connectionId }),
    grantedScopes,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.dataAccessExpiresAt ? { dataAccessExpiresAt: input.dataAccessExpiresAt } : {}),
    status: "connected",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await withAuditTransaction(
      db,
      async (session) => {
        await db.collection<MetaConnectionDocument>("metaConnections").insertOne(document, { session });
        return connectionId;
      },
      () => ({
        actorUserId,
        action: "meta.connection.created",
        targetType: "meta_connection",
        targetId: connectionId,
        tenantId,
        outcome: "success",
        correlationId,
        metadata: { providerUserId, grantedScopeCount: grantedScopes.length },
      }),
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new Error("META_CONNECTION_ALREADY_EXISTS");
    throw error;
  }
  return toSummary(document);
}

export async function getMetaConnection(db: Db, tenantIdInput: string, connectionIdInput: string): Promise<MetaConnectionSummary> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const connectionId = requiredText(connectionIdInput, "connection_id");
  const document = await db.collection<MetaConnectionDocument>("metaConnections").findOne({ tenantId, connectionId });
  if (!document) throw new Error("META_CONNECTION_NOT_FOUND");
  return toSummary(document);
}

export async function listMetaConnections(db: Db, tenantIdInput: string): Promise<MetaConnectionSummary[]> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const documents = await db.collection<MetaConnectionDocument>("metaConnections")
    .find({ tenantId })
    .sort({ updatedAt: -1, connectionId: 1 })
    .toArray();
  return documents.map(toSummary);
}

/** Internal-only token access. Never expose this return value from an HTTP route. */
export async function getMetaAccessToken(
  db: Db,
  vault: MetaTokenVault,
  tenantIdInput: string,
  connectionIdInput: string,
  now = new Date(),
): Promise<string> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const connectionId = requiredText(connectionIdInput, "connection_id");
  const document = await db.collection<MetaConnectionDocument>("metaConnections")
    .findOne({ tenantId, connectionId, status: "connected" });
  if (!document?.accessTokenCiphertext) throw new Error("META_CONNECTION_NOT_FOUND");
  if (document.expiresAt && document.expiresAt <= now) throw new Error("META_CONNECTION_TOKEN_EXPIRED");
  if (document.dataAccessExpiresAt && document.dataAccessExpiresAt <= now) throw new Error("META_CONNECTION_DATA_ACCESS_EXPIRED");
  return vault.decrypt(document.accessTokenCiphertext, { tenantId, connectionId });
}

export async function rotateMetaConnectionEncryptionKey(
  db: Db,
  vault: MetaTokenVault,
  tenantIdInput: string,
  connectionIdInput: string,
  actorUserIdInput: string,
  correlationIdInput: string,
): Promise<boolean> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const connectionId = requiredText(connectionIdInput, "connection_id");
  const actorUserId = requiredText(actorUserIdInput, "actor_user_id");
  const correlationId = requiredText(correlationIdInput, "correlation_id");
  const collection = db.collection<MetaConnectionDocument>("metaConnections");
  const current = await collection.findOne({ tenantId, connectionId, status: "connected" });
  if (!current?.accessTokenCiphertext) throw new Error("META_CONNECTION_NOT_FOUND");
  const rotated = vault.rotate(current.accessTokenCiphertext, { tenantId, connectionId });
  if (!rotated.rotated) return false;
  const now = new Date();
  await withAuditTransaction(
    db,
    async (session) => {
      const result = await collection.updateOne(
        { _id: current._id, tenantId, connectionId, status: "connected", accessTokenCiphertext: current.accessTokenCiphertext },
        { $set: { accessTokenCiphertext: rotated.envelope, updatedAt: now } },
        { session },
      );
      if (result.modifiedCount !== 1) throw new Error("META_CONNECTION_CHANGED_DURING_KEY_ROTATION");
      return true;
    },
    () => ({
      actorUserId,
      action: "meta.connection.encryption_key_rotated",
      targetType: "meta_connection",
      targetId: connectionId,
      tenantId,
      outcome: "success",
      correlationId,
      metadata: { keyId: vault.keyId(rotated.envelope) },
    }),
  );
  return true;
}

export async function revokeMetaConnection(
  db: Db,
  tenantIdInput: string,
  connectionIdInput: string,
  actorUserIdInput: string,
  correlationIdInput: string,
  revocationStatus: "succeeded" | "failed" | "not_attempted" = "not_attempted",
): Promise<void> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const connectionId = requiredText(connectionIdInput, "connection_id");
  const actorUserId = requiredText(actorUserIdInput, "actor_user_id");
  const correlationId = requiredText(correlationIdInput, "correlation_id");
  const now = new Date();
  const collection = db.collection<MetaConnectionDocument>("metaConnections");
  await withAuditTransaction(
    db,
    async (session) => {
      const result = await collection.updateOne(
        { tenantId, connectionId, status: "connected" },
        { $set: { status: "revoked", accessTokenCiphertext: null, revokedAt: now, updatedAt: now, revocationStatus } },
        { session },
      );
      if (result.modifiedCount !== 1) throw new Error("META_CONNECTION_NOT_FOUND");
      const clearedAssets = await db.collection("metaAssets").updateMany(
        { tenantId, connectionId, status: "active" },
        { $set: { status: "unavailable", pageAccessTokenCiphertext: null, updatedAt: now } },
        { session },
      );
      return { clearedPageAssets: clearedAssets.modifiedCount };
    },
    (result) => ({
      actorUserId,
      action: "meta.connection.revoked",
      targetType: "meta_connection",
      targetId: connectionId,
      tenantId,
      outcome: "success",
      correlationId,
      metadata: { remoteRevocation: revocationStatus, clearedPageAssets: result.clearedPageAssets },
    }),
  );
}
