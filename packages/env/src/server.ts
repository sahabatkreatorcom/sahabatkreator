import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_CUSTOM_DOMAIN: z.string().optional(),
    SUMOPOD_API_KEY: z.string().optional(),
    SUMOPOD_API_SECRET: z.string().optional(),
    SUMOPOD_BASE_URL: z.string().optional(),
    SUMOPOD_WEBHOOK_TOKEN: z.string().optional(),
    PIXABAY_API_KEY: z.string().optional(),
    PEXELS_API_KEY: z.string().optional(),
    UNSPLASH_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
