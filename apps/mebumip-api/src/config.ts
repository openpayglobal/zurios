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
  MFA_ENCRYPTION_KEYRING: z.string().optional(),
  MFA_ENCRYPTION_ACTIVE_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  AUDIT_SIGNING_KEY: z.string().min(32).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  MAIL_FROM: z.string().email().optional(),
});

const parsed = envSchema.superRefine((value, context) => {
  if (value.SESSION_COOKIE_SAME_SITE === "None" && value.NODE_ENV !== "production") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["SESSION_COOKIE_SAME_SITE"], message: "SameSite=None requires production HTTPS cookies" });
  }
  if (value.NODE_ENV === "production" && (!value.RESEND_API_KEY || !value.MAIL_FROM)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["RESEND_API_KEY"], message: "RESEND_API_KEY and MAIL_FROM are required in production" });
  }
  if (value.NODE_ENV === "production" && !value.MFA_ENCRYPTION_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MFA_ENCRYPTION_KEY"], message: "MFA_ENCRYPTION_KEY is required in production" });
  }
  if (value.NODE_ENV === "production" && !value.MONGODB_URI) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["MONGODB_URI"], message: "MONGODB_URI is required in production" });
  }
  if (value.NODE_ENV === "production" && value.CORS_ORIGINS.split(",").some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Production CORS_ORIGINS must not include localhost" });
  }
  if (value.NODE_ENV === "production" && !value.AUDIT_SIGNING_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_KEY"], message: "AUDIT_SIGNING_KEY is required in production" });
  }
}).safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid Zuri MeBuMIP API configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
export const corsOrigins = config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
