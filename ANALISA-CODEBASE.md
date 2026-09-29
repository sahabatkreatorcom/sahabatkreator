# Analisis Codebase — Sahabat Kreator

_Tanggal analisis: 27 September 2026 · ~81.700 baris kode TS/TSX (tidak termasuk Python Modal)_

---

## 1. Ringkasan Eksekutif

**Sahabat Kreator** adalah SaaS creator-economy Indonesia (scheduler + analitik + AI coach media sosial) berupa **monorepo Bun + Turborepo** dengan 4 aplikasi dan 9 packages.

**Tech stack:** Bun 1.4 · TypeScript (strict) · Hono (API) · React 19 + Vite 8 + Tailwind v4 (web) · PostgreSQL 17 + Drizzle ORM 0.45 · Redis 7 + BullMQ 6 · better-auth 1.6 · Biome 2.5 (format + lint) · Vitest 4 · Cloudflare R2 · Modal.com (render video serverless, Python).

**Kekuatan utama:**

- **Disiplin keamanan tinggi**: enkripsi AES-256-GCM untuk semua kredensial platform (dengan guard boot-time di produksi), API key hanya simpan SHA-256 + constant-time compare, webhook signature timing-safe, guard SSRF menyeluruh dengan DNS resolution, rate limiting multi-tier.
- **Komentar kode sangat berkualitas** — tidak sekadar "apa", tapi "mengapa" (termasuk jejak bugfix, batas API platform, dan alasan keputusan). Ini langka dan aset berharga.
- **Resilien by design**: BullMQ jika Redis ada, fallback DB polling atomik (`SELECT ... FOR UPDATE SKIP LOCKED`) jika tidak. Setiap loop background punya safety-net ganda.
- **Zero `any`** di seluruh web app; tidak ada `@ts-ignore`. Tipe benar-benar strict.

**Risiko terbesar:**

1. **Test coverage nyaris nol** (~81.700 LOC, hanya 3 file test). Ini risiko tertinggi untuk produk yang menangani pembayaran & token OAuth.
2. **Server API tidak ada graceful shutdown** (tidak ada SIGTERM handler) — worker justru punya. Setiap deploy memutus koneksi in-flight.
3. **Rate limiting in-memory** → tidak scale multi-instance (sudah didokumentasikan, belum diselesaikan).
4. **Beberapa file raksasa** (video.tsx 1.750 baris, admin-api-tests.ts 1.121, analytics-sync.ts 1.049).

---

## 2. Arsitektur Monorepo

```
sahabatkreator/
├── apps/
│   ├── web/          # React 19 SPA + PWA (marketing, dashboard, admin)  ~46.400 LOC
│   ├── server/       # Hono API — 67 file routes, ~24.500 LOC
│   ├── worker/       # BullMQ/polling worker + cron endpoints (656 LOC)
│   ├── mcp/          # MCP server (stdio) → proxy tipis ke Public API /v1
│   └── render-modal/ # Python (Modal.com): sk_render.py, sk_carousel.py, sk_clipper.py
├── packages/
│   ├── api/          # OpenAPI docs + Public API v1 (zod-to-openapi)
│   ├── auth/         # better-auth: email/2FA/org/admin plugins
│   ├── db/           # Drizzle schema (~3.750 LOC, 60+ tabel) + seb/ subpackage
│   ├── env/          # @t3-oss/env-core: server.ts / web.ts (single source of truth)
│   ├── publishing/   # 12 adapter platform + pipeline + sync (6 module sinkron)
│   ├── queue/        # BullMQ queues: publish, render, carousel, auto-clip, webhook…
│   ├── render/       # Adapter Modal.com (video / carousel / clipper)
│   └── config/       # tsconfig.base.json
├── Dockerfile        # satu image untuk app/worker/migrate
├── docker-compose.prod.yml / .staging.yml
└── sahabatkreator.conf  # NGINX host-level (Cloudflare origin SSL)
```

**Deployment:** Cloudflare (Full Strict) → NGINX host → Docker. Prod = PostgreSQL 17 container self-hosted (volume persisten); staging = Neon. App di `127.0.0.1:3001`, staging `:3002`, aplikasi lain (toeflynk) `:3000` — server yang sama dipakai bersama, sehingga ada `mem_limit` dan `cpus` di tiap service. Hal ini dibahas eksplisit di komentar compose.

