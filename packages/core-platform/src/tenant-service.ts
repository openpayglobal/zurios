import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { newId } from "./ids.js";
import { coreCollections } from "./repositories.js";
import type { TenantDocument } from "./types.js";

const inputSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  legalName: z.string().min(2).max(200),
  displayName: z.string().min(2).max(100),
  defaultLocale: z.string().default("en"),
  defaultCurrency: z.string().length(3).transform((value) => value.toUpperCase()).default("UGX"),
  timezone: z.string().default("Africa/Kampala"),
});

// The runtime schema validates these fields and supplies defaults. Keep the
// persisted document type explicit so MongoDB's OptionalId<TenantDocument>
// cannot infer optional business identity fields from a widened Zod result.
type TenantInput = Required<
  Pick<TenantDocument, "slug" | "legalName" | "displayName" | "defaultLocale" | "defaultCurrency" | "timezone">
>;

export async function provisionTenant(
  db: Db,
  actorId: string,
  input: unknown,
  session?: ClientSession,
): Promise<TenantDocument> {
  const data = inputSchema.parse(input) as TenantInput;
  const collections = coreCollections(db);
  const now = new Date();
  const tenantId = newId("ten");
  const doc: TenantDocument = {
    tenantId,
    ...data,
    status: "provisioning",
    metadata: {},
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
  };

  await collections.tenants.insertOne(doc, session ? { session } : {});
  return doc;
}

export async function setTenantStatus(
  db: Db,
  tenantId: string,
  status: "active" | "suspended" | "closed",
  actorId: string,
  session?: ClientSession,
): Promise<void> {
  const collections = coreCollections(db);
  const now = new Date();
  const result = await collections.tenants.updateOne(
    { tenantId },
    { $set: { status, updatedAt: now, updatedBy: actorId } },
    session ? { session } : {},
  );

  if (!result.matchedCount) throw new Error("TENANT_NOT_FOUND");

  if (status !== "active") {
    await collections.sessions.updateMany(
      { tenantId, revokedAt: { $exists: false } },
      { $set: { revokedAt: now, updatedAt: now, updatedBy: actorId } },
      session ? { session } : {},
    );
  }
}
