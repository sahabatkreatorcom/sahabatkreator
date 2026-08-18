import { loadRootEnv } from "./load";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Single file of truth: baca .env dari root workspace (dibuat idempoten).
loadRootEnv();

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    ENCRYPTION_KEY: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        // Enkripsi token sosial memakai key ini. Saat NODE_ENV=production,
        // wajib diisi (jangan bergantung pada fallback derive dari
        // BETTER_AUTH_SECRET) supaya rotasi & pemisahan key benar.
        if (process.env.NODE_ENV === "production" && !val) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ENCRYPTION_KEY wajib diisi di environment production (untuk enkripsi token sosial).",
          });
        }
      })
      .describe("Base64 32-byte AES-256 key untuk enkripsi token sosial. Wajib di production."),
    CRON_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    RESEND_API_KEY: z.string().optional().describe("Resend API key untuk email transaksional (OTP, verifikasi, invite)."),
    RESEND_FROM_EMAIL: z.string().optional().describe("Pengirim email Resend."),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    REDIS_URL: z
      .string()
      .url()
      .optional()
      .describe("Redis connection URL untuk job queue BullMQ (mis. redis://localhost:6379)."),
    QUEUE_WORKER_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .describe("Jalankan BullMQ worker di dalam proses web (instrumentation)."),
    R2_ACCOUNT_ID: z.string().min(1).describe("Cloudflare R2 account ID (storage media)."),
    R2_ACCESS_KEY_ID: z.string().min(1).describe("Cloudflare R2 access key."),
    R2_SECRET_ACCESS_KEY: z.string().min(1).describe("Cloudflare R2 secret key."),
    R2_BUCKET_NAME: z.string().min(1).describe("Cloudflare R2 bucket untuk media."),
    R2_CUSTOM_DOMAIN: z.string().optional().describe("Custom domain publik R2 (opsional)."),
    PIXABAY_API_KEY: z.string().optional(),
    PEXELS_API_KEY: z.string().optional(),
    UNSPLASH_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    INSTAGRAM_CLIENT_ID: z.string().optional(),
    INSTAGRAM_CLIENT_SECRET: z.string().optional(),
    META_CLIENT_ID: z.string().optional(),
    META_CLIENT_SECRET: z.string().optional(),
    TIKTOK_CLIENT_ID: z.string().optional(),
    TIKTOK_CLIENT_SECRET: z.string().optional(),
    YOUTUBE_CLIENT_ID: z.string().optional(),
    YOUTUBE_CLIENT_SECRET: z.string().optional(),
    PINTEREST_CLIENT_ID: z.string().optional(),
    PINTEREST_CLIENT_SECRET: z.string().optional(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    THREADS_CLIENT_ID: z.string().optional(),
    THREADS_CLIENT_SECRET: z.string().optional(),
    GOOGLE_BUSINESS_CLIENT_ID: z.string().optional(),
    GOOGLE_BUSINESS_CLIENT_SECRET: z.string().optional(),
    META_APP_SECRET: z.string().optional().describe("App secret Meta untuk verifikasi signature webhook Graph API (X-Hub-Signature-256)."),
    WEBHOOK_VERIFY_TOKEN: z.string().optional().describe("Verify token webhook platform (Meta hub.verify_token / TikTok challenge)."),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