**SEO dipikirkan serius:** staging noindex diterapkan dalam **4 lapisan** (Vite build guard → `seo.ts` runtime → middleware Hono → `X-Robots-Tag` NGINX). Prod build mendapat `INDEXABLE=true` lewat build arg.

**Catatan penting di `Dockerfile`:** setiap workspace **wajib** ada baris `COPY package.json`-nya sendiri — `bun install` akan *diam-diam* melewatkan workspace yang package.json-nya tidak disalin (exit code tetap 0). Saat ini `apps/render-modal` **tidak** ada di daftar COPY, tapi ia murni Python (tidak ada package.json) — jadi aman. Tetapi komentar ini adalah jebakan nyata untuk workspace TS baru.

---

## 3. Database (`packages/db`)

**~60 tabel + 14 enum** di 25 file schema, dikelompokkan per domain:

| Domain | Tabel |
|---|---|
| Auth | `user`, `session`, `account`, `verification`, `two_factor` |
| Organisasi | `organization`, `member`, `invitation`, `activity_log`, `team_role`, `team_role_assignment` |
| Sosial | `social_account`, `platform_credential`, `oauth_state`, `oauth_pending_selection`, `platform_health`, `bridge_config` |
| Konten | `post_group`, `post`, `media`, `media_folder`, `post_media`, `content_pillar`, `caption_template`, `calendar_note`, `carousel_job`, `carousel_job_slide` |
| Video | `video_job`, `video_job_segment`, `video_job_clip` |
| Analitik | `account_analytics`, `post_analytics`, `goal`, `report_schedule`, `report_share` |
| Engagement | `engagement_item`, `saved_response`, `dm_conversation`, `dm_message` |
| Billing | `plan`, `subscription`, `payment`, `processed_webhook_event`, `webhook_log`, `render_usage` |
| Commerce | `product`, `product_tag` |
| Otomasi | `automation_rule`, `automation_log` |
| AI / SEB | `ai_usage`, `ai_usage_log`, `seb_brand_knowledge`, `seb_report`, `seb_recommendation`, `seb_experiment`, `seb_chat_session`, `seb_chat_message` |
| Lain | `holiday`, `audio_track`, `brand_voice`, `hashtag_collection`, `utm_template`, `webhook_endpoint`, `webhook_delivery`, `api_key`, `platform_settings`, `audit_log`, `notification`, `vapid_key`, `push_subscription`, `notification_setting`, `blog_category`, `blog_post`, `blog_post_tag`, `newsletter_subscriber`, `contact_submission`, `listening_monitor/item/source`, `competitor`, `app_review_tracking`, `api_quota_snapshot`, `platform_data_deletion` |

**Enum platform (12 nilai)** mencerminkan ranah nyata: `instagram`, `instagram_standalone`, `facebook`, `threads`, `tiktok`, `youtube`, `pinterest`, `linkedin`, `linkedin_org`, `bluesky`, `google_business`, `manual`.

**Pola yang baik:**

- Skema dipecah per domain dengan barrel export (`schema/index.ts`) — navigasi mudah.
- `plan_tier` enum: `free | pro | business | enterprise`.
- Lifecycle job render seragam: `queued → sourcing → rendering → uploading → done/failed/canceled` (carousel), `video_job_mode` membedakan `single | montage | auto_clip`.
- Quota **pool-based** (`pool-quota.ts`): limit dihitung dari seluruh org milik pemilik org, bukan per-org — mencegah cara berbagi plan.

**Catatan:**

- Migrations: snapshot meta `0000`–`0009` **ada celah** (0005, 0006 tidak ada) — wajar jika pernah di-reset/squash, tapi layak diverifikasi. Workflow prod memakai `drizzle-kit push --force` (bukan `migrate`) — kompatibel PG17, **tidak** PG18 (didokumentasikan: drizzle-kit 0.31 salah deteksi diff di PG18).
- Banyak kolom `jsonb` untuk settings fleksibel (`platformSettings`, `settings`) — pragmatis, tapi tidak divalidasi skema di level DB.

