import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ClientSession, Db, Document } from "mongodb";

export const PLATFORM_ROLES = ["platform_owner", "platform_admin", "platform_operator", "platform_auditor"] as const;
export const TENANT_ROLES = ["tenant_owner", "tenant_admin", "publisher", "advertiser", "support_agent", "viewer"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type TenantRole = (typeof TENANT_ROLES)[number];
export type Permission =
  | "platform:settings:read" | "platform:settings:write"
  | "platform:tenants:read" | "platform:tenants:write"
  | "platform:admins:read" | "platform:admins:write"
  | "platform:audit:read" | "platform:metrics:read"
  | "tenant:members:read" | "tenant:members:write"
  | "meta:connections:read" | "meta:connections:write"
  | "social:assets:read" | "social:assets:write"
  | "ads:read" | "ads:write" | "whatsapp:read" | "whatsapp:write"
  | "integrations:read" | "integrations:write";

export interface Principal {
  userId: string;
  platformRole?: PlatformRole;
  tenantMemberships: Array<{ tenantId: string; role: TenantRole; status: "active" | "suspended" }>;
}

const PLATFORM_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  platform_owner: ["platform:settings:read", "platform:settings:write", "platform:tenants:read", "platform:tenants:write", "platform:admins:read", "platform:admins:write", "platform:audit:read", "platform:metrics:read"],
  platform_admin: ["platform:settings:read", "platform:settings:write", "platform:tenants:read", "platform:tenants:write", "platform:admins:read", "platform:audit:read", "platform:metrics:read"],
  platform_operator: ["platform:tenants:read", "platform:metrics:read"],
  platform_auditor: ["platform:settings:read", "platform:tenants:read", "platform:admins:read", "platform:audit:read", "platform:metrics:read"],
};
const TENANT_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  tenant_owner: ["tenant:members:read", "tenant:members:write", "meta:connections:read", "meta:connections:write", "social:assets:read", "social:assets:write", "ads:read", "ads:write", "whatsapp:read", "whatsapp:write", "integrations:read", "integrations:write"],
  tenant_admin: ["tenant:members:read", "tenant:members:write", "meta:connections:read", "meta:connections:write", "social:assets:read", "social:assets:write", "ads:read", "ads:write", "whatsapp:read", "whatsapp:write", "integrations:read", "integrations:write"],
  publisher: ["meta:connections:read", "social:assets:read", "social:assets:write"],
  advertiser: ["meta:connections:read", "ads:read", "ads:write"],
  support_agent: ["meta:connections:read", "social:assets:read", "whatsapp:read"],
  viewer: ["tenant:members:read", "meta:connections:read", "social:assets:read", "ads:read", "whatsapp:read", "integrations:read"],
};

export function hasPlatformPermission(principal: Principal, permission: Permission): boolean {
  return principal.platformRole ? PLATFORM_PERMISSIONS[principal.platformRole].includes(permission) : false;
}

export function hasTenantPermission(principal: Principal, tenantId: string, permission: Permission): boolean {
  const membership = principal.tenantMemberships.find((item) => item.tenantId === tenantId && item.status === "active");
  return membership ? TENANT_PERMISSIONS[membership.role].includes(permission) : false;
}

export function assertTenantAccess(principal: Principal, tenantId: string): void {
  if (!tenantId || !principal.tenantMemberships.some((item) => item.tenantId === tenantId && item.status === "active")) {
    throw new AuthorizationError("TENANT_ACCESS_DENIED");
  }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "FORBIDDEN") { super(message); this.name = "AuthorizationError"; }
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AuditEventInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  tenantId?: string;
  outcome: "success" | "denied" | "failure";
  correlationId: string;
  occurredAt?: Date;
  sequence?: number;
  previousHash?: string;
  eventHash?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

type AuditEventPayload = Omit<AuditEventInput, "occurredAt"> & { occurredAt: Date };

