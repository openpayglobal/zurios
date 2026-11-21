import type { Db, Document } from "mongodb";
import { withAuditTransaction } from "./security.js";
import { getMetaAccessToken } from "./meta-connections.js";
import type { MetaTokenVault } from "./meta-token-vault.js";
import type { MetaGraphClient } from "./meta-graph-client.js";

export interface MetaInstagramBusinessAccount {
  id: string;
  username?: string;
}

export interface MetaPageAssetDocument extends Document {
  tenantId: string;
  connectionId: string;
  provider: "meta";
  assetType: "facebook_page";
  providerAssetId: string;
  name: string;
  tasks: string[];
  instagramBusinessAccount?: MetaInstagramBusinessAccount;
  pageAccessTokenCiphertext: string | null;
  status: "active" | "unavailable";
  discoveredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetaPageAssetSummary {
  tenantId: string;
  connectionId: string;
  provider: "meta";
  assetType: "facebook_page";
  providerAssetId: string;
  name: string;
  tasks: string[];
  instagramBusinessAccount?: MetaInstagramBusinessAccount;
  status: "active" | "unavailable";
  discoveredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MetaPageRecord {
  id?: unknown;
  name?: unknown;
  access_token?: unknown;
  tasks?: unknown;
  instagram_business_account?: unknown;
}

interface MetaPagesResponse {
  data?: unknown;
  paging?: { next?: unknown };
}

function requiredText(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error("META_ASSET_" + field.toUpperCase() + "_INVALID");
  return value.trim();
}

function parsePage(value: unknown): Omit<MetaPageAssetDocument, "_id" | "tenantId" | "connectionId" | "provider" | "assetType" | "pageAccessTokenCiphertext" | "status" | "discoveredAt" | "createdAt" | "updatedAt"> & { accessToken: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("META_ASSET_PAGE_RESPONSE_INVALID");
  const page = value as MetaPageRecord;
  const providerAssetId = requiredText(page.id, "page_id", 64);
  if (!/^\d{1,64}$/.test(providerAssetId)) throw new Error("META_ASSET_PAGE_ID_INVALID");
  const name = requiredText(page.name, "page_name");
  const accessToken = requiredText(page.access_token, "page_access_token", 16_384);
  if (accessToken.length < 8) throw new Error("META_ASSET_PAGE_TOKEN_INVALID");
  const tasks = page.tasks === undefined ? [] : page.tasks;
  if (!Array.isArray(tasks) || tasks.length > 100 || !tasks.every((task) => typeof task === "string" && /^[A-Za-z0-9_ -]{1,80}$/.test(task))) {
    throw new Error("META_ASSET_PAGE_TASKS_INVALID");
  }
  let instagramBusinessAccount: MetaInstagramBusinessAccount | undefined;
  if (page.instagram_business_account !== undefined && page.instagram_business_account !== null) {
    const instagram = page.instagram_business_account;
    if (!instagram || typeof instagram !== "object" || Array.isArray(instagram)) throw new Error("META_ASSET_INSTAGRAM_ACCOUNT_INVALID");
    const record = instagram as Record<string, unknown>;
    const id = requiredText(record.id, "instagram_id", 64);
    if (!/^\d{1,64}$/.test(id)) throw new Error("META_ASSET_INSTAGRAM_ID_INVALID");
    const username = record.username === undefined ? undefined : requiredText(record.username, "instagram_username", 128);
    instagramBusinessAccount = { id, ...(username ? { username } : {}) };
  }
  return {
    providerAssetId,
    name,
    accessToken,
    tasks: [...new Set(tasks as string[])].sort(),
    ...(instagramBusinessAccount ? { instagramBusinessAccount } : {}),
  };
}

function toSummary(document: MetaPageAssetDocument): MetaPageAssetSummary {
  return {
    tenantId: document.tenantId,
    connectionId: document.connectionId,
    provider: "meta",
    assetType: "facebook_page",
    providerAssetId: document.providerAssetId,
    name: document.name,
    tasks: [...document.tasks],
    ...(document.instagramBusinessAccount ? { instagramBusinessAccount: document.instagramBusinessAccount } : {}),
    status: document.status,
    discoveredAt: document.discoveredAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export async function discoverMetaPages(
  db: Db,
  vault: MetaTokenVault,
  graph: MetaGraphClient,
  input: { tenantId: string; connectionId: string; actorUserId: string; correlationId: string; now?: Date },
): Promise<{ items: MetaPageAssetSummary[]; discovered: number; instagramLinked: number }> {
  const tenantId = requiredText(input.tenantId, "tenant_id");
  const connectionId = requiredText(input.connectionId, "connection_id");
  const actorUserId = requiredText(input.actorUserId, "actor_user_id");
  const correlationId = requiredText(input.correlationId, "correlation_id");
  const userToken = await getMetaAccessToken(db, vault, tenantId, connectionId, input.now ?? new Date());
  const fields = "id,name,access_token,tasks,instagram_business_account{id,username}";
  let response = await graph.request<MetaPagesResponse>("me/accounts", {
    accessToken: userToken,
    query: { fields, limit: 100 },
  });
  const pages = new Map<string, ReturnType<typeof parsePage>>();
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    if (!Array.isArray(response.data)) throw new Error("META_ASSET_PAGE_LIST_INVALID");
    for (const value of response.data) {
      const page = parsePage(value);
      pages.set(page.providerAssetId, page);
      if (pages.size > 2_000) throw new Error("META_ASSET_DISCOVERY_LIMIT_EXCEEDED");
    }
    const next = response.paging?.next;
    if (typeof next !== "string" || !next) break;
    if (pageNumber === 19) throw new Error("META_ASSET_DISCOVERY_PAGE_LIMIT_EXCEEDED");
    response = await graph.requestNext<MetaPagesResponse>(next, userToken);
  }

  const now = input.now ?? new Date();
  const documents = [...pages.values()].map((page) => ({
    tenantId,
    connectionId,
    provider: "meta" as const,
    assetType: "facebook_page" as const,
    providerAssetId: page.providerAssetId,
    name: page.name,
    tasks: page.tasks,
    ...(page.instagramBusinessAccount ? { instagramBusinessAccount: page.instagramBusinessAccount } : {}),
    pageAccessTokenCiphertext: vault.encrypt(page.accessToken, {
      tenantId,
      connectionId: connectionId + ":page:" + page.providerAssetId,
    }),
    status: "active" as const,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  const collection = db.collection<MetaPageAssetDocument>("metaAssets");
  await withAuditTransaction(
    db,
    async (session) => {
      if (documents.length) {
        await collection.bulkWrite(documents.map((document) => ({
          updateOne: {
            filter: { tenantId, connectionId, providerAssetId: document.providerAssetId },
            update: {
              $set: {
                name: document.name,
                tasks: document.tasks,
                ...(document.instagramBusinessAccount ? { instagramBusinessAccount: document.instagramBusinessAccount } : {}),
                pageAccessTokenCiphertext: document.pageAccessTokenCiphertext,
                status: "active",
                discoveredAt: now,
                updatedAt: now,
              },
              $setOnInsert: { ...document, createdAt: now },
            },
            upsert: true,
          },
        })), { session, ordered: true });
      }
      const discoveredIds = documents.map((document) => document.providerAssetId);
      const stale = await collection.updateMany(
        { tenantId, connectionId, providerAssetId: { $nin: discoveredIds }, status: "active" },
        { $set: { status: "unavailable", pageAccessTokenCiphertext: null, updatedAt: now } },
        { session },
      );
      return {
        discovered: documents.length,
        instagramLinked: documents.filter((item) => item.instagramBusinessAccount).length,
        unavailable: stale.modifiedCount,
      };
    },
    (result) => ({
      actorUserId,
      action: "meta.assets.pages.discovered",
      targetType: "meta_connection",
      targetId: connectionId,
      tenantId,
      outcome: "success",
      correlationId,
      metadata: { pageCount: result.discovered, instagramLinkedCount: result.instagramLinked, unavailableCount: result.unavailable },
    }),
  );
  return {
    items: documents.map((document) => toSummary(document)),
    discovered: documents.length,
    instagramLinked: documents.filter((item) => item.instagramBusinessAccount).length,
  };
}

export async function listMetaPageAssets(db: Db, tenantIdInput: string, connectionIdInput: string): Promise<MetaPageAssetSummary[]> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const connectionId = requiredText(connectionIdInput, "connection_id");
  const documents = await db.collection<MetaPageAssetDocument>("metaAssets")
    .find({ tenantId, connectionId })
    .sort({ name: 1, providerAssetId: 1 })
    .limit(2_000)
    .toArray();
  return documents.map(toSummary);
}

/** Rotate encrypted Page tokens without ever returning plaintext from this maintenance helper. */
export async function rotateMetaPageAssetTokenEnvelopes(
  db: Db,
  vault: MetaTokenVault,
  input: { tenantId: string; connectionId: string; actorUserId: string; correlationId: string },
): Promise<{ rotated: number }> {
  const tenantId = requiredText(input.tenantId, "tenant_id");
  const connectionId = requiredText(input.connectionId, "connection_id");
  const actorUserId = requiredText(input.actorUserId, "actor_user_id");
  const correlationId = requiredText(input.correlationId, "correlation_id");
  const collection = db.collection<MetaPageAssetDocument>("metaAssets");
  const assets = await collection.find({
    tenantId, connectionId, status: "active", pageAccessTokenCiphertext: { $type: "string" },
  }).limit(2_000).toArray();
  const updates = assets.flatMap((asset) => {
    if (!asset.pageAccessTokenCiphertext) return [];
    const context = { tenantId, connectionId: connectionId + ":page:" + asset.providerAssetId };
    const envelope = vault.rotate(asset.pageAccessTokenCiphertext, context);
    return envelope === asset.pageAccessTokenCiphertext ? [] : [{
      updateOne: {
        filter: { _id: asset._id, tenantId, connectionId, status: "active", pageAccessTokenCiphertext: asset.pageAccessTokenCiphertext },
        update: { $set: { pageAccessTokenCiphertext: envelope, updatedAt: new Date() } },
      },
    }];
  });
  await withAuditTransaction(
    db,
    async (session) => {
      if (updates.length) await collection.bulkWrite(updates, { session, ordered: true });
      return { rotated: updates.length };
    },
    (result) => ({
      actorUserId,
      action: "meta.assets.page_tokens.rotated",
      targetType: "meta_connection",
      targetId: connectionId,
      tenantId,
      outcome: "success",
      correlationId,
      metadata: { rotatedPageTokenCount: result.rotated, activeKeyId: vault.activeKeyId },
    }),
  );
  return { rotated: updates.length };
}
/** Internal-only Page token access. Never expose this value from an HTTP route. */
export async function getMetaPageAccessToken(
  db: Db,
  vault: MetaTokenVault,
  tenantIdInput: string,
  connectionIdInput: string,
  pageIdInput: string,
): Promise<string> {
  const tenantId = requiredText(tenantIdInput, "tenant_id");
  const connectionId = requiredText(connectionIdInput, "connection_id");
  const pageId = requiredText(pageIdInput, "page_id", 64);
  if (!/^\\d{1,64}$/.test(pageId)) throw new Error("META_ASSET_PAGE_ID_INVALID");
  const connection = await db.collection("metaConnections").findOne({ tenantId, connectionId, status: "connected" });
  if (!connection) throw new Error("META_CONNECTION_NOT_FOUND");
  const asset = await db.collection<MetaPageAssetDocument>("metaAssets").findOne({
    tenantId, connectionId, providerAssetId: pageId, status: "active",
  });
  if (!asset?.pageAccessTokenCiphertext) throw new Error("META_ASSET_NOT_FOUND");
  return vault.decrypt(asset.pageAccessTokenCiphertext, {
    tenantId,
    connectionId: connectionId + ":page:" + pageId,
  });
}