---

## 4. Auth & Env

**`packages/auth/src/auth.ts`** — better-auth dengan plugins: `organization`, `twoFactor` (OTP 8 digit via Resend), `admin` (impersonation 1 jam, role `admin`).

Yang menarik:

- **User pertama otomatis jadi admin platform** (`databaseHooks.user.create.before`).
- **Gate registrasi terbuka/tertutup** lewat `platform_settings` singleton — signUp ditolak saat ditutup.
- **Quota anggota tim di-hook better-auth** (`beforeCreateInvitation` + `beforeAcceptInvitation`) — throw `APIError("FORBIDDEN")` dengan kode `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`.
- Session 7 hari, refresh 24 jam, "fresh" 5 menit untuk aksi sensitif.
- Cookie: `SameSite=None + Secure` di HTTPS, `Lax` di localhost (komentar menjelaskan mengapa browser menolak `SameSite=None` tanpa Secure).
- `lastActiveOrganizationId` disimpan di user (`input: false`) karena session row hilang saat signOut.

**`packages/env`** — `@t3-oss/env-core` + zod, selalu load `.env` dari root monorepo (path relatif dari `import.meta.dirname`). **~55 variabel server**, mayoritas opsional dengan graceful degradation (R2, Sumopod, OpenRouter, Modal, Pixabay). Wajib produksi: `DATABASE_URL`, `BETTER_AUTH_SECRET` (min 32), `BETTER_AUTH_URL`, `CORS_ORIGIN`, dan **`ENCRYPTION_KEY`** — tanpa itu server **throw saat boot** di production (fail-closed, pesan jelas: "token OAuth user tersimpan plaintext").

---

## 5. Backend (`apps/server` + `packages/api`)

### Bootstrap (`src/index.ts`, 324 baris)

Urutan mount disengaja dan dikomentari: `logger` → `bodyLimit 110MB` → `secureHeaders` (sebelum CORS agar error response tetap dapat header keamanan) → middleware staging noindex → CORS (origin allowlist) → better-auth `/api/auth/*` → global rate limit `/api/*` → ~50 router → `/v1` public API → webhooks → 301 legacy redirects (SEO) → OpenAPI (`/openapi.json`, `/docs` via Scalar) → static SPA.

### Domain route (67 file, ~20.800 LOC)

- **Publishing**: `posts`, `posts-bridge` (fallback via Repliz), `carousel`, `video`, `auto-clip`, `media`, `renders`, `threads`, `tiktok`, `sound`, `import` (CSV), `blog`
- **OAuth**: `oauth/{start,callback,repliz-callback,bluesky,token}`, `accounts`, `collabs`
- **Analitik/Intel**: `analytics`, `engagement`, `report`, `listening`, `competitor`, `trends`, `goal`, `strategy`
- **AI**: `ai` (caption/hashtag/rewrite/repurpose + usage), `coach`, `seb`, `repliz`
- **Messaging/otomasi**: `dm`, `automation`, `push`, `notifications`, `contact`
- **Admin** (20 halaman): users (+impersonation), billing, config, api-access, api-quota, api-tests (~2.000 LOC sistem test internal), holidays, monitoring, blog editor, org-activity, logs, credentials, settings, plans, contact-inbox, ai-usage, organizations, collabs, payment-config, dashboard
- **Billing/commerce**: `billing`, `commerce`, `webhook` (Sumopod Pay)
- **Webhooks**: `webhook-platform` (inbound Meta/IG/Threads/TikTok), `webhook-endpoints` (outbound config), `v1/webhooks` (delivery log)

### `src/lib/` (22 file, 3.745 LOC)

