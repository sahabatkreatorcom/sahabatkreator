# Sahabat Kreator

Platform manajemen media sosial AI-powered untuk kreator dan bisnis Indonesia. Jadwalkan konten, balas komentar, pantau analitik, dan dapatkan rekomendasi dari asisten AI **Seb** — semua dalam satu dashboard.

## Fitur Utama

| Area | Deskripsi |
|------|-----------|
| **Publish multi-platform** | Instagram (Feed/Reel/Story), Facebook Page, TikTok, YouTube, Pinterest, LinkedIn, Threads — satu post per akun, dikelompokkan via `linkedGroupId` |
| **Kalender konten** | Grid bulanan, jadwalkan & terbitkan langsung dari kalender |
| **Media library** | Upload ke Cloudflare R2, folder, batch delete, pencarian stok (Pixabay/Pexels/Unsplash) |
| **Inbox komentar** | Komentar dari IG/FB/TikTok/YT/Threads dalam satu inbox, balas per platform, auto-reply keyword. **Webhook real-time** (Meta IG/FB/Threads) memakai `processed_webhook_event` untuk idempotency |
| **Analitik** | Followers, impressions, reach per platform, kebijakan penyimpanan per platform |
| **Competitor & listening** | Sync profil & post kompetitor, monitor keyword + sentimen |
| **Seb AI** | Laporan strategi 90 hari, rekomendasi, chat, brand knowledge, scan website, analisis media (vision) |
| **Kolaborasi tim** | Role Owner/Admin/Member/Viewer, activity log |
| **Keamanan** | 2FA (TOTP + email OTP), token sosial terenkripsi AES-256-GCM |

## Arsitektur

Monorepo pnpm + Turborepo:

```
apps/
  web/        Next.js 16 (App Router) — UI + API route handler + BullMQ worker (in-process)
  worker/     Node/tsx — media worker (ffmpeg: frame extraction + transcode)
packages/
  auth/       better-auth (org/admin/2FA) + Drizzle adapter
  config/     tsconfig base
  db/         Drizzle ORM, schema 82 tabel, migrasi Postgres
  email/      Resend client
  env/        Validasi env (zod) — server & client
  payment/    Billing (plan limits) + SumoPod payment
  queue/      BullMQ — konfigurasi Redis + helper enqueue job
```

### Alur publish terjadwal

1. Post dibuat dengan `scheduledAt` (atau `autoPublish`).
2. `lib/posts-service.ts` me-`enqueuePublishPost` ke BullMQ dengan `delay` = selisih ke waktu jadwal (job id deterministik `post:<id>`).
3. BullMQ worker (dijalankan di dalam proses web via `src/instrumentation.ts`) mengeksekusi job → `publishPost` → status `PUBLISHING → PUBLISHED/FAILED`.
4. **Fallback**: bila `REDIS_URL` tidak dikonfigurasi, cron eksternal memanggil `POST /api/cron/publish` (claim atomik `SCHEDULED → PUBLISHING`) sebagai pengganti.

> Menambah platform baru = tambah publisher di `lib/publishing/` saja. Infra queue tidak berubah.

## Persyaratan

- Node.js 22+, pnpm 10
- PostgreSQL — **dev**: Neon/Supabase (URL + `?sslmode=require`); **prod**: service postgres di `docker compose`
- Cloudflare R2 (storage media)
- Redis (opsional untuk job queue — `docker compose` menyediakan service)
- API keys: Resend (email), OpenRouter (Seb AI), SumoPod (billing via `global_integration_settings`), platform OAuth

## Setup Pengembangan

```bash
# 1. Install
pnpm install

# 2. Siapkan env — SINGLE SOURCE OF TRUTH di root
cp .env.example .env
# isi minimal: DATABASE_URL, BETTER_AUTH_SECRET (>=32 char), BETTER_AUTH_URL,
#               CORS_ORIGIN, NEXT_PUBLIC_APP_URL
# Dev (Neon):  postgresql://user:pass@host.neon.tech/db?sslmode=require
# Prod (Docker): postgres://user:pass@postgres:5432/db  (tanpa sslmode)
# Semua konsumen (web/worker/drizzle) membaca `.env` root via packages/env.

# 3. Migrasi DB (bila DB tersedia)
pnpm db:migrate

# 4. Jalankan web (port 3000)
pnpm dev:web

# 5. (Opsional) media worker
pnpm --filter worker dev

# 6. (Opsional) Redis untuk job queue
#    pastikan REDIS_URL diset, lalu queue worker aktif otomatis di proses web
```

### Script

| Perintah | Fungsi |
|----------|--------|
| `pnpm dev` | Turbo dev (semua app) |
| `pnpm dev:web` | Next dev (port 3000) |
| `pnpm build` | Build semua |
| `pnpm -r check-types` | Typecheck semua paket |
| `pnpm check` | Biome lint+format (seluruh repo, jalankan `pnpm check --write` untuk auto-fix) |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle tooling |
| `pnpm test` | Unit test (vitest) |
| `pnpm --filter web test:e2e` | Playwright E2E (butuh `.env.e2e`) |

## Env Penting

Satu sumber kebenaran: `.env.example` di **root** (dibaca semua app via `packages/env`). Yang kritis:

- `DATABASE_URL` — koneksi Postgres (wajib)
- `BETTER_AUTH_SECRET` — minimal 32 karakter (wajib)
- `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_APP_URL` — URL publik (wajib)
- `ENCRYPTION_KEY` — base64 32-byte, **wajib di production** (enkripsi token sosial)
- `CRON_SECRET` — untuk endpoint cron (`/api/cron/publish`, dsb.), **wajib di production**
- `REDIS_URL` — URL Redis untuk BullMQ (opsional, lihat deploy)
- `RESEND_API_KEY` — email transaksional

## Deploy Produksi

Lihat [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) untuk panduan lengkap VPS Docker, migrasi, cron, dan job queue.

## Dokumentasi

| Dokumen | Deskripsi |
|---------|-----------|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Panduan deploy ke VPS (Docker, nginx, SSL, backup) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arsitektur sistem, alur data, skema database |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | Referensi lengkap semua endpoint API |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Panduan pengembangan, menambah platform baru, testing |

## Keamanan

- Semua route API tulis memakai `withAuth`/`requireAuth` (sesi), route admin memakai `withAdmin`, aksi billing memakai `withOrgOwnerAdmin`.
- Endpoint cron diverifikasi `timingSafeEqual` terhadap `CRON_SECRET` (fail-closed).
- Webhook platform diverifikasi signature HMAC (`X-Hub-Signature-256`, `X-TikTok-Signature`) + freshness timestamp (anti-replay) + idempotency atomik via `processed_webhook_event`.
- Token sosial dienkripsi AES-256-GCM (`ENCRYPTION_KEY`).
- Anti-SSRF: website scan (Seb) & import stock media me-resolve DNS + memblokir IP privat/metadata/IPv6 internal.
- `ENCRYPTION_KEY` wajib di production.
