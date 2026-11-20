import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DATABASE: z.string().min(1).default("zuri_mebumip"),
  CORS_ORIGINS: z.string().default("http://localhost:5174"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  PLATFORM_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  AUDIT_SIGNING_KEY: z.string().min(32).optional(),
});

const parsed = envSchema.superRefine((value, context) => {
  if (value.NODE_ENV === "production" && !value.AUDIT_SIGNING_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["AUDIT_SIGNING_KEY"], message: "AUDIT_SIGNING_KEY is required in production" });
  }
}).safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid Zuri MeBuMIP API configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
export const corsOrigins = config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
