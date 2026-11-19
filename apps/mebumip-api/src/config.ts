import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DATABASE: z.string().min(1).default("zuri_mebumip"),
  CORS_ORIGINS: z.string().default("http://localhost:5174"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid Zuri MeBuMIP API configuration: ${parsed.error.message}`);
}

export const config = parsed.data;
export const corsOrigins = config.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);