# Sahabat Kreator — Dokumentasi Arsitektur

Dokumen ini menjelaskan arsitektur, alur data, dan komponen utama platform Sahabat Kreator.

---

## 1. Gambaran Umum

**Sahabat Kreator** adalah platform manajemen media sosial AI-powered untuk kreator dan bisnis Indonesia. Platform memungkinkan:

- Penjadwalan & publikasi konten ke 7+ platform sosmed
- Inbox komentar terpusat dengan auto-reply
- Analitik per platform
- Asisten AI "Seb" untuk rekomendasi konten
- Manajemen tim dengan role-based access

**Teknologi inti:**
- **Backend**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL 16 via Drizzle ORM (82 tabel)
- **Auth**: better-auth ~1.6.30
- **Queue**: BullMQ + Redis 7
- **Storage**: Cloudflare R2
- **Deployment**: Docker Compose, nginx/Caddy reverse proxy

---

## 2. Struktur Monorepo

```
sahabat-kreator/
├── apps/
│   ├── web/          # Next.js app — UI + API + BullMQ worker (in-process)
│   └── worker/       # Media worker — ffmpeg frame extraction & video transcoding
├── packages/
│   ├── auth/         # better-auth config, org/admin/2FA, Drizzle adapter
│   ├── config/       # Shared tsconfig base
│   ├── db/           # Drizzle schema, migrasi, seeding
│   ├── email/        # Resend client untuk email transaksional
│   ├── env/          # Single source of truth env loader (zod validation)
│   ├── payment/      # Billing + SumoPod Pay integration
│   └── queue/        # BullMQ konfigurasi + enqueue helpers
├── docs/             # Dokumentasi (file ini)
├── handoffs/         # Clone socaliseit notes
├── .env.example      # Template env (satu sumber kebenaran)
├── docker-compose.yml
└── pnpm-workspace.yaml
```

---

## 3. Arsitektur Deployment

```
┌─────────────────────────────────────────────────────────┐
│                      Internet                           │
│                    (80/443 only)                        │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   Nginx Proxy    │  ← Reverse proxy eksternal (Cloudflare)
              │   :3001         │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │    web:3000     │  ← Next.js (standalone) + BullMQ worker
              │  (Node.js 22)   │     + Health check /api/health
              └───┬───────┬─────┘
                  │       │
     ┌────────────▼──┐  ┌─▼──────────────┐
     │  postgres:5432│  │   redis:6379   │
     │  PG 16 Alpine │  │  Redis 7 AOF   │
     └───────────────┘  └────────────────┘
                       ┌────────────────┐
                       │   worker:8080  │
                       │  ffmpeg node   │
                       └────────────────┘
```

### Service Detail

| Service | Port | Fungsi | Notes |
|---------|------|--------|-------|
| `web` | 3000 (internal) | Next.js App Router, API routes, BullMQ worker | Standalone output, port tidak ter-expose publik |
| `postgres` | 5432 (internal) | Database utama | Persistent volume, tidak ter-expose |
| `redis` | 6379 (internal) | BullMQ job queue | AOF enabled, healthcheck ping |
| `worker` | — | Media processing (ffmpeg) | Frame extraction, transcoding, poster generation |
| `migrate` | — | Drizzle migration | Sekali jalan saat startup, `restart: "no"` |
| `caddy` | 80, 443 | SSL + reverse proxy | Opsional, menggunakan profile `caddy` |

### Nginx Override (Production)
Untuk production, nginx digunakan sebagai reverse proxy eksternal:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```
Nginx mem-forward ke `127.0.0.1:3001`. Caddy tidak dimuat.

---

## 4. Alur Data Utama

### 4.1 Alur Publish Terjadwal

```
User → POST /api/posts
  │
  ▼
lib/posts-service.ts
  │  - Insert post → PENDING/SCHEDULED
  │  - Enqueue BullMQ job (delay = scheduledAt - now)
  ▼
BullMQ Queue (redis)
  │  - Job id: post-{postId} (deterministik, anti-duplikat)
  │  - Retry: 3x, exponential backoff 30s
  ▼
queue-worker.ts (BullMQ Worker)
  │  - publishWorker concurrency: 3
  │  - Panggil lib/publishing/publish-post.ts
  ▼