- **`auth-guard.ts`** (268) — tulang punggung. `getAuthContext`: session → org via 3-tier prioritas (`session.activeOrganizationId` → `user.lastActiveOrganizationId` → membership terbaru). **Org-scoping divalidasi via inner join `member`⇥`organization`**, bukan percaya session. Dipakai ulang oleh jalur API key (`c.get("apiKeyAuth")` short-circuit) — elegan, tidak ada guard paralel. Permission = union role built-in + custom `teamRole`; owner = `ALL_PERMISSION_CODES`.
- **`rate-limit.ts`** — fixed window in-memory, diakui sendiri hanya untuk single instance. Preset: global 100/60s, AI 10/60s, public API 60/60s per key.
- **`ssrf.ts`** (112) — scheme allowlist, DNS resolve `all: true` (tolak jika **ada** record private), handle IPv4-mapped IPv6, loopback, link-local, ULA.
- **`crypto.ts`** — AES-256-GCM, format envelope `v1.iv.ciphertext.tag`, validasi panjang key — versi memungkinkan rotasi key di masa depan.
- **`api-key.ts`** — `sk_api_<32 base64url>`, hanya hash SHA-256 di DB, `timingSafeEqual`, cek revocation/expiry/banned, **dan membership live** (key mati saat creator keluar org). `touchLastUsedAt` di-throttle 1 write/menit.
- **`public-api.ts`** — chain `verifyApiKey → publicApiRateLimit → publicApiPlanGate → requireScope`; scope `api_webhook` hanya Enterprise.
- **`billing.ts`** — pool quota; `consumeRenderCredits` (video=10, carousel=5, auto-clip=5).
- **`r2.ts`** — layout key `<orgId>/<yyyy>/<mm>/<id>.<ext>`, presigned upload/download, lazy singleton.
- **`ai.ts`** — OpenRouter, tabel kredit (caption=1 … coach/trends=3), config dari admin DB (terenkripsi) → fallback env, cache 60 detik.
- **`sumopod.ts`** — verify webhook token timing-safe + idempotensi via `processedWebhookEvent` + two-stage schema (envelope longgar untuk test event, strict untuk real).

### Public API v1 (`packages/api`)

Pendekatan cerdas di `apps/server/src/routes/v1/mount.ts`: **handler disalin dari router `/api` existing berdasarkan allowlist `(method, path, scope)`** — tidak ada duplikasi logika query, tetap closed allowlist, dan **module middleware (`use("*")`) ikut disalin** agar rate limit & feature gate tetap berlaku. `verify-openapi.ts` adalah drift guard: canonical-stringify `openapi.json` yang di-commit vs regenerasi, exit 1 jika beda. Ada test untuk ini (`mount.test.ts`, 79 baris) — salah satu dari 3 test di repo, dan ini benar-benar regression test bug nyata.

---

## 6. Publishing Engine (`packages/publishing`)

### 12 adapter platform

Registry di `adapters/index.ts`. Kontrak `PlatformAdapter` (`types.ts`): `publish()` + optional `checkStatus()` untuk flow async (TikTok `publish_id`, IG container, YT upload). Aturan eksplisit: **adapter tidak boleh sleep/polling internal**.

`PLATFORM_DAILY_LIMITS` memuat batas aman per platform per 24 jam (dari riset dokumentasi platform): TikTok paling konservatif (15), Threads 250, Bluesky 200, dll.

`FIRST_COMMENT_PLATFORMS` — pengeluaran LinkedIn personal didokumentasikan panjang (sejak Juni 2023 LinkedIn memisahkan `w_member_social_feed`; hanya app Community Management API yang punya). Ini contoh komentar kode yang sangat berharga.

### Pipeline (`pipeline.ts`, 971 baris)

State machine dengan **claim atomik**: `UPDATE ... WHERE status='scheduled' RETURNING` dan `SELECT ... FOR UPDATE SKIP LOCKED` (fallback mode) — mencegah double-publish antar server-inline vs worker.

- `executePublish` (BullMQ): error retryable **di-throw** untuk retry backoff; error permanen di-return.
- `publishPost` (fallback DB): retryable → langsung `failed` (tidak ada backoff engine).
- Polling async: `pollPost` / `pollInFlightPosts`.
- `recoverStalePosts`: post stuck `publishing` > 30 menit → `failed` (`stale_timeout`).
- `backfillTikTokPostUrls`: TikTok hanya beri `share_url` setelah post public + lolos moderasi — di-poll ulang dari `publish_id` (yang mengandung `~`).
- Notifikasi push + in-app setelah published/failed, dengan landing page berbeda (`/publish-ready` vs `/post-failed`).
- **Jalur bridge Repliz**: akun dengan `metadata.replizAccountId` dipublikasi via Schedule API Repliz (77 endpoint terimplementasi di `repliz/`), first comment via Repliz Comment API karena token platform asli tidak ada di sisi kita.

