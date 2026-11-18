import { z } from "zod";
const schema = z.object({
 NODE_ENV: z.enum(["development","test","production"]).default("development"),
 API_HOST: z.string().default("0.0.0.0"), API_PORT: z.coerce.number().int().positive().default(4000),
 MONGODB_URI: z.string().min(1), MONGODB_DATABASE: z.string().min(1).default("zuri_os"),
 JWT_ISSUER: z.string().url(), JWT_AUDIENCE: z.string().min(1), JWT_SECRET: z.string().min(32),
 ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900), CORS_ORIGINS: z.string().default("http://localhost:5173")
});
export const config = schema.parse(process.env);
export const corsOrigins = config.CORS_ORIGINS.split(",").map(v=>v.trim()).filter(Boolean);