Publishing Orchestrator
  │  - Distribusi ke platform-specific publisher
  │  - Facebook → graph.facebook.com
  │  - Instagram → graph.instagram.com
  │  - TikTok → open.tiktokapis.com (async)
  │  - YouTube → youtube.googleapis.com
  │  - Pinterest → api.pinterest.com
  │  - LinkedIn → linkedin.com
  ▼
Post Status: PUBLISHING → PUBLISHED / FAILED
  │  - externalUrl, platformPostId tercatat
  │  - publish_error dicatat bila gagal
```

### 4.2 Alur Webhook (Real-time)

```
Platform (Meta/TikTok/YouTube)
  │  POST callback URL
  ▼
/api/webhooks/[platform]/route.ts
  │  - Verifikasi signature HMAC
  │  - Cek freshness timestamp (anti-replay)
  │  - Idempotency: INSERT ON CONFLICT processed_webhook_event
  ▼
lib/webhooks/[platform].ts
  │  - Parse payload sesuai format resmi platform
  │  - Dispatch ke handler yang sesuai
  ▼
Handlers:
  - comments → inbox + auto-reply (Meta, TikTok)
  - post.publish.complete/fail → update post status (TikTok)
  - feed activities → analytics update (YouTube)
```

### 4.3 Alur Media Processing

```
User → POST /api/media (upload)
  │
  ▼
Cloudflare R2
  │  - Simpan file, kembalikan public URL
  ▼
POST /api/media → media.record_created
  │
  ▼
worker/media-loop.ts (polling setiap WORKER_POLL_INTERVAL_MS)
  │  - Ambil video PENDING_TRANSCODE
  │  - Batch size: WORKER_BATCH_SIZE (default 1)
  ▼
Transcoder Interface
  │  - local: ffmpeg via child_process
  │  - modal: (belum tersedia)
  ▼
Hasil:
  - Poster frame → thumbnailUrl
  - Transcoded video (if < WORKER_MAX_VIDEO_BYTES) → transcodedUrl
  - Status → DONE / LIMITED (poster-only untuk video besar)
