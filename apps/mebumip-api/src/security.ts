import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db, Document } from "mongodb";

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

export function auditEventHash(event: AuditEventInput & { occurredAt: Date }): string {
  return createHash("sha256").update(auditPayload(event)).digest("hex");
}

/** Allocate sequence, link the predecessor, sign, and insert atomically. */
export async function appendAuditEventInTransaction(db: Db, input: AuditEventInput, session: import("mongodb").ClientSession) {
  const counters = db.collection<{ _id: string; sequence: number }>("auditCounters");
  const events = db.collection("auditEvents");
  let counter = await counters.findOne({ _id: "global" }, { session });
  if (!counter) {
    const existingEvent = await events.findOne({}, { session, sort: { sequence: -1 } });
    if (existingEvent) throw new Error("AUDIT_CHAIN_BACKFILL_REQUIRED");
    await counters.insertOne({ _id: "global", sequence: 0 }, { session });
  }
  await counters.updateOne({ _id: "global" }, { $inc: { sequence: 1 }, $set: { updatedAt: new Date() } }, { session });
  counter = await counters.findOne({ _id: "global" }, { session });
  const sequence = Number(counter?.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("AUDIT_SEQUENCE_ALLOCATION_FAILED");
  const previous = sequence > 1 ? await events.findOne({ sequence: sequence - 1 }, { session }) : null;
  if (sequence > 1 && (!previous || typeof previous.eventHash !== "string")) throw new Error("AUDIT_CHAIN_BACKFILL_REQUIRED");
  const previousHash = typeof previous?.eventHash === "string" ? previous.eventHash : "GENESIS";
  const event = createAuditEvent({ ...input, sequence, previousHash });
  if (event.integrity.algorithm === "unsigned") throw new Error("AUDIT_SIGNING_KEY_REQUIRED");
  const eventHash = auditEventHash(event);
  const chainedEvent = { ...event, eventHash };
  await events.insertOne(chainedEvent as Document, { session });
  return chainedEvent;
}

/** Standalone append always uses a transaction; callers already in a transaction use appendAuditEventInTransaction. */
export async function appendAuditEvent(db: Db, input: AuditEventInput) {
  const session = db.client.startSession();
  try {
    let result: Awaited<ReturnType<typeof appendAuditEventInTransaction>> | undefined;
    await session.withTransaction(async () => {
      result = await appendAuditEventInTransaction(db, input, session);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    if (!result) throw new Error("AUDIT_EVENT_RESULT_MISSING");
    return result;
  } finally {
    await session.endSession();
  }
}

export function signAuditExport(events: Array<Record<string, unknown>>, generatedAt: string, signingKey?: string) {
  const sequences = events.map((event) => Number(event.sequence)).filter((value) => Number.isSafeInteger(value));
  const manifest = { format: "zuri-mebumip-audit-export-v1", generatedAt, count: events.length, firstSequence: sequences.length ? Math.min(...sequences) : null, lastSequence: sequences.length ? Math.max(...sequences) : null };
  const ring=loadAuditKeyRing();
  if(ring){
   const keyId=ring.activeKeyId,key=ring.keys[keyId]!;
   const versionedManifest={...manifest,format:"zuri-mebumip-audit-export-v2"};
   const payload=JSON.stringify({keyId,...versionedManifest,eventSignatures:events.map((event)=>{const integrity=event.integrity as {signature?:unknown}|undefined;return {id:String(event._id??""),sequence:event.sequence??null,previousHash:event.previousHash??null,eventHash:event.eventHash??null,signature:typeof integrity?.signature==="string"?integrity.signature:null};})});
   return {...versionedManifest,integrity:{algorithm:"HMAC-SHA256-v2" as const,keyId,signature:createHmac("sha256",key).update(payload).digest("hex")}};
  }
  const key=legacyAuditSigningKey(signingKey);
  if(!key)return {...manifest,integrity:{algorithm:"unsigned" as const,signature:null}};
  const payload=JSON.stringify({...manifest,eventSignatures:events.map((event)=>{const integrity=event.integrity as {signature?:unknown}|undefined;return {id:String(event._id??""),sequence:event.sequence??null,previousHash:event.previousHash??null,eventHash:event.eventHash??null,signature:typeof integrity?.signature==="string"?integrity.signature:null};})});
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