type AuditKeyRing={keys:Record<string,Buffer>;activeKeyId:string;legacyKey?:Buffer};
function loadAuditKeyRing():AuditKeyRing|null{
 const raw=process.env.AUDIT_SIGNING_KEYRING;
 if(!raw)return null;
 const parsed:unknown=JSON.parse(raw);
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("INVALID_AUDIT_SIGNING_KEYRING");
 const keys=Object.create(null) as Record<string,Buffer>;
 for(const [keyId,value] of Object.entries(parsed as Record<string,unknown>)){
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)||typeof value!=="string"||(keyId==="legacy"?!/^(?:[a-fA-F0-9]{2}){32,}$/.test(value):!/^[a-fA-F0-9]{64}$/.test(value)))throw new Error("INVALID_AUDIT_SIGNING_KEYRING");
  keys[keyId]=Buffer.from(value,"hex");
 }
 const activeKeyId=process.env.AUDIT_SIGNING_ACTIVE_KEY_ID??"";
 if(!activeKeyId||activeKeyId==="legacy"||!Object.hasOwn(keys,activeKeyId)||keys[activeKeyId]!.length!==32)throw new Error("AUDIT_ACTIVE_SIGNING_KEY_NOT_AVAILABLE");
 const environmentLegacy=process.env.AUDIT_SIGNING_KEY?Buffer.from(process.env.AUDIT_SIGNING_KEY):undefined;
 if(environmentLegacy&&keys.legacy&&(environmentLegacy.length!==keys.legacy.length||!timingSafeEqual(environmentLegacy,keys.legacy)))throw new Error("AUDIT_LEGACY_KEY_CONFIGURATION_CONFLICT");
 const legacyKey=environmentLegacy??keys.legacy;
 return {keys,activeKeyId,...(legacyKey?{legacyKey}:{})};
}
function legacyAuditSigningKey(explicit?:string):Buffer|undefined{
 if(explicit)return Buffer.from(explicit);
 const ring=loadAuditKeyRing();
 if(process.env.AUDIT_SIGNING_KEY)return Buffer.from(process.env.AUDIT_SIGNING_KEY);
 return ring?.legacyKey;
}

function auditPayload(event: AuditEventPayload,keyId?:string): string {
  return JSON.stringify({
    ...(keyId?{keyId}:{}),
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    ...(event.targetId ? { targetId: event.targetId } : {}),
    ...(event.tenantId ? { tenantId: event.tenantId } : {}),
    outcome: event.outcome,
    correlationId: event.correlationId,
    occurredAt: event.occurredAt.toISOString(),
    ...(typeof event.sequence === "number" ? { sequence: event.sequence } : {}),
    ...(typeof event.previousHash === "string" ? { previousHash: event.previousHash } : {}),
    ...(typeof event.eventHash === "string" ? { eventHash: event.eventHash } : {}),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  });
}

export function createAuditEvent(input: AuditEventInput) {
  const event: AuditEventPayload = { ...input, occurredAt: input.occurredAt ?? new Date() };
  const ring=loadAuditKeyRing();
  if(ring){
   const keyId=ring.activeKeyId,key=ring.keys[keyId]!;
   const integrity={algorithm:"HMAC-SHA256-v2" as const,keyId,signature:createHmac("sha256",key).update(auditPayload(event,keyId)).digest("hex")};
   return {...event,integrity};
  }
  const signingKey=legacyAuditSigningKey();
  const integrity=signingKey
   ?{algorithm:"HMAC-SHA256" as const,signature:createHmac("sha256",signingKey).update(auditPayload(event)).digest("hex")}
   :{algorithm:"unsigned" as const,signature:null};
  return {...event,integrity};
}