```

### 4.4 Alur Job Queue (BullMQ)

| Queue | Concurrency | Fungsi |
|-------|-------------|--------|
| `publish-post` | 3 | Publish post terjadwal |
| `sync` | 2 | Sinkron analytics & inbox org |
| `stale-post-cleanup` | 1 | Reset post stuck PUBLISHING > 10 menit (repeatable, tiap 60s) |

**Fallback cron** (bila Redis tidak tersedia):
- `/api/cron/publish` — tiap menit, claim SCHEDULED posts
- `/api/cron/billing` — tiap jam, downgrade org expired
- `/api/cron/check-tiktok-pending` — tiap menit, poll status TikTok
- `/api/cron/refresh-tokens` — tiap jam, auto-refresh token sosial

---

## 5. Skema Database (Ringkas)

Total **82 tabel** di Postgres. Yang paling penting:

### Auth & Organization
| Tabel | Fungsi |
|-------|--------|
| `user` | Akun pengguna |
| `organization` | Workspace/klien |
| `member` | Anggota org (role: OWNER, ADMIN, MEMBER, VIEWER) |
| `account` | Akun OAuth (terhubung user × platform) |
| `two_factor` | 2FA TOTP & backup codes |

### Social
| Tabel | Fungsi |
|-------|--------|
| `social_account` | Akun sosmed terkoneksi (terenkripsi) |
| `audience_activity` | Aktivitas followers per platform |
| `pending_oauth_session` | Sesi OAuth pending (pilih halaman) |

### Content
| Tabel | Fungsi |
|-------|--------|
| `post` | Post konten (draft/scheduled/published/failed) |
| `post_media` | Relasi post ↔ media |
| `post_hashtag` | Hashtag per post |
| `post_product` | Produk yang dipromosikan |
| `publish_error` | Error detail publish失败 |

### Analytics
| Tabel | Fungsi |
|-------|--------|
| `platform_analytics` | Metrik per platform per org |
| `post_analytics` | Metrik per post |
| `daily_analytics_snapshot` | Snapshot harian |

### Commerce & Payment
| Tabel | Fungsi |
|-------|--------|
| `subscription` | Langganan org (tier, period) |
| `payment` | Transaksi pembayaran |
| `organization_limit` | Batasan per tier |

### Media
| Tabel | Fungsi |
|-------|--------|
| `media` | File library (URL R2, thumbnail, transcoded) |
| `media_folder` | Folder organisasi media |

---

## 6. Keamanan

### Enkripsi Token Sosial
- Menggunakan **AES-256-GCM** via `packages/payment/src/encryption.ts`
- Key: `ENCRYPTION_KEY` (base64 32-byte, wajib di production)
- Didekripsi saat perlu publish/sync via `decryptToken()`

### Webhook Verification
| Platform | Header | Signature | Freshness |
|----------|--------|-----------|-----------|
| Meta (IG/FB/Threads) | `X-Hub-Signature-256` | HMAC-SHA256 raw body | 5 menit |
| TikTok | `X-TikTok-Signature` | `t=<ts>.<hmac>` | 5 menit |
| YouTube | — | PubSubHubbub challenge GET | — |

### Cron Security
- Verifikasi `CRON_SECRET` dengan `timingSafeEqual` (fail-closed)
- Bila `CRON_SECRET` kosong, semua request cron ditolak 401

### Anti-SSRF
- Website scan (Seb AI) & import stock media: DNS resolution + blokir IP privat/metadata

### CSP & Headers
- Content Security Policy ketat
- HSTS, X-Frame-Options, Permissions-Policy
- No-sniff, X-Content-Type-Options

---

## 7. Konfigurasi Environment

### Wajib (Production)
```bash
DOMAIN=sahabatkreator.com
DATABASE_URL=postgres://user:pass@postgres:5432/db
BETTER_AUTH_SECRET=<min 32 char>
BETTER_AUTH_URL=https://sahabatkreator.com
CORS_ORIGIN=https://sahabatkreator.com
NEXT_PUBLIC_APP_URL=https://sahabatkreator.com
ENCRYPTION_KEY=<base64 32-byte>
CRON_SECRET=<acak panjang>
```

### Opsi (Fitur)
```bash
# Redis + Job Queue
REDIS_URL=redis://redis:6379
QUEUE_WORKER_ENABLED=true

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...

# Email
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...

# AI (Seb)
OPENROUTER_API_KEY=...

# VAPID Push Notification
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_ADMIN_EMAIL=admin@sahabatkreator.com
```

### Configurable via Admin Panel (DB)
- Kredensial platform OAuth (`global_platform_credential`)
- Pengaturan SumoPod Pay (`global_integration_settings`)

---

## 8. Performance & Scaling

### Default untuk VPS 2-core / 4GB
| Setting | Value | Alasan |
|---------|-------|--------|
| `WORKER_BATCH_SIZE` | 1 | Mencegah OOM ffmpeg |
| `WORKER_POLL_INTERVAL_MS` | 15000 | Jeda antar batch |
| `WORKER_MAX_VIDEO_BYTES` | 100MB | Video besar → poster-only (LIMITED) |
| `publishWorker.concurrency` | 3 | Multi-post paralel |
| `syncWorker.concurrency` | 2 | Analytics/inbox parallel |

### Multi-instance
- BullMQ mendistribusikan job → aman di banyak instance web
- Session tersimpan di DB → stateless
- Redis sebagai shared queue coordinator

---

## 9. Monitoring

### Health Check
```
GET /api/health
```
Response:
```json
{ "ok": true, "db": true, "redis": true, "ts": "2026-08-22T..." }
```
- Status 200 = semua service sehat
- Status 503 = ada service down

### Docker Healthcheck
Container web ditandai healthy ketika `/api/health` mengembalikan 200. Caddy/nginx menunggu ini sebelum menerima trafik.

### Logging
Semua log keluar ke stdout (ternormalisasi ISO timestamp):
```
[queue-worker] 2026-08-22T... publish start post=xxx (TIKTOK)
[instrumentation] BullMQ workers started
[worker] done org=xxx video=xxx duration=1.2s
```

Level log bisa diatur via `LOG_LEVEL=debug` (default: `info`).

---

*Last updated: 2026-08-22*
