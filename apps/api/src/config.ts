import { z } from "zod";
const schema = z.object({
 NODE_ENV: z.enum(["development","test","production"]).default("development"),
 API_HOST: z.string().default("0.0.0.0"), API_PORT: z.coerce.number().int().positive().default(4000),
 MONGODB_URI: z.string().min(1), MONGODB_DATABASE: z.string().min(1).default("zuri_os"),
 JWT_ISSUER: z.string().url(), JWT_AUDIENCE: z.string().min(1), JWT_SECRET: z.string().min(32),
 ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(900),
 SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(7_776_000).default(2_592_000),
 MFA_ENCRYPTION_KEY: z.string().optional(),
 CORS_ORIGINS: z.string().default("http://localhost:5173"),
 ACCESS_REQUESTS_ENABLED: z.enum(["true","false"]).default("false"),
 ACCESS_REQUESTS_PRIVACY_NOTICE_URL: z.string().url().refine(value=>value.startsWith("https://"),"Privacy notice URL must use HTTPS").optional()
}).superRefine((v,ctx)=>{if(v.NODE_ENV==="production"&&(!v.MFA_ENCRYPTION_KEY||Buffer.from(v.MFA_ENCRYPTION_KEY,"base64").length!==32))ctx.addIssue({code:"custom",path:["MFA_ENCRYPTION_KEY"],message:"Production requires a base64-encoded 32-byte MFA_ENCRYPTION_KEY"});if(v.NODE_ENV==="production"&&v.ACCESS_REQUESTS_ENABLED==="true"&&!v.ACCESS_REQUESTS_PRIVACY_NOTICE_URL)ctx.addIssue({code:"custom",path:["ACCESS_REQUESTS_PRIVACY_NOTICE_URL"],message:"Production access requests require an approved public privacy notice URL"});});
export const config = schema.parse(process.env);
export const corsOrigins = config.CORS_ORIGINS.split(",").map(v=>v.trim()).filter(Boolean);
