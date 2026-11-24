import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DATABASE: z.string().min(1).default("zuri_mebumip"),
  CORS_ORIGINS: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  SESSION_COOKIE_SAME_SITE: z.enum(["Strict", "Lax", "None"]).default("Lax"),
  TRUSTED_PROXY_CIDRS: z.string().optional(),
  PLATFORM_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  MFA_ENCRYPTION_KEYRING: z.string().max(16384).optional(),
  MFA_ENCRYPTION_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  AUDIT_SIGNING_KEY: z.string().min(32).optional(),
  AUDIT_SIGNING_KEYRING: z.string().max(16384).optional(),
  AUDIT_SIGNING_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  MAIL_FROM: z.string().email().optional(),
});

const parsed = envSchema.superRefine((value, context) => {
  if (value.SESSION_COOKIE_SAME_SITE === "None" && value.NODE_ENV !== "production") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SESSION_COOKIE_SAME_SITE"], message: "SameSite=None requires production HTTPS cookies" });
  }
  let keyring: Record<string, unknown> | undefined;
  if (value.MFA_ENCRYPTION_KEYRING) {
    try {
      const parsedKeyring: unknown = JSON.parse(value.MFA_ENCRYPTION_KEYRING);
      if (!parsedKeyring || typeof parsedKeyring !== "object" || Array.isArray(parsedKeyring)) throw new Error("MFA key ring must be a JSON object");
      keyring = parsedKeyring as Record<string, unknown>;
      if (Object.keys(keyring).length < 1 || Object.keys(keyring).length > 20) throw new Error("MFA key ring must contain between 1 and 20 keys");
      for (const [keyId, key] of Object.entries(keyring)) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || typeof key !== "string" || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Each MFA key-ring entry must have a valid identifier and 32-byte hex key");
      }
      if (!value.MFA_ENCRYPTION_ACTIVE_KEY_ID || !Object.prototype.hasOwnProperty.call(keyring, value.MFA_ENCRYPTION_ACTIVE_KEY_ID)) throw new Error("MFA_ENCRYPTION_ACTIVE_KEY_ID must identify a key in MFA_ENCRYPTION_KEYRING");
      if (value.MFA_ENCRYPTION_KEY && typeof keyring.legacy === "string" && value.MFA_ENCRYPTION_KEY.toLowerCase() !== keyring.legacy.toLowerCase()) throw new Error("MFA_ENCRYPTION_KEY conflicts with the legacy key-ring entry");
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_KEYRING"], message: error instanceof Error ? error.message : "Invalid MFA key ring" });
    }
  } else if (value.MFA_ENCRYPTION_ACTIVE_KEY_ID) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_ACTIVE_KEY_ID"], message: "An active key ID requires MFA_ENCRYPTION_KEYRING" });
  }
  if (value.NODE_ENV === "production" && !value.MONGODB_URI) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MONGODB_URI"], message: "MONGODB_URI is required in production" });
  }
  const effectiveCorsOrigins = value.CORS_ORIGINS ?? (value.NODE_ENV === "production" ? "https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app" : "http://localhost:5174");
  if (value.NODE_ENV === "production" && effectiveCorsOrigins.split(",").some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Production CORS_ORIGINS must not include localhost" });
  }
  let auditKeyring: Record<string, unknown> | undefined;
  if (value.AUDIT_SIGNING_KEYRING) {
    try {
      const parsedRing: unknown = JSON.parse(value.AUDIT_SIGNING_KEYRING);
      if (!parsedRing || typeof parsedRing !== "object" || Array.isArray(parsedRing)) throw new Error("Audit key ring must be a JSON object");
      auditKeyring = parsedRing as Record<string, unknown>;
      if (Object.keys(auditKeyring).length < 1 || Object.keys(auditKeyring).length > 20) throw new Error("Audit key ring must contain between 1 and 20 keys");
      for (const [keyId, key] of Object.entries(auditKeyring)) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || typeof key !== "string" || (keyId === "legacy" ? !/^(?:[a-fA-F0-9]{2}){32,}$/.test(key) : !/^[a-fA-F0-9]{64}$/.test(key))) throw new Error("Audit key-ring entries must be valid hex keys; non-legacy keys must be 32 bytes");
      }
      if (!value.AUDIT_SIGNING_ACTIVE_KEY_ID || value.AUDIT_SIGNING_ACTIVE_KEY_ID === "legacy" || !Object.prototype.hasOwnProperty.call(auditKeyring, value.AUDIT_SIGNING_ACTIVE_KEY_ID) || typeof auditKeyring[value.AUDIT_SIGNING_ACTIVE_KEY_ID] !== "string" || !/^[a-fA-F0-9]{64}$/.test(auditKeyring[value.AUDIT_SIGNING_ACTIVE_KEY_ID] as string)) throw new Error("AUDIT_SIGNING_ACTIVE_KEY_ID must identify a non-legacy 32-byte key in AUDIT_SIGNING_KEYRING");
      if (value.AUDIT_SIGNING_KEY && typeof auditKeyring.legacy === "string" && Buffer.from(value.AUDIT_SIGNING_KEY).toString("hex") !== auditKeyring.legacy.toLowerCase()) throw new Error("AUDIT_SIGNING_KEY conflicts with the legacy key-ring entry");
      if (value.NODE_ENV === "production" && !value.AUDIT_SIGNING_KEY && !Object.prototype.hasOwnProperty.call(auditKeyring, "legacy")) throw new Error("Legacy audit key must be retained while historical events use the original signature format");
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_KEYRING"], message: error instanceof Error ? error.message : "Invalid audit key ring" });
    }
  } else if (value.AUDIT_SIGNING_ACTIVE_KEY_ID) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_ACTIVE_KEY_ID"], message: "An active audit key ID requires AUDIT_SIGNING_KEYRING" });
  }
}).safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid Zuri MeBuMIP API configuration: ${parsed.error.message}`);
}

export const config = { ...parsed.data, CORS_ORIGINS: parsed.data.CORS_ORIGINS ?? (parsed.data.NODE_ENV === "production" ? "https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app" : "http://localhost:5174") };
export const corsOrigins = config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);


const macRuntimeSecretSchema = z.object({
  RESEND_API_KEY: z.string().min(10).optional(),
  MAIL_FROM: z.string().email().optional(),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  MFA_ENCRYPTION_KEYRING: z.string().max(16384).optional(),
  MFA_ENCRYPTION_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  AUDIT_SIGNING_KEY: z.string().min(32).optional(),
  AUDIT_SIGNING_KEYRING: z.string().max(16384).optional(),
  AUDIT_SIGNING_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
}).superRefine((value, context) => {
  if (Boolean(value.RESEND_API_KEY) !== Boolean(value.MAIL_FROM)) {
    context.addIssue({ code:z.ZodIssueCode.custom,path:["RESEND_API_KEY"],message:"MAC must deliver RESEND_API_KEY and MAIL_FROM together" });
  }
  if (value.MFA_ENCRYPTION_KEYRING) {
    try {
      const ring: unknown = JSON.parse(value.MFA_ENCRYPTION_KEYRING);
      if (!ring || typeof ring !== "object" || Array.isArray(ring)) throw new Error("MFA key ring must be an object");
      const keys = ring as Record<string,unknown>;
      if (Object.keys(keys).length < 1 || Object.keys(keys).length > 20) throw new Error("MFA key ring must contain 1–20 keys");
      for (const [id,key] of Object.entries(keys)) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof key !== "string" || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Invalid MFA key-ring entry");
      }
      if (!value.MFA_ENCRYPTION_ACTIVE_KEY_ID || !Object.hasOwn(keys,value.MFA_ENCRYPTION_ACTIVE_KEY_ID)) throw new Error("MFA active key ID must exist in the key ring");
      if (!value.MFA_ENCRYPTION_KEY && typeof keys.legacy !== "string") throw new Error("Retain the legacy MFA key until historical secrets are re-encrypted");
      if (value.MFA_ENCRYPTION_KEY && typeof keys.legacy === "string" && value.MFA_ENCRYPTION_KEY.toLowerCase() !== keys.legacy.toLowerCase()) throw new Error("MFA legacy key conflicts with key ring");
    } catch (error) {
      context.addIssue({code:z.ZodIssueCode.custom,path:["MFA_ENCRYPTION_KEYRING"],message:error instanceof Error?error.message:"Invalid MFA key ring"});
    }
  } else if (value.MFA_ENCRYPTION_ACTIVE_KEY_ID) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["MFA_ENCRYPTION_ACTIVE_KEY_ID"],message:"MFA active key ID requires a key ring"});
  }
  if (value.AUDIT_SIGNING_KEYRING) {
    try {
      const ring: unknown = JSON.parse(value.AUDIT_SIGNING_KEYRING);
      if (!ring || typeof ring !== "object" || Array.isArray(ring)) throw new Error("Audit key ring must be an object");
      const keys = ring as Record<string,unknown>;
      if (Object.keys(keys).length < 1 || Object.keys(keys).length > 20) throw new Error("Audit key ring must contain 1–20 keys");
      for (const [id,key] of Object.entries(keys)) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof key !== "string" || (id === "legacy" ? !/^(?:[a-fA-F0-9]{2}){32,}$/.test(key) : !/^[a-fA-F0-9]{64}$/.test(key))) throw new Error("Invalid audit key-ring entry");
      }
      if (!value.AUDIT_SIGNING_ACTIVE_KEY_ID || value.AUDIT_SIGNING_ACTIVE_KEY_ID === "legacy" || !Object.hasOwn(keys,value.AUDIT_SIGNING_ACTIVE_KEY_ID)) throw new Error("Audit active key ID must identify a non-legacy key");
      if (!value.AUDIT_SIGNING_KEY && typeof keys.legacy !== "string") throw new Error("Retain the legacy audit key until historical events are re-signed or archived");
      if (value.AUDIT_SIGNING_KEY && typeof keys.legacy === "string" && Buffer.from(value.AUDIT_SIGNING_KEY).toString("hex") !== keys.legacy.toLowerCase()) throw new Error("Audit legacy key conflicts with key ring");
    } catch (error) {
      context.addIssue({code:z.ZodIssueCode.custom,path:["AUDIT_SIGNING_KEYRING"],message:error instanceof Error?error.message:"Invalid audit key ring"});
    }
  } else if (value.AUDIT_SIGNING_ACTIVE_KEY_ID) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["AUDIT_SIGNING_ACTIVE_KEY_ID"],message:"Audit active key ID requires a key ring"});
  }
});

const macSecretEnvironmentKeys = [
  "RESEND_API_KEY","MAIL_FROM","MFA_ENCRYPTION_KEY","MFA_ENCRYPTION_KEYRING",
  "MFA_ENCRYPTION_ACTIVE_KEY_ID","AUDIT_SIGNING_KEY","AUDIT_SIGNING_KEYRING",
  "AUDIT_SIGNING_ACTIVE_KEY_ID",
] as const;

/**
 * MAC is authoritative for provider/MFA/audit secrets in Production.
 * Apply a complete validated snapshot atomically so revocation also clears
 * previously cached values from this process. MONGODB_URI intentionally
 * remains a bootstrap dependency because MAC itself requires a database.
 */
export function applyMacRuntimeSecrets(secrets: Record<string, string>): void {
  const next = macRuntimeSecretSchema.parse({
    RESEND_API_KEY: secrets["resend-api-key"],
    MAIL_FROM: secrets["mail-from"],
    MFA_ENCRYPTION_KEY: secrets["mebumip-mfa-encryption-key"],
    MFA_ENCRYPTION_KEYRING: secrets["mfa-encryption-keyring"],
    MFA_ENCRYPTION_ACTIVE_KEY_ID: secrets["mfa-encryption-active-key-id"],
    AUDIT_SIGNING_KEY: secrets["mebumip-audit-signing-key"],
    AUDIT_SIGNING_KEYRING: secrets["audit-signing-keyring"],
    AUDIT_SIGNING_ACTIVE_KEY_ID: secrets["audit-signing-active-key-id"],
  });
  Object.assign(config, next);
  for (const key of macSecretEnvironmentKeys) {
    const value = next[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
