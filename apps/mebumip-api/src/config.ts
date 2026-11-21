import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DATABASE: z.string().min(1).default("zuri_mebumip"),
  CORS_ORIGINS: z.string().default("http://localhost:5174"),
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
  META_APP_ID: z.string().regex(/^\d{6,32}$/).optional(),
  META_APP_SECRET: z.string().min(32).optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(32).optional(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).optional(),
  META_LOGIN_CONFIG_ID: z.string().regex(/^[A-Za-z0-9_-]{4,128}$/).optional(),
  META_MARKETING_API_VERSION: z.string().regex(/^v\d+\.\d+$/).optional(),
  META_TOKEN_ENCRYPTION_KEYRING: z.string().max(16384).optional(),
  META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
});

const runtimeSchema = envSchema.superRefine((value, context) => {
  if (value.SESSION_COOKIE_SAME_SITE === "None" && value.NODE_ENV !== "production") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SESSION_COOKIE_SAME_SITE"], message: "SameSite=None requires production HTTPS cookies" });
  }
  if (value.NODE_ENV === "production" && (!value.RESEND_API_KEY || !value.MAIL_FROM)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["RESEND_API_KEY"], message: "RESEND_API_KEY and MAIL_FROM are required in production" });
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
      if (!value.MFA_ENCRYPTION_ACTIVE_KEY_ID || !Object.hasOwn(keyring, value.MFA_ENCRYPTION_ACTIVE_KEY_ID)) throw new Error("MFA_ENCRYPTION_ACTIVE_KEY_ID must identify a key in MFA_ENCRYPTION_KEYRING");
      if (value.MFA_ENCRYPTION_KEY && typeof keyring.legacy === "string" && value.MFA_ENCRYPTION_KEY.toLowerCase() !== keyring.legacy.toLowerCase()) throw new Error("MFA_ENCRYPTION_KEY conflicts with the legacy key-ring entry");
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_KEYRING"], message: error instanceof Error ? error.message : "Invalid MFA key ring" });
    }
  } else if (value.MFA_ENCRYPTION_ACTIVE_KEY_ID) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_ACTIVE_KEY_ID"], message: "An active key ID requires MFA_ENCRYPTION_KEYRING" });
  }
  if (value.NODE_ENV === "production" && !value.MFA_ENCRYPTION_KEY && !value.MFA_ENCRYPTION_KEYRING) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_KEY"], message: "MFA_ENCRYPTION_KEY or MFA_ENCRYPTION_KEYRING is required in production" });
  }
  if (value.NODE_ENV === "production" && !value.MONGODB_URI) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MONGODB_URI"], message: "MONGODB_URI is required in production" });
  }
  if (value.NODE_ENV === "production" && value.CORS_ORIGINS.split(",").some((origin) => !origin.trim().startsWith("https://"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Production CORS_ORIGINS must contain HTTPS origins only" });
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
      if (!value.AUDIT_SIGNING_ACTIVE_KEY_ID || value.AUDIT_SIGNING_ACTIVE_KEY_ID === "legacy" || !Object.hasOwn(auditKeyring, value.AUDIT_SIGNING_ACTIVE_KEY_ID) || typeof auditKeyring[value.AUDIT_SIGNING_ACTIVE_KEY_ID] !== "string" || !/^[a-fA-F0-9]{64}$/.test(auditKeyring[value.AUDIT_SIGNING_ACTIVE_KEY_ID] as string)) throw new Error("AUDIT_SIGNING_ACTIVE_KEY_ID must identify a non-legacy 32-byte key in AUDIT_SIGNING_KEYRING");
      if (value.AUDIT_SIGNING_KEY && typeof auditKeyring.legacy === "string" && Buffer.from(value.AUDIT_SIGNING_KEY).toString("hex") !== auditKeyring.legacy.toLowerCase()) throw new Error("AUDIT_SIGNING_KEY conflicts with the legacy key-ring entry");
      if (value.NODE_ENV === "production" && !value.AUDIT_SIGNING_KEY && !Object.hasOwn(auditKeyring, "legacy")) throw new Error("Legacy audit key must be retained while historical events use the original signature format");
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_KEYRING"], message: error instanceof Error ? error.message : "Invalid audit key ring" });
    }
  } else if (value.AUDIT_SIGNING_ACTIVE_KEY_ID) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_ACTIVE_KEY_ID"], message: "An active audit key ID requires AUDIT_SIGNING_KEYRING" });
  }
  if (value.NODE_ENV === "production" && !value.AUDIT_SIGNING_KEY && !value.AUDIT_SIGNING_KEYRING) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_KEY"], message: "AUDIT_SIGNING_KEY is required in production" });
  }
  let metaTokenKeyring: Record<string, unknown> | undefined;
  if (value.META_TOKEN_ENCRYPTION_KEYRING) {
    try {
      const parsedRing: unknown = JSON.parse(value.META_TOKEN_ENCRYPTION_KEYRING);
      if (!parsedRing || typeof parsedRing !== "object" || Array.isArray(parsedRing)) throw new Error("Meta token key ring must be a JSON object");
      metaTokenKeyring = parsedRing as Record<string, unknown>;
      if (Object.keys(metaTokenKeyring).length < 1 || Object.keys(metaTokenKeyring).length > 20) throw new Error("Meta token key ring must contain between 1 and 20 keys");
      for (const [keyId, key] of Object.entries(metaTokenKeyring)) {
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId) || typeof key !== "string" || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Each Meta token key-ring entry must have a valid identifier and 32-byte hex key");
      }
      if (!value.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID || value.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID === "legacy" || !Object.hasOwn(metaTokenKeyring, value.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID)) {
        throw new Error("META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID must identify a non-legacy key in META_TOKEN_ENCRYPTION_KEYRING");
      }
      const mfaValues = new Set<string>();
      if (value.MFA_ENCRYPTION_KEY) mfaValues.add(value.MFA_ENCRYPTION_KEY.toLowerCase());
      if (value.MFA_ENCRYPTION_KEYRING) {
        const ring = JSON.parse(value.MFA_ENCRYPTION_KEYRING) as Record<string, unknown>;
        for (const key of Object.values(ring)) if (typeof key === "string") mfaValues.add(key.toLowerCase());
      }
      const auditValues = new Set<string>();
      if (value.AUDIT_SIGNING_KEY) auditValues.add(Buffer.from(value.AUDIT_SIGNING_KEY).toString("hex"));
      if (value.AUDIT_SIGNING_KEYRING) {
        const ring = JSON.parse(value.AUDIT_SIGNING_KEYRING) as Record<string, unknown>;
        for (const key of Object.values(ring)) if (typeof key === "string") auditValues.add(key.toLowerCase());
      }
      for (const key of Object.values(metaTokenKeyring)) {
        if (typeof key === "string" && (mfaValues.has(key.toLowerCase()) || auditValues.has(key.toLowerCase()))) {
          throw new Error("Meta token keys must be distinct from MFA encryption and audit signing keys");
        }
      }
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["META_TOKEN_ENCRYPTION_KEYRING"], message: error instanceof Error ? error.message : "Invalid Meta token key ring" });
    }
  } else if (value.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID"], message: "An active Meta token key ID requires META_TOKEN_ENCRYPTION_KEYRING" });
  }
  if (value.META_APP_ID && (!value.META_APP_SECRET || !value.META_REDIRECT_URI || !value.META_GRAPH_API_VERSION || !value.META_TOKEN_ENCRYPTION_KEYRING || !value.META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["META_APP_ID"], message: "A Meta app requires its app secret, HTTPS redirect URI, explicit Graph API version and dedicated token-encryption key ring" });
  }
  if (value.META_APP_ID && value.SESSION_COOKIE_SAME_SITE === "Strict") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SESSION_COOKIE_SAME_SITE"], message: "Meta OAuth browser callbacks require SameSite=Lax (or Secure SameSite=None) so the initiating session cookie is sent on the provider redirect" });
  }
  if (value.META_APP_ID && value.META_REDIRECT_URI) {
    const redirect = new URL(value.META_REDIRECT_URI);
    const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
    if (redirect.username || redirect.password || redirect.hash || (redirect.protocol !== "https:" && (!localhost || value.NODE_ENV === "production"))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["META_REDIRECT_URI"], message: "Meta OAuth redirect URI must be HTTPS; only non-production localhost callbacks may use HTTP" });
    }
  }
  if (!value.META_APP_ID && (value.META_APP_SECRET || value.META_REDIRECT_URI || value.META_WEBHOOK_VERIFY_TOKEN || value.META_LOGIN_CONFIG_ID)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["META_APP_ID"], message: "Meta app secret, redirect URI, webhook verify token and Login Config ID require META_APP_ID" });
  }
});
export function parseConfig(environment: NodeJS.ProcessEnv) {
  return runtimeSchema.safeParse(environment);
}
const parsed = parseConfig(process.env);
if (!parsed.success) {
  throw new Error(`Invalid Zuri MeBuMIP API configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
export const corsOrigins = config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
