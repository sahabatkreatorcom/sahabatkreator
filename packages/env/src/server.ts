import { resolve } from "node:path";
import { config } from "dotenv";

// Single source of truth: selalu load .env dari root monorepo
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    WEB_URL: z.url().default("http://localhost:5173"),
    SERVER_URL: z.url().default("http://localhost:3000"),
    // Resend (opsional saat dev — fallback ke log console)
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().default("Sahabat Kreator <noreply@sahabatkreator.com>"),
    // Cloudflare R2
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.url().optional(),
    // Sumopod Pay
    SUMOPOD_API_BASE_URL: z.url().default("https://api-pay-sandbox.sumopod.com"),
    SUMOPOD_API_KEY: z.string().optional(),
    SUMOPOD_WEBHOOK_TOKEN: z.string().optional(),
    // Base URL return page billing; sandbox menolak non-HTTPS,
    // jadi dev bisa override (default: WEB_URL)
    SUMOPOD_RETURN_BASE_URL: z.url().optional(),
    // AI (OpenRouter)
    OPENROUTER_API_KEY: z.string().optional(),
    // Platform social media — versi API & host (pin di env, jangan hardcode; riset docs/social-platforms)
    META_GRAPH_VERSION: z.string().default("v26.0"),
    LINKEDIN_API_VERSION: z.string().default("202608"), // sunset bulanan — update rutin
    BLUESKY_PDS_URL: z.url().default("https://bsky.social"),
    PINTEREST_API_BASE_URL: z.url().default("https://api.pinterest.com/v5"),
    // OAuth app kredensial — fallback bila belum diisi admin via Admin Panel → Kredensial Platform
    // (playbook docs/social-platforms/app-review-playbook.md)
    META_APP_ID: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    // Instagram Login standalone — app terpisah dari Meta app utama
    INSTAGRAM_APP_ID: z.string().optional(),
    INSTAGRAM_APP_SECRET: z.string().optional(),
    THREADS_APP_ID: z.string().optional(),
    THREADS_APP_SECRET: z.string().optional(),
    TIKTOK_CLIENT_KEY: z.string().optional(),
    TIKTOK_CLIENT_SECRET: z.string().optional(),
    // Scope TikTok ekstra (mis. "comment.list,comment.list.manage" utk inbox).
    // Comment API adalah product terpisah — scope-nya DILUAR default karena app
    // yang belum di-approve akan menolak authorize ("scope" error di halaman login).
    TIKTOK_EXTRA_SCOPES: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    PINTEREST_APP_ID: z.string().optional(),
    PINTEREST_APP_SECRET: z.string().optional(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    // Scope organization LinkedIn ekstra untuk app `linkedin` (personal).
    // KOSONGKAN selama app LinkedIn personal belum punya product organization —
    // scope org hanya boleh diminta oleh app Community Management API (platform
    // `linkedin_org`), karena FAQ resmi melarang app dengan product lain ikut
    // Development Tier Community Management API.
    // Catatan: Community Management API TIDAK memberi `r_organization_admin` (itu milik
    // Advertising API) — pakai `rw_organization_admin`; scope tak terdaftar → invalid_scope.
    LINKEDIN_EXTRA_SCOPES: z.string().optional(),
    // App LinkedIn KEDUA (Community Management API) — khusus halaman company:
    // posting/analytics/komentar sebagai organization. Product ini tidak boleh
    // digabung dengan app personal (Share on LinkedIn / OpenID Connect).
    LINKEDIN_ORG_CLIENT_ID: z.string().optional(),
    LINKEDIN_ORG_CLIENT_SECRET: z.string().optional(),
    // Webhook verify token — Instagram & Facebook (satu aplikasi Meta,
    // subscribe webhook di developer console). Threads punya app & token sendiri.
    META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    THREADS_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    // Instagram Login standalone — aplikasi terpisah, webhook & token sendiri
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    // Web Push VAPID — kontak admin untuk push service (mailto)
    VAPID_CONTACT_EMAIL: z.string().default("Sahabat Kreator <support@sahabatkreator.com>"),
    // Worker publisher (fallback cron)
    WORKER_PORT: z.coerce.number().default(3001),
    // Redis (BullMQ) — publish queue. Kosong = fallback DB polling di worker.
    REDIS_URL: z.string().optional(),
    // Modal.com — render video serverless (ffmpeg + whisper). Lihat RFC §11.
    // Kosong = fitur video render nonaktif (route 503, worker skip queue).
    MODAL_TOKEN: z.string().optional(),
    MODAL_RENDER_URL: z.url().optional(),
    // Lainnya
    CRON_SECRET: z.string().optional(),
    // AES-256-GCM key (base64 32-byte) untuk enkripsi kredensial platform.
    // Wajib di produksi — tanpa ini token OAuth user tersimpan plaintext
    // (kredensial platform tidak akan jalan, guard menghentikan boot lebih awal).
    ENCRYPTION_KEY: z
      .string()
      .optional()
      .refine((v) => v === undefined || process.env.NODE_ENV !== "production" || v.length >= 40, {
        message:
          "ENCRYPTION_KEY wajib di production (base64 32-byte, generate: openssl rand -base64 32)",
      }),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

// Guard produksi: kredensial user harus terenkripsi — tanpa ENCRYPTION_KEY
// server tetap boot di dev, tapi berhenti keras di production.
if (process.env.NODE_ENV === "production" && !process.env.ENCRYPTION_KEY) {
  throw new Error(
    "ENCRYPTION_KEY wajib diisi di production (generate: openssl rand -base64 32). " +
      "Tanpa key ini token OAuth user tersimpan plaintext.",
  );
}