export function verifyAuditEvent(event: Record<string, unknown>, signingKey?: string): boolean {
 if(!event.integrity||typeof event.integrity!=="object")return false;
 const integrity=event.integrity as {algorithm?:unknown;signature?:unknown;keyId?:unknown};
 if(typeof integrity.signature!=="string"||!/^[a-f0-9]{64}$/.test(integrity.signature))return false;
 if(!(event.occurredAt instanceof Date)||typeof event.actorUserId!=="string"||typeof event.action!=="string"||typeof event.targetType!=="string"||typeof event.outcome!=="string"||typeof event.correlationId!=="string")return false;
 const payload:AuditEventPayload={
  actorUserId:event.actorUserId,action:event.action,targetType:event.targetType,
  ...(typeof event.targetId==="string"?{targetId:event.targetId}:{}),
  ...(typeof event.tenantId==="string"?{tenantId:event.tenantId}:{}),
  outcome:event.outcome as AuditEventInput["outcome"],correlationId:event.correlationId,occurredAt:event.occurredAt,
  ...(typeof event.sequence==="number"?{sequence:event.sequence}:{}),
  ...(typeof event.previousHash==="string"?{previousHash:event.previousHash}:{}),
  ...(typeof event.eventHash==="string"?{eventHash:event.eventHash}:{}),
  ...(event.metadata&&typeof event.metadata==="object"?{metadata:event.metadata as NonNullable<AuditEventInput["metadata"]>}:{}),
 };
 let key:Buffer|undefined,expected:Buffer;
 if(integrity.algorithm==="HMAC-SHA256"){
  key=legacyAuditSigningKey(signingKey);
  if(!key)return false;
  expected=createHmac("sha256",key).update(auditPayload(payload)).digest();
 }else if(integrity.algorithm==="HMAC-SHA256-v2"&&typeof integrity.keyId==="string"){
  const ring=loadAuditKeyRing();
  key=signingKey?Buffer.from(signingKey):ring?.keys[integrity.keyId];
  if(!key)return false;
  expected=createHmac("sha256",key).update(auditPayload(payload,integrity.keyId)).digest();
 }else return false;
 const actual=Buffer.from(integrity.signature,"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

const AUDIT_GENESIS_HASH = "GENESIS";
const AUDIT_BACKFILL_LIMIT = 5_000;
type ChainedAuditEvent = Document & { sequence: number; previousHash: string; eventHash: string; occurredAt: Date };

function canonicalAuditChainPayload(event: AuditEventInput & { sequence: number; previousHash: string; occurredAt: Date }): string {
  const metadata = event.metadata ? Object.fromEntries(Object.entries(event.metadata).sort(([a], [b]) => a.localeCompare(b))) : null;
  return JSON.stringify({
    sequence: event.sequence, previousHash: event.previousHash, actorUserId: event.actorUserId,
    action: event.action, targetType: event.targetType, targetId: event.targetId ?? null,
    tenantId: event.tenantId ?? null, outcome: event.outcome, correlationId: event.correlationId,
    occurredAt: event.occurredAt.toISOString(), metadata,
  });
}
const auditDigest = (payload: string) => createHash("sha256").update(payload).digest("hex");

export function createChainedAuditEvent(input: AuditEventInput, sequence: number, previousHash: string) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("AUDIT_SEQUENCE_INVALID");
  if (sequence === 1 ? previousHash !== AUDIT_GENESIS_HASH : !/^[a-f0-9]{64}$/i.test(previousHash)) throw new Error("AUDIT_PREDECESSOR_HASH_INVALID");
  const occurredAt = input.occurredAt ?? new Date();
  const eventHash = auditDigest(canonicalAuditChainPayload({ ...input, sequence, previousHash, occurredAt }));
  return createAuditEvent({ ...input, occurredAt, sequence, previousHash, eventHash });
}

export function verifyAuditChainEvents(events: Array<Record<string, unknown>>, expectedFirstSequence?: number): boolean {
  if (!events.length) return expectedFirstSequence === undefined || expectedFirstSequence === 1;
  let expectedSequence = expectedFirstSequence ?? Number(events[0]?.sequence);
  if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 1) return false;
  let previousHash: string | undefined;
  for (const event of events) {
    const sequence = Number(event.sequence);
    const occurredAt = event.occurredAt instanceof Date ? event.occurredAt : new Date(String(event.occurredAt ?? ""));
    if (sequence !== expectedSequence || Number.isNaN(occurredAt.getTime()) || typeof event.previousHash !== "string" || typeof event.eventHash !== "string") return false;
    if (previousHash !== undefined && event.previousHash !== previousHash) return false;
    if (sequence === 1 && event.previousHash !== AUDIT_GENESIS_HASH) return false;
    if (sequence > 1 && !/^[a-f0-9]{64}$/i.test(event.previousHash)) return false;
    const payload = canonicalAuditChainPayload({
      actorUserId: String(event.actorUserId), action: String(event.action), targetType: String(event.targetType),
      ...(typeof event.targetId === "string" ? { targetId: event.targetId } : {}),
      ...(typeof event.tenantId === "string" ? { tenantId: event.tenantId } : {}),
      outcome: event.outcome as AuditEventInput["outcome"], correlationId: String(event.correlationId),
      ...(event.metadata && typeof event.metadata === "object" ? { metadata: event.metadata as NonNullable<AuditEventInput["metadata"]> } : {}),
      sequence, previousHash: event.previousHash, occurredAt,
    });
    if (event.eventHash !== auditDigest(payload) || !verifyAuditEvent(event)) return false;
    previousHash = event.eventHash;
    expectedSequence += 1;
  }
  return true;
}