### Sync loops (di worker)

`engagement-sync` (komentar/review → inbox), `analytics-sync` (followers + metrik → snapshot harian), `dm-sync` (DM IG/FB), `posts-sync` (import konten yang terbit langsung di platform, 4 jam sekali), `token-refresh` (proaktif refresh token expired ≤ 2 hari), `platform-health` (ping endpoint ringan → halaman `/status`).

Semua loop: `if (running) return` guard + stagger startup (3s, 10s, 15s, 20s, 25s, 35s, 45s, 90s, 2m, 3m, 4m, 5m, 6m).

### Queue (`packages/queue`) & Render (`packages/render`)

BullMQ dengan 7 worker: publish (per platform), reminder, auto-reply, video render (concurrency 2), carousel render (concurrency 4), auto-clip, webhook delivery (concurrency 10). `layout-director.ts` menghitung layout slide carousel.

**Render sepenuhnya di Modal.com (Python)** di `apps/render-modal/` — deploy terpisah dari monorepo. Alasannya didokumentasikan dengan kalkulasi RAM: server prod 2 core/4 GB sudah over-allocated (postgres 1g + app 1g + worker 1.5g = 3.5g); FFmpeg 1080p butuh 0.5–1.5 GB → OOM killer akan membunuh **Postgres** (oom_score tertinggi karena shared memory), bukan FFmpeg. Solusi: Modal per-second billing, scale-to-zero. Ini keputusan arsitektur yang matang.

`getRenderAdapter()` **return null** (bukan throw) jika belum dikonfigurasi → route menolak 503 yang jelas, worker skip queue. Graceful degradation konsisten, sama seperti `REDIS_URL` opsional.

### Worker (`apps/worker`, 656 baris)

Mode hybrid: BullMQ jika `REDIS_URL`, jika tidak → DB polling (presisi ±30 detik, tanpa backoff). Cron endpoints (`/run`, `/sync-*`) dilindungi `x-cron-secret` dengan **fail-closed** (503 jika secret belum dikonfigurasi) + SHA-256 hash dulu sebelum `timingSafeEqual`. **Worker punya graceful shutdown SIGTERM/SIGINT** (`closeQueues()`) — server API tidak.

---

## 7. Frontend (`apps/web`)

**React 19 + react-router 8 (data router) + Vite 8 + Tailwind v4.** 196 file, ~46.400 LOC.

- **State**: TanStack Query sebagai state utama (282 `queryKey`), Zustand hanya 2 store (theme, command palette). QueryClient: `staleTime 30s`, `retry 1`, `refetchOnWindowFocus false`.
- **Router** (432 baris): 5 grup — Marketing (eager, SEO-critical), Auth (guest-only + `RedirectIfAuthenticated`), Dashboard (~30 route + 3 hub dengan nested tabs: `/performance`, `/research`, `/assistant`), Admin (20 route), `*` → NotFound asli (komentar eksplisit: hindari soft-404 SEO anti-pattern). Code-splitting: dashboard/admin semua `lazy()` + `withFallback(PageSkeleton)`.
- **PWA**: `injectManifest` strategy + custom `sw.ts` (Workbox + web push). Navigation fallback **denylist `/api/*`** agar verification link email sampai server — bug halus yang sudah dipremped. Manifest punya `share_target` + `file_handlers`. SW sengaja dimatikan di dev (alasan modul-eval didokumentasikan).
- **Compose** (27 komponen) — fitur paling kompleks; bisnis logic diekstrak ke `use-compose-form.ts` (637 baris).
- **Calendar**: 3 view drag-to-reschedule (@hello-pangea/dnd), helper `withDragIndexes` menangani constraint bahwa Droppable index harus contiguous dari 0 (external post harus non-draggable). `groupByDate` memperingatkan bahaya slice UTC string raw — post pagi WIB bisa geser hari.
- **SEB** = AI coach persona proaktif ("Kenalin, aku SEB"): report 90 hari, rekomendasi, eksperimen, brand knowledge (scan website), floating chat di setiap halaman. Dibangun di `packages/db/src/seb/` + `apps/web/src/components/seb/`.
- **Etika/compliance** dicatat di kode: `video.tsx:6` menolak fitur anti-detection (metadata spoof, SEI removal).

### Frontend — masalah

- **`api-schema.d.ts` tidak ada** — script `codegen:openapi` ada tapi belum dijalankan; **setiap page mengetik ulang response sendiri** (`type Overview` di `analytics.tsx:45`, dll.) → bisa drift diam-diam dari kontrak server.
- **Query key string duplikat** (`["media"]` ×11 file, `["video-jobs"]` ×8, `["accounts"]` ×6) tanpa registry terpusat → invalidasi berserakan, risiko UI stale & collision.
- **`dangerouslySetInnerHTML` 3 tempat** (blog editor + blog post) — konten admin/first-party, tapi tidak terlihat ada sanitisasi di web. Perlu verifikasi server-side.
- **`const isAdmin = true;` hardcode** di `seb.tsx:82` (dead variable, comment bilang server validasi — arsitekturnya benar, tapi variabelnya menyesatkan).
- **2 eslint-disable merujuk plugin Next.js** (`@next/next/no-img-element`) — sisa migrasi framework.
- **18 file > 500 baris**; terbesar `video.tsx` 1.750 baris.

---

## 8. MCP Server (`apps/mcp`)

Adapter tipis stdio di atas Public API `/v1`: **tools mengikuti scope token** (`SAHABATKREATOR_API_KEY`). 15 tool terdaftar — ping, list_accounts, list_posts, get_post, analytics_overview/top_posts, report_summary, list_media, render_manifest, ai_caption, ai_hashtag, trends, list_automation, webhook_deliveries. Tool write hanya muncul jika token punya scope-nya. Verifikasi token sekali di awal via ping (mengembalikan scopes), exit 1 jika gagal.

---

## 9. Test & Tooling

| Test file | Lokasi | Baris |
|---|---|---|
| `seo.test.ts` | apps/web/src/lib | 48 |
| `mount.test.ts` | apps/server/src/routes/v1 | 79 |
| `webhook-emit.test.ts` | packages/queue/src | 31 |

**3 file test untuk ~81.700 LOC.** Vitest semua terkonfigurasi dengan `--passWithNoTests` → **bisu di CI**. `@vitest/coverage-v8` terinstall tapi coverage efektif tidak terukur. `@playwright/test` + `playwright` ada di devDependencies **tetapi tidak ada satu pun file `.spec.ts`**.

Biome 2.5 aktif (preset recommended + style rules ketat: `noParameterAssign`, `useEnumInitializers`, `noInferrableTypes`, `useSortedClasses` warning). `bun run check` → `biome check --write .`.

**Prioritas tertinggi untuk perbaikan:** test suite. Bidang paling kritis tanpa test: `packages/publishing` (pipeline publish, sinkronisasi), billing/webhook Sumopod, dan 12 adapter platform.

---

## 10. Temuan Keamanan

**Kuat:**

1. AES-256-GCM untuk semua kredensial platform; guard boot-time produksi tanpa `ENCRYPTION_KEY`.
2. API key: SHA-256 only + constant-time + auto-revoke saat keluar org.
3. Webhook signature HMAC-SHA256 timing-safe; `instagram_standalone` **tidak** fallback ke `META_APP_SECRET`.
4. SSRF guard komprehensif (DNS all-records check, IPv4-mapped IPv6, ULA, link-local).
5. Idempotency webhook pembayaran (`processed_webhookEvent`).
6. Allowlist tertutup untuk `/v1`; 404 catch-all di belakang auth → tidak ada endpoint enumeration (401, bukan 404).
7. Org-scoping divalidasi join membership, bukan percaya `activeOrganizationId` session.
8. Web: cookie auth (tidak ada token di localStorage), `credentials: "include"` selalu, SW denylist `/api/*`.

**Perlu perhatian:**