/** Append inside a caller-owned transaction; used by atomic multi-record mutations. */
export async function appendAuditEventInTransaction(db: Db, input: AuditEventInput, session: ClientSession): Promise<void> {
  const counters = db.collection<{ _id: string; sequence: number; updatedAt: Date }>("auditCounters");
  await counters.updateOne({ _id: "global" }, { $inc: { sequence: 1 }, $set: { updatedAt: new Date() } }, { upsert: true, session });
  const counter = await counters.findOne({ _id: "global" }, { session });
  const sequence = Number(counter?.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("AUDIT_SEQUENCE_INVALID");
  const events = db.collection<ChainedAuditEvent>("auditEvents");
  const previous = sequence > 1 ? await events.findOne({ sequence: sequence - 1 }, { session }) : null;
  if (sequence > 1 && (!previous || typeof previous.eventHash !== "string")) throw new Error("AUDIT_CHAIN_PREDECESSOR_MISSING");
  if (sequence === 1 && await events.countDocuments({}, { session }) > 0) throw new Error("AUDIT_CHAIN_BACKFILL_REQUIRED");
  const event = createChainedAuditEvent(input, sequence, previous?.eventHash ?? AUDIT_GENESIS_HASH);
  await events.insertOne(event as ChainedAuditEvent, { session });
}

/** Sequence allocation, predecessor lookup, hash and signed event commit atomically. */
export async function appendAuditEvent(db: Db, input: AuditEventInput) {
  const session = db.client.startSession();
  try {
    let appended: ReturnType<typeof createChainedAuditEvent> | undefined;
    await session.withTransaction(async () => {
      await appendAuditEventInTransaction(db, input, session);
      const counter = await db.collection<{ _id: string; sequence: number }>("auditCounters").findOne({ _id: "global" }, { session });
      const sequence = Number(counter?.sequence);
      appended = await db.collection<ReturnType<typeof createChainedAuditEvent>>("auditEvents").findOne({ sequence }, { session }) ?? undefined;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    if (!appended) throw new Error("AUDIT_APPEND_RESULT_MISSING");
    return appended;
  } finally { await session.endSession(); }
}

export async function verifyAuditChain(db: Db) {
  const events = await db.collection<ChainedAuditEvent>("auditEvents").find({}).sort({ sequence: 1, occurredAt: 1, _id: 1 }).toArray();
  const legacyUnchainedEvents = events.filter(event => !Number.isSafeInteger(event.sequence) || typeof event.previousHash !== "string" || typeof event.eventHash !== "string").length;
  const chained = events.filter(event => Number.isSafeInteger(event.sequence) && typeof event.previousHash === "string" && typeof event.eventHash === "string");
  const chainValid = legacyUnchainedEvents === 0 && verifyAuditChainEvents(chained as Array<Record<string, unknown>>, 1);
  let firstInvalidSequence: number | null = null;
  if (!chainValid && chained.length) {
    let expected = 1, previousHash = AUDIT_GENESIS_HASH;
    for (const event of chained) {
      if (event.sequence !== expected || event.previousHash !== previousHash || !verifyAuditChainEvents([event as Record<string, unknown>], expected)) { firstInvalidSequence = Number(event.sequence); break; }
      previousHash = event.eventHash; expected += 1;
    }
  }
  const counter = await db.collection<{ _id: string; sequence: number }>("auditCounters").findOne({ _id: "global" });
  const counterSequence = Number(counter?.sequence ?? 0);
  const latestSequence = chained.length ? Number(chained[chained.length - 1]!.sequence) : 0;
  const counterMatches = Number.isSafeInteger(counterSequence) && counterSequence === latestSequence;
  return { valid: chainValid && counterMatches, chainValid, checked: chained.length, legacyUnchainedEvents, latestSequence, latestHash: chained.length ? String(chained[chained.length - 1]!.eventHash) : AUDIT_GENESIS_HASH, firstInvalidSequence, counterSequence, counterMatches };
}

export async function planAuditChainBackfill(db: Db) {
  const events = await db.collection("auditEvents").find({}).sort({ occurredAt: 1, _id: 1 }).toArray();
  const legacy = events.filter(event => typeof event.previousHash !== "string" || typeof event.eventHash !== "string");
  const chainedCount = events.length - legacy.length;
  const oldest = legacy[0], newest = legacy[legacy.length - 1];
  const invalidLegacyCount = legacy.filter(event => !(event.occurredAt instanceof Date) || !["success", "denied", "failure"].includes(String(event.outcome)) || typeof event.actorUserId !== "string" || typeof event.action !== "string" || typeof event.targetType !== "string" || typeof event.correlationId !== "string").length;
  const reason = chainedCount > 0 && legacy.length > 0 ? "LEGACY_AND_CHAINED_EVENTS_MIXED: stop and reconcile before backfill"
    : legacy.length > AUDIT_BACKFILL_LIMIT ? "BACKFILL_LIMIT_EXCEEDED: approved maintenance migration required"
    : invalidLegacyCount > 0 ? "LEGACY_EVENTS_INVALID: inspect timestamps, actor, action, target and outcome" : null;
  return { legacyCount: legacy.length, sequencedCount: events.filter(event => Number.isSafeInteger(event.sequence)).length, maximumSupported: AUDIT_BACKFILL_LIMIT, invalidLegacyCount, applyAllowed: reason === null && legacy.length > 0, reason, oldestLegacyAt: oldest?.occurredAt instanceof Date ? oldest.occurredAt.toISOString() : null, newestLegacyAt: newest?.occurredAt instanceof Date ? newest.occurredAt.toISOString() : null };
}

export async function applyAuditChainBackfill(db: Db): Promise<{ migrated: number; latestSequence: number }> {
  const session = db.client.startSession(); let migrated = 0;
  try {
    await session.withTransaction(async () => {
      const collection = db.collection<ChainedAuditEvent>("auditEvents");
      const events = await collection.find({}, { session }).sort({ occurredAt: 1, _id: 1 }).toArray();
      const legacy = events.filter(event => typeof event.previousHash !== "string" || typeof event.eventHash !== "string");
      if (events.length - legacy.length > 0 && legacy.length > 0) throw new Error("LEGACY_AND_CHAINED_EVENTS_MIXED");
      if (legacy.length > AUDIT_BACKFILL_LIMIT) throw new Error("AUDIT_BACKFILL_LIMIT_EXCEEDED");
      if (!legacy.length) return;
      let previousHash = AUDIT_GENESIS_HASH, sequence = 0;
      for (const old of legacy) {
        sequence += 1;
        const occurredAt = old.occurredAt instanceof Date ? old.occurredAt : new Date(String(old.occurredAt ?? ""));
        if (Number.isNaN(occurredAt.getTime())) throw new Error("LEGACY_AUDIT_TIMESTAMP_INVALID");
        if (!["success", "denied", "failure"].includes(String(old.outcome))) throw new Error("LEGACY_AUDIT_OUTCOME_INVALID");
        const input: AuditEventInput = {
          actorUserId: String(old.actorUserId ?? "unknown"), action: String(old.action ?? "legacy.unknown"), targetType: String(old.targetType ?? "unknown"),
          ...(typeof old.targetId === "string" ? { targetId: old.targetId } : {}), ...(typeof old.tenantId === "string" ? { tenantId: old.tenantId } : {}),
          outcome: old.outcome as AuditEventInput["outcome"], correlationId: String(old.correlationId ?? String(old._id)), occurredAt,
          ...(old.metadata && typeof old.metadata === "object" ? { metadata: old.metadata as AuditEventInput["metadata"] } : {}),
        };
        const chained = createChainedAuditEvent(input, sequence, previousHash);
        const result = await collection.updateOne({ _id: old._id, $or: [{ previousHash: { $exists: false } }, { eventHash: { $exists: false } }] }, { $set: { sequence, previousHash, eventHash: chained.eventHash, integrity: chained.integrity, occurredAt } }, { session });
        if (result.modifiedCount !== 1) throw new Error("LEGACY_AUDIT_EVENT_CHANGED_DURING_BACKFILL");
        previousHash = chained.eventHash;
      }
      await db.collection("auditCounters").updateOne({ _id: "global" }, { $set: { sequence, updatedAt: new Date() } }, { upsert: true, session });
      migrated = sequence;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return { migrated, latestSequence: migrated };
  } finally { await session.endSession(); }
}

export async function exportAuditArchive(db: Db) {
  const verification = await verifyAuditChain(db);
  if (!verification.valid) throw new Error("AUDIT_CHAIN_NOT_COMPLETE_FOR_ARCHIVE");
  const events = await db.collection<ChainedAuditEvent>("auditEvents").find({}).sort({ sequence: 1 }).toArray();
  const manifest = signAuditExport(events as Array<Record<string, unknown>>, new Date().toISOString());
  const integrity = manifest.integrity as { algorithm?: unknown };
  if (integrity.algorithm === "unsigned") throw new Error("AUDIT_ARCHIVE_MANIFEST_UNSIGNED");
  return { manifest, events };
}

export function verifyAuditArchiveBundle(value: unknown) {
  if (!value || typeof value !== "object") return { valid: false, checked: 0, firstInvalidSequence: null as number | null, reason: "ARCHIVE_INVALID_SHAPE" };
  const bundle = value as { manifest?: Record<string, unknown>; events?: Array<Record<string, unknown>> };
  if (!bundle.manifest || !Array.isArray(bundle.events)) return { valid: false, checked: 0, firstInvalidSequence: null as number | null, reason: "ARCHIVE_INVALID_SHAPE" };
  if (!verifyAuditExportManifest(bundle.manifest, bundle.events)) return { valid: false, checked: 0, firstInvalidSequence: null as number | null, reason: "ARCHIVE_MANIFEST_INVALID" };
  if (!verifyAuditChainEvents(bundle.events, 1)) return { valid: false, checked: bundle.events.length, firstInvalidSequence: null as number | null, reason: "ARCHIVE_CHAIN_INVALID" };
  return { valid: true, checked: bundle.events.length, firstInvalidSequence: null as number | null, reason: null };
}

export function signAuditExport(events: Array<Record<string, unknown>>, generatedAt: string, signingKey?: string) {
  const sequences = events.map((event) => Number(event.sequence)).filter((value) => Number.isSafeInteger(value));
  const manifest = { format: "zuri-mebumip-audit-export-v1", generatedAt, count: events.length, firstSequence: sequences.length ? Math.min(...sequences) : null, lastSequence: sequences.length ? Math.max(...sequences) : null };
  const ring=loadAuditKeyRing();
  if(ring){
   const keyId=ring.activeKeyId,key=ring.keys[keyId]!;
   const versionedManifest={...manifest,format:"zuri-mebumip-audit-export-v2"};
   const payload=JSON.stringify({keyId,...versionedManifest,eventSignatures:events.map((event)=>{const integrity=event.integrity as {signature?:unknown}|undefined;return {id:String(event._id??""),sequence:event.sequence??null,signature:typeof integrity?.signature==="string"?integrity.signature:null};})});
   return {...versionedManifest,integrity:{algorithm:"HMAC-SHA256-v2" as const,keyId,signature:createHmac("sha256",key).update(payload).digest("hex")}};
  }
  const key=legacyAuditSigningKey(signingKey);
  if(!key)return {...manifest,integrity:{algorithm:"unsigned" as const,signature:null}};
  const payload=JSON.stringify({...manifest,eventSignatures:events.map((event)=>{const integrity=event.integrity as {signature?:unknown}|undefined;return {id:String(event._id??""),sequence:event.sequence??null,signature:typeof integrity?.signature==="string"?integrity.signature:null};})});
  return {...manifest,integrity:{algorithm:"HMAC-SHA256" as const,signature:createHmac("sha256",key).update(payload).digest("hex")}};
}

export function verifyAuditExportManifest(manifest:Record<string,unknown>,events:Array<Record<string,unknown>>,signingKey?:string):boolean{
 const integrity=manifest.integrity as {algorithm?:unknown;signature?:unknown;keyId?:unknown}|undefined;
 if(!integrity||typeof integrity.signature!=="string"||!/^[a-f0-9]{64}$/.test(integrity.signature))return false;
 const fields={format:manifest.format,generatedAt:manifest.generatedAt,count:manifest.count,firstSequence:manifest.firstSequence,lastSequence:manifest.lastSequence};
 const eventSignatures=events.map(event=>{const eventIntegrity=event.integrity as {signature?:unknown}|undefined;return {id:String(event._id??""),sequence:event.sequence??null,signature:typeof eventIntegrity?.signature==="string"?eventIntegrity.signature:null};});
 let key:Buffer|undefined,payload:string;
 if(integrity.algorithm==="HMAC-SHA256-v2"&&typeof integrity.keyId==="string"){
  const ring=loadAuditKeyRing();
  key=signingKey?Buffer.from(signingKey):ring?.keys[integrity.keyId];
  if(!key)return false;
  payload=JSON.stringify({keyId:integrity.keyId,...fields,eventSignatures});
 }else if(integrity.algorithm==="HMAC-SHA256"){
  key=legacyAuditSigningKey(signingKey);
  if(!key)return false;
  payload=JSON.stringify({...fields,eventSignatures});
 }else return false;
 const expected=createHmac("sha256",key).update(payload).digest();
 const actual=Buffer.from(integrity.signature,"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