1. **Tidak ada global error handler di `/api`** — hanya `/v1` punya `onError`. Unhandled throw → response 500 yang bisa bocor info.
2. **Webhook platform secret fallback ke env saat decrypt DB gagal** (`webhook-platform.ts:37-52`) — silent downgrade ke secret yang mungkin stale, bukan fail-closed.
3. **`bodyLimit` 110MB berlaku untuk semua route**, termasuk endpoint JSON-only.
4. **`getClientIp` percaya `x-forwarded-for` tanpa trusted-proxy list** — spoofable, berdampak pada audit log dan IP-keyed rate bucket.
5. **Tidak ada blokir session-level untuk impersonasi platform admin lain** (`admin-users.ts`).
6. **Rate limiting in-memory** → tidak scale multi-instance; juga satu IP shared bucket memungkinkan cross-tenant DoS.
7. **Server API tanpa graceful shutdown** — worker punya, server tidak. Setiap deploy kill in-flight request + queue hook registration.

---

## 11. Rekomendasi Prioritas

**P0 — minggu ini:**
1. Tambah `app.onError` global di server (masking stack trace, structured log, correlation ID).
2. Server graceful shutdown: `SIGTERM` → stop accept + drain + `closeQueues()`.
3. Jalankan `codegen:openapi` dan buat query-key registry (`src/lib/query-keys.ts`) — eliminasi drift kontrak dan key collision.
4. Webhook secret: fail-closed saat decrypt gagal (jangan fallback env).

**P1 — bulan ini:**
5. Test suite untuk pipeline publish (`claimDuePosts` race, `executePublish` retryable vs permanen, daily limit) — integration test dengan testcontainer Postgres + Redis.
6. Pecah file >800 baris: `video.tsx` (1.750), `admin-api-tests*` (~2.000, jadi package tersendiri), `analytics-sync.ts` (1.049), `auto-clip-processor.ts` (969).
7. Pindahkan rate limiting ke Redis (BullMQ sudah punya koneksi) agar scale multi-instance.
8. Sanitisasi HTML blog (server-side, allowlist tag) sebelum `dangerouslySetInnerHTML`.
9. Trusted-proxy list untuk `getClientIp` (Cloudflare `CF-Connecting-IP` sudah dipakai di NGINX, tapi `getClientIp` baca header sendiri).

**P2 — kuartal ini:**
10. Playwright e2e (dependency sudah ada, spec belum ada) — alur kritis: signup → connect akun → compose → schedule → publish.
11. Coverage threshold di Vitest (di `vitest.config` + CI gate), mulai dari packages yang menangani uang.
12. Rotasi `ENCRYPTION_KEY` — format `v1.` sudah memungkinkan, tapi re-encrypt path belum ada.
13. DR/backup otomatis untuk `postgres_data` volume (prod self-hosted; saat ini hanya `pg_dump` manual via `docker exec`).

---

## 12. Penilaian Keseluruhan

| Aspek | Skor | Catatan |
|---|---|---|
| Arsitektur | 9/10 | Pemisahan domain sangat rapi, graceful degradation konsisten |
| Keamanan | 8/10 | Fundamental kuat; beberapa gap fail-open & global error handling |
| Kualitas kode | 8/10 | Komentar terbaik yang pernah dilihat di repo komersial; beberapa file raksasa |
| Typing | 9/10 | Strict, zero `any` di web; tapi response type manual bisa drift |
| Testability | 2/10 | **Ini satu-satunya titik lemah utama** — 3 test file / 81.700 LOC |
| Operasional | 7/10 | Docker + NGINX + health check baik; graceful shutdown server hilang |
| Dokumentasi inline | 10/10 | Setiap keputusan non-trivial dijelaskan "mengapa", termasuk jejak bug |

**Kesimpulan:** Codebase yang matang dan dipikirkan dengan baik — level produksi yang jarang terlihat pada tim kecil. Kelemahannya tunggal dan jelas: **hampir tidak ada automated test** pada produk yang menangani pembayaran, kredensial OAuth 12 platform, dan penjadwalan konten. Perbaikan itu memberikan ROI tertinggi dibanding refactoring apapun.
