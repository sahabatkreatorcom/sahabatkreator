# CHANGELOG FIXES — Sahabat Kreator

Riwayat perbaikan bug. Terbaru → terlama. Hanya entri yang sudah terverifikasi (`PENDING` kalau masih dugaan).

---

### Fix #17 — Web crash startup: `@swc/helpers` tidak lengkap di standalone (Turbopack tracing)
**Gejala:** Container `web` restart-loop:
`Error: Cannot find module '/app/node_modules/.pnpm/next@.../node_modules/@swc/helpers/esm/_interop_require_default.js'`.
Migrate & worker OK; hanya web yang gagal.

**Akar:** `next build` (Turbopack) me-referensikan helper `@swc/helpers/esm/_interop_require_default`
di kode hasil kompilasi, tapi file-tracing **standalone** tidak selalu menyertakan seluruh isi
`@swc/helpers` — build lokal lengkap (438 file), build Docker di VPS tidak. Inkonsistensi tracing
antar environment (bug Turbopack file tracing yang dikenal). Runner hanya berisi hasil tracing →
file hilang → server.js crash.

| | |
|---|---|
| **File** | `apps/web/Dockerfile` — setelah `pnpm --filter web build`, RUN menyalin **utuh** `node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers` ke `standalone/node_modules/.pnpm/next@*/node_modules/@swc/helpers` (pakai glob pnpm path). |
| **Masalah** | Web crash loop karena helper next hilang dari image standalone |
| **Akar** | Turbopack tracing tidak menyertakan semua file `@swc/helpers` saat build Docker |
| **Fix** | Salin `@swc/helpers` secara eksplisit dari node_modules build ke standalone (fallback di Dockerfile, tidak bergantung tracing). |
| **Verifikasi** | Belum — perlu rebuild di VPS (`docker compose up -d --build`). Build lokal lengkap (438 file vs 438). |
| **Pelajaran** | Standalone tracing bisa meloloskan helper runtime; untuk dep yang direferensikan compiler (seperti `@swc/helpers`) sebaiknya dijamin lewat `outputFileTracingIncludes` atau salinan eksplisit di Dockerfile. |
| **Log Keyword** | swc helpers, interop_require_default, standalone, file tracing, turbopack, restart loop, cannot find module |
| **Deploy** | PENDING — menunggu rebuild di VPS |

---

### Fix #16 — Service `migrate` gagal: image runner standalone tak punya pnpm/packages + user nextjs tak bisa tulis corepack cache
**Gejala:** Build image sukses, tapi container `migrate` exit 1:
`EACCES: permission denied, mkdir '/home/nextjs/.cache/node/corepack/v1'` saat menjalankan `pnpm --filter @sahabat-kreator/db db:migrate`.

**Akar:** Setelah `output: "standalone"` (Fix #9), stage `runner` di `apps/web/Dockerfile` hanya berisi
hasil tracing (`server.js` + node_modules tersaring) — **tidak ada pnpm & `packages/db`** untuk
`db:migrate`. Service `migrate` di compose memakai Dockerfile yang sama tanpa `target`, jadi jatuh ke
stage `runner` yang berjalan sebagai user `nextjs` (tanpa izin tulis corepack cache) dan tanpa pnpm.

| | |
|---|---|
| **File** | `apps/web/Dockerfile` (stage baru `migrate` berbasis `deps` — punya pnpm + seluruh workspace + node_modules; `HOME=/root`, `COREPACK_HOME=/root/.cache/node/corepack` agar corepack bisa tulis cache), `docker-compose.yml` (service `migrate` kini `build.target: migrate`, hapus blok `args` yang tak relevan) |
| **Masalah** | Migrasi DB gagal di compose; DB tak pernah di-migrate → web/worker tak start |
| **Akar** | Service migrate memakai stage runner standalone (tanpa pnpm/packages/db) sebagai user nextjs |
| **Fix** | Stage `migrate` khusus dari `deps` (root, cache corepack eksplisit) + `target: migrate` di compose. `db:migrate` kini berjalan di image yang memang punya pnpm, drizzle-kit, dan `packages/db`. |
| **Verifikasi** | Belum — perlu rebuild di VPS (`docker compose up -d --build`). Container lama masih dari image sebelumnya. |
| **Pelajaran** | Service compose yang butuh tooling workspace (pnpm/drizzle) tidak boleh berbagi stage `runner` standalone; pakai stage terpisah yang berbasis deps + `build.target`. |
| **Log Keyword** | migrate, corepack, EACCES, nextjs, home cache, standalone runner, build target, db:migrate |
| **Deploy** | PENDING — menunggu rebuild di VPS |

---

### Fix #15 — `next build` gagal: halaman blog & sitemap di-prerender padahal baca DB
**Gejala:** Docker build web gagal di "Generating static pages" untuk `/blog` dengan
`getaddrinfo ENOTFOUND postgres` (query `blog_post` join `blog_tag` di `lib/blog.ts:20`).

**Akar:** Halaman publik `(marketing)/blog/page.tsx`, `(marketing)/blog/[slug]/page.tsx`, dan
`sitemap.xml/route.ts` membaca DB tetapi **tanpa deklarasi dinamik** → Next.js meng-prerender saat
`next build`. Saat build, host `postgres` belum ada (service baru naik saat runtime) → ENOTFOUND.

| | |
|---|---|
| **File** | `apps/web/src/app/(marketing)/blog/page.tsx`, `apps/web/src/app/(marketing)/blog/[slug]/page.tsx`, `apps/web/src/app/sitemap.xml/route.ts` — tambah `export const dynamic = "force-dynamic"` |
| **Masalah** | Build gagal; halaman blog memaksa akses DB saat build |
| **Akar** | Halaman statis (default prerender) yang meng-query DB |
| **Fix** | Paksa dinamis (`force-dynamic`) — DB diakses saat request, bukan saat build. |
| **Verifikasi** | `pnpm -r check-types` lolos. |
| **Pelajaran** | Halaman/route yang baca DB harus `force-dynamic` (atau `generateStaticParams` + `revalidate`) bila di-deploy dengan DB yang hanya ada saat runtime. |
| **Log Keyword** | next build, prerender, force-dynamic, ENOTFOUND postgres, blog, sitemap, static pages |
| **Deploy** | PENDING — menunggu rebuild di VPS |

---

### Fix #14 — `next build` gagal: Resend di-init saat import (pakai RESEND_API_KEY yang opsional)
**Gejala:** Docker build web/migrate gagal saat "Collecting page data for /accept-invitation/[id]" dengan
`Error: Missing API key. Pass it to the constructor new Resend("re_123")` — padahal env build sudah lengkap.

**Akar:** `packages/email/src/index.ts` membuat `new Resend(process.env.RESEND_API_KEY)` di **module scope**.
`RESEND_API_KEY` adalah opsional di env schema, tapi saat `next build` mengumpulkan halaman `/accept-invitation/[id]`,
auth meng-import email → evaluasi module langsung memanggil `new Resend(undefined)` → throw.

| | |
|---|---|
| **File** | `packages/email/src/index.ts` |
| **Masalah** | Build gagal meski env lengkap; email tak terkirim tanpa key |
| **Akar** | Inisialisasi Resend di module-level dengan key opsional |
| **Fix** | Lazy-init `getResend()` — instance dibuat hanya saat `sendEmail` dipanggil; tanpa `RESEND_API_KEY` lempar error jelas di runtime, bukan saat import. Ekspor `resend` langsung dihapus (tidak ada konsumennya). |
| **Verifikasi** | `pnpm -r check-types` lolos (9 workspace). |
| **Pelajaran** | SDK yang butuh API key sebaiknya di-init lazy; module-level init membuat import mana pun (termasuk `next build` page data) crash bila env opsional kosong. |
| **Log Keyword** | resend, email, missing api key, next build, page data, module scope, lazy init |
| **Deploy** | PENDING — menunggu rebuild di VPS |

---

### Fix #13 — Docker build gagal: build args tidak lengkap (ENCRYPTION_KEY, R2_*) & migrate tanpa args
**Gejala:** `docker compose up -d --build` gagal di `[migrate build] RUN pnpm --filter web build` dengan
`Invalid environment variables` untuk `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`CORS_ORIGIN`, `ENCRYPTION_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
— semua "received undefined".

**Akar:** (1) Service `migrate` memakai `apps/web/Dockerfile` yang sama tapi **tanpa blok `build.args`**,
jadi semua ARG kosong saat `next build` dijalankan di stage build. (2) `ENCRYPTION_KEY` dan `R2_*`
tidak pernah dideklarasikan sebagai ARG/ENV di Dockerfile maupun dilempar dari compose — padahal env
schema mewajibkannya saat `NODE_ENV=production` (`z.string().min(1)` untuk R2_*, superRefine khusus
production untuk ENCRYPTION_KEY), dan `next build` mengumpulkan page data `/sitemap.xml` yang
meng-import DB → env server.

| | |
|---|---|
| **File** | `apps/web/Dockerfile` (tambah ARG+ENV `ENCRYPTION_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`), `docker-compose.yml` (blok `build.args` lengkap di service `migrate` — sebelumnya tidak ada — dan service `web`) |
| **Masalah** | Build Docker web/migrate gagal validasi env |
| **Akar** | ARG tidak dideklarasikan/lewat untuk ENCRYPTION_KEY & R2_*; service migrate tanpa args |
| **Fix** | Deklarasikan ARG+ENV di Dockerfile untuk 5 variabel; tambah `build.args` ke `migrate` & `web` dengan nilai dari `.env` (fallback NEXT_PUBLIC_APP_URL). |
| **Verifikasi** | Belum — user perlu `docker compose up -d --build` ulang di VPS. |
| **Pelajaran** | Service compose yang berbagi Dockerfile yang menjalankan `next build` WAJIB punya `build.args` sama; setiap variabel wajib-build di env schema harus di-ARG-kan. |
| **Log Keyword** | docker build, build args, env validation, invalid environment variables, sitemap, migrate, next build |
| **Deploy** | PENDING — menunggu rebuild di VPS |

---

### Fix #12 — Kontrak Transcoder (interface) dengan default ffmpeg lokal
**Gejala:** Transcode video terkunci ke implementasi ffmpeg di `apps/worker/src/ffmpeg.ts` — memindah transcode ke layanan eksternal (Modal.com, dsb) akan mengubah worker loop.

**Akar:** Tidak ada abstraksi; worker loop memanggil `transcodeVideoBuffer` langsung.

| | |
|---|---|
| **File** | `apps/worker/src/transcoder/types.ts` (baru: `Transcoder`, `TranscodeRequest`, `TranscodeResult`), `apps/worker/src/transcoder/local.ts` (baru: `LocalTranscoder` = bungkus ffmpeg), `apps/worker/src/transcoder/index.ts` (baru: `resolveTranscoder()` — env `TRANSCODER`, default "local", fail-fast untuk "modal" yang belum ada), `apps/worker/src/index.ts` (pakai `transcoder.transcode(...)`, log start tampilkan `transcoder=<name>`), `.env.example` + `docker-compose.yml` (`TRANSCODER=local`) |
| **Masalah** | Transcode tidak bisa dialihkan ke provider lain tanpa ubah worker loop |
| **Akar** | Tidak ada kontrak/abstraksi transcoder |
| **Fix** | Interface `Transcoder` + resolver env. Worker loop tak tahu implementasinya. Implementasi Modal tinggal menambah `transcoder/modal.ts` + daftarkan di `resolveTranscoder()` — worker loop tidak berubah. Fail-fast bila `TRANSCODER=modal` (agar tidak diam-diam memakai ffmpeg lokal). |
| **Verifikasi** | `pnpm -r check-types` lolos (9 workspace). |
| **Pelajaran** | Abstraksi dengan resolver env memungkinkan swap provider runtime tanpa refactor worker loop; fail-fast lebih baik daripada default diam-diam. |
| **Log Keyword** | transcoder, interface, modal, provider, ffmpeg, resolve, abstraction |
| **Deploy** | PENDING — belum live |

---

### Fix #11 — Worker media: fallback poster-only untuk video besar + default hemat RAM
**Gejala:** Video > `WORKER_MAX_VIDEO_BYTES` (default 100 MB) **tidak pernah diproses** — query `findPendingVideos` memfilter `size <= MAX`, jadi video besar diam-diam terabaikan (tanpa thumbnail, tanpa analisis Seb). VPS 2 core/4GB rentan OOM karena ffmpeg transcode berat (batch default 3 + concurrency publish 3).

**Akar:** Filter ukuran di query seleksi (bukan branch pasca-download) membuat video besar tak pernah diambil; default batch/concurrency terlalu besar untuk VPS kecil.

| | |
|---|---|
| **File** | `apps/worker/src/index.ts` (hapus filter `size <=` dari query, ambil kolom `size`, branch poster-only: `count:0`, tanpa transcode, status `LIMITED`; log start kini sertakan `maxBytes`), `apps/web/src/lib/queue-worker.ts` (concurrency `publishWorker` 3→1, `syncWorker` 2→1), `.env.example` (batch 1, poll 15000, komentar VPS kecil), `docker-compose.yml` (default batch 1, poll 15000), `docs/DEPLOYMENT.md` (bagian "Konfigurasi hemat RAM" + langkah swap 2 GB) |
| **Masalah** | Video besar tak diproses; risiko OOM ffmpeg di VPS 4 GB |
| **Akar** | Filter ukuran di query; default batch/concurrency terlalu tinggi |
| **Fix** | Semua video diambil; yang > batas dibuat poster saja (ffmpeg 1 frame, tanpa transcode) status `LIMITED`; yang normal tetap `DONE` penuh. Default batch=1, poll=15s, concurrency=1. |
| **Verifikasi** | `pnpm -r check-types` lolos (web, worker, db, auth, dll). `LIMITED` aman di UI (pakai `thumbnailUrl ?? url`). |
| **Pelajaran** | Pembatas ukuran sebaiknya jadi branch pemrosesan, bukan filter seleksi — supaya ada fallback yang terlihat, bukan skip diam-diam. |
| **Log Keyword** | worker, ffmpeg, max video bytes, oversized, poster only, limited, batch, concurrency, swap, ram vps |
| **Deploy** | PENDING — belum live |

---

### Fix #10 — SSL/HTTPS produksi: reverse proxy Caddy + harden exposure port
**Gejala:** `docker-compose.yml` mengekspos port publik `3000` (web) & `5432` (postgres) langsung ke host — tanpa HTTPS (web HTTP-only), DB terbuka ke internet.

**Akar:** Tidak ada layer reverse proxy/SSL di deployment; compose mem-publish port service tanpa perlu.

| | |
|---|---|
| **File** | `Caddyfile` (baru: `{$DOMAIN}` auto TLS Let's Encrypt, redirect 80→443, `reverse_proxy web:3000`, header HSTS), `docker-compose.yml` (service `caddy` + volume `caddy-data`/`caddy-config`, hapus `ports` publik di `postgres` & `web`, `depends_on web: service_healthy`), `.env.example` (tambah `DOMAIN`, hapus `WEB_PORT`/`POSTGRES_PORT`), `docs/DEPLOYMENT.md` (bagian "DNS & SSL", arsitektur Caddy, renumber 2→8) |
| **Masalah** | Tidak ada HTTPS & port internal terexpose publik |
| **Akar** | Tanpa proxy TLS; `ports:` dipublish ke host |
| **Fix** | Caddy satu-satunya yang expose 80/443; postgres & web hanya di network compose; env `DOMAIN` wajib; dokumen langkah DNS A-record + firewall 80/443. |
| **Verifikasi** | Struktur YAML valid; `docker compose` belum diuji (docker tidak tersedia di mesin dev). |
| **Pelajaran** | Service internal tidak boleh di-publish ke host; SSL sebaiknya ditangani proxy (Caddy) bukan app. |
| **Log Keyword** | ssl, https, caddy, letsencrypt, reverse proxy, compose ports, exposure |
| **Deploy** | PENDING — belum live |

---

### Fix #9 — Next.js output standalone + Dockerfile runner minimal
**Gejala:** Image web Docker menyalin seluruh `node_modules` workspace + source → besar & memuat file tak terpakai.

**Akar:** `next build` default memakai mode tracing yang terpisah dari runtime; runner Docker menyalin semua dep workspace.

| | |
|---|---|
| **File** | `apps/web/next.config.ts` (`output: "standalone"` + `outputFileTracingRoot: workspaceRoot`), `apps/web/Dockerfile` (runner → salin `.next/standalone` + symlink `.next/static` & `public`, `CMD node server.js`, cwd `apps/web` karena struktur standalone mempertahankan prefix workspace) |
| **Masalah** | Image runner besar & menyertakan file tak dipakai |
| **Akar** | Tidak memakai standalone output Next.js |
| **Fix** | `output: "standalone"` + `outputFileTracingRoot` root workspace; runner hanya hasil tracing; aset via COPY static+public. |
| **Verifikasi** | `pnpm --filter web build` sukses; `standalone/apps/web/server.js` ada (prefix `apps/web/` karena tracing root); `server.js` baca `PORT`/`HOSTNAME`. Docker build belum diuji (docker tidak tersedia di mesin dev). |
| **Pelajaran** | Monorepo + standalone: wajib `outputFileTracingRoot` ke root, dan struktur server.js tetap mempertahankan prefix `apps/web/`. |
| **Log Keyword** | standalone, outputFileTracingRoot, Dockerfile runner, docker image, next build |
| **Deploy** | PENDING — belum live |

---

### Fix #8 — Kredensial platform: hybrid env→DB + admin panel + webhook secret terpusat
**Gejala:** (1) `getCredentialsForPlatform` hanya baca DB `global_platform_credential` — padahal tak ada admin API/UI untuk mengisinya, dan `.env.example` menjanjikan "fallback env" yang tak pernah diimplementasikan → callback OAuth pasti gagal `no_credentials`. (2) Secret webhook dibaca langsung dari env per-platform (`META_APP_SECRET`, `TIKTOK_CLIENT_SECRET`, `WEBHOOK_VERIFY_TOKEN`) sedangkan OAuth connect baca DB — dua sumber berbeda; kredensial diisi via DB tapi webhook TikTok/Meta tetap pakai env (salah verifikasi). (3) Tidak ada jalur pengisian kredensial platform untuk pengajuan akses API.

**Akar:** Kredensial global tersimpan di DB tapi tidak ada lapisan tulis (admin API/UI) maupun pembaca terpadu antara connect & webhook; fallback env dijanjikan docs tapi tidak di kode.

| | |
|---|---|
| **File** | `apps/web/src/lib/platforms/credentials.ts` (env→DB hybrid via `credentialPlatform` key), `apps/web/src/lib/webhooks/secrets.ts` (baru: `getWebhookSecretConfig` — DB dulu, env fallback), `apps/web/src/lib/webhooks/{meta,tiktok,youtube}.ts` (verify pakai DB config), 4 route webhook `apps/web/src/app/api/webhooks/*/route.ts` (await async verify), `apps/web/src/app/api/admin/platform-credentials/route.ts` (baru: GET list masked + PUT upsert, secret dienkripsi `encryptToken`), `apps/web/src/app/admin/platforms/page.tsx` (baru: form per platform, switch aktif), `apps/web/src/components/admin/admin-sidebar.tsx` (link Platform Credentials), `.env.example` + `docs/DEPLOYMENT.md` (prioritas DB→env) |
| **Masalah** | Kredensial platform tak bisa diisi; webhook & connect membaca sumber secret berbeda |
| **Akar** | Tidak ada admin API/UI + tidak ada pembaca terpadu DB/env |
| **Fix** | `getCredentialsForPlatform`: env (`{KEY}_CLIENT_ID/SECRET`, FACEBOOK→META) dulu, lalu DB. `getWebhookSecretConfig`: DB `globalPlatformCredential` (clientSecret decrypt + webhookVerifyToken) dulu, env fallback. Admin `/admin/platforms`: isi Client ID/Secret/Verify Token per platform, enable/disable, secret terenkripsi, kosong = pertahankan lama. Route webhook jadi `async` verify. |
| **Verifikasi** | `pnpm -r check-types` hijau; `pnpm --filter web build` sukses. Belum diuji live connect OAuth. |
| **Pelajaran** | Secret global harus punya satu pembaca (DB dulu → env fallback) dan satu jalur tulis (admin); janji docs harus diimplementasikan di kode. |
| **Log Keyword** | platform credentials, global_platform_credential, webhook secret, hybrid env DB, admin panel, OAuth connect, META_APP_SECRET |
| **Deploy** | PENDING — belum live |

---

### Fix #7 — Env single source of truth di root
**Gejala:** Tiga file env terpisah (`apps/web/.env.example`, `apps/worker/.env.example`, root `.env.example` untuk compose) → duplikasi, rawan mismatch; `.env` dev di `apps/web` tidak dibaca worker/tooling DB.

**Akar:** Setiap app/package memuat env dari direktori masing-masing; tidak ada loader terpusat ke root workspace.

| | |
|---|---|
| **File** | `packages/env/src/load.ts` (baru: `loadRootEnv`, `findWorkspaceRoot`, `rootEnvPath`), `packages/env/src/server.ts` & `web.ts` (pakai `loadRootEnv`), `packages/db/drizzle.config.ts` (pakai `loadRootEnv`), `apps/web/.env.example` & `apps/worker/.env.example` dihapus, `.env.example` root dilengkapi, `.env` dev dipindah apps/web → root, `packages/env/package.json` export `./load` |
| **Masalah** | Tiga sumber env → inkonsistensi & kebingungan kontributor |
| **Akar** | Tidak ada loader env terpusat |
| **Fix** | Satu `.env` + `.env.example` di root; `loadRootEnv()` naik CWD ke root (`pnpm-workspace.yaml`) & memuat `.env`; dipakai server.ts/web.ts/drizzle.config. `.env.e2e` tetap di apps/web (khusus Playwright). |
| **Verifikasi** | `pnpm -r check-types` hijau; `next typegen` & `pnpm --filter web build` sukses (root env terbaca; bila DATABASE_URL kosong t3-env akan throw). |
| **Pelajaran** | Monorepo: satu file env di root + loader idempoten lebih mudah di-maintain daripada per-app. |
| **Log Keyword** | env, dotenv, single source of truth, loadRootEnv, monorepo |
| **Deploy** | PENDING — belum live |

---

### Fix #6 — Bersih-bersih menyeluruh: dead code/deps/file, Postgres Docker produksi, maintainability, dokumentasi
**Gejala:** (1) Dead code: `lib/logger.ts`+`evlog`, `emails/`+`react-email`, `lib/email.ts`, `lib/seo-helper.ts`, `hooks/use-push-notifications.ts`, `packages/env/src/native.ts` — tak di-import siapa pun. (2) Bug `admin/blog/new/page.tsx` self-import (`import ... from "./page"`) → rekursi/stack overflow, halaman "Post Baru" rusak. (3) `admin/stats` mengembalikan angka palsu (totalPosts:1234 dst). (4) Route API mati: `/api/blog/*` (3) + `/api/admin/billing/plans` (mock). (5) 4 env SumoPod tak terpakai (konfigurasi dari DB). (6) `docker-compose.yml` tanpa postgres — produksi masih mengarah ke Neon; tanpa migrasi otomatis (race web vs DB). (7) 7 route admin boilerplate duplikat; billing fetch session 2x. (8) `package.json` rusak format oleh tool (BOM + indentasi) → build gagal.

**Akar:** 1) Fitur dihapus tapi file/deps tertinggal. 2) Wrapper salah import. 3) Placeholder belum diganti query nyata. 4) Blog render server-side, API tak dipakai. 5) Migrasi ke DB config meninggalkan env. 6) Compose hanya redis+web+worker. 7) Kurang wrapper role-based. 8) ConvertTo-Json + UTF-8 BOM.

| | |
|---|---|
| **File** | Hapus: `lib/logger.ts`, `lib/email.ts`, `lib/seo-helper.ts`, `hooks/use-push-notifications.ts`, `src/emails/`, `packages/env/src/native.ts`, `app/api/blog/`, `app/api/admin/billing/plans/`. Fix: `admin/blog/new/page.tsx` (import `../[id]/page`). `admin/stats` → hitung DB nyata. Dep dihapus: `evlog`, `react-email`, `@sahabat-kreator/email`(web), `playwright`, `@better-auth/drizzle-adapter`(auth), root `@sahabat-kreator/env`/`dotenv`/`zod`. Env: hapus `SUMOPOD_*` (schema+example). `docker-compose.yml` + service `postgres`+`migrate`+healthcheck, `.env.example` root baru. Maintainability: `withAdmin`/`withOrgOwnerAdmin` wrapper + migrasi 12 route admin/blog/billing; `biome.json` baru + script `lint` (web/worker); `check-types` packages/env. Standardisasi `json()` di route admin/blog. `apps/web/.env.example` & `apps/worker/.env.example` ditulis ulang rapi. |
| **Masalah** | Lihat Gejala |
| **Akar** | Lihat Akar |
| **Fix** | Lihat kolom File + perbaikan di atas |
| **Verifikasi** | `pnpm -r check-types` hijau; `pnpm --filter web build` sukses (route webhook/health terdaftar). Postgres Docker: belum diuji `docker compose up` live. |
| **Pelajaran** | Jangan simpan dead file saat hapus fitur; route admin wajib wrapper role; tooling penulisan JSON jangan pakai ConvertTo-Json (BOM/format); prod DB = service postgres + migrate otomatis + healthcheck. |
| **Log Keyword** | dead-code, self-import, admin stats, sumopod env, postgres docker, migrate service, withAdmin, withOrgOwnerAdmin, biome, BOM package.json |
| **Deploy** | PENDING — belum live |

---

### Fix #5 — Audit produksi ke-3: webhook signature/replay, idempotency atomik, billing role & expiry, CSP media, env schema
**Gejala:** (1) Webhook TikTok tidak pernah lolos verifikasi — header asli `t=<ts>,s=<hmac>` dan `signed_payload = "${ts}.${body}"`, bukan hex polos dari body saja; envelope asli `{content (JSON string), user_openid}`, bukan `payload.from_user_id`. (2) Idempotency webhook non-atomik (check-then-act) → delivery konkuren bisa double-proses (double auto-reply). (3) Svix webhook SumoPod tanpa cek freshness timestamp → replay; handleWebhook tanpa transaksi, tanpa idempotency, `currentPeriodEnd` di-reset bukan diperpanjang, tanpa cek amount, member bisa downgrade tier via checkout. (4) Tidak ada penegakan expiry langganan (bayar sekali → tier permanen). (5) CSP `media-src` tidak diset → video R2 tidak bisa diputar; Google Fonts diblokir style-src; `<video src={thumbnail}>` salah. (6) `RESEND_FROM_EMAIL` di .env dev bukan email → build gagal.

**Akar:** 1) Implementasi TikTok mengikuti format hipotetis, bukan dokumen resmi. 2) `processWebhookEvent` melakukan SELECT lalu INSERT (TOCTOU). 3) `handleWebhook` & `createPayment` kurang hardening keamanan/idempotency. 4) Tidak ada cron downgrade. 5) CSP tidak lengkap.

| | |
|---|---|
| **File** | `apps/web/src/lib/webhooks/{tiktok,index,meta}.ts`, `apps/web/src/app/api/webhooks/*/route.ts`, `packages/payment/src/sumopod.ts`, `apps/web/src/app/api/billing/route.ts`, `apps/web/src/app/api/cron/billing/route.ts` (baru), `apps/web/src/lib/api.ts` (+`requireOrgOwnerAdmin`), `apps/web/next.config.ts`, `apps/web/src/app/dashboard/media/page.tsx`, `apps/web/src/app/(marketing)/harga/page.tsx` (harga BUSINESS 299k→249k), `.dockerignore` (baru), `packages/env/src/server.ts` (+RESEND/GITHUB/LOG_LEVEL), `apps/web/package.json` & `packages/payment/package.json` (bersihkan dep) |
| **Masalah** | Lihat Gejala |
| **Akar** | Lihat Akar |
| **Fix** | TikTok: parse `t=,s=`, HMAC `"${ts}.${body}"`, freshness 5 menit, envelope `content`/`user_openid`, lookup post by status. `processWebhookEvent` atomik (INSERT ON CONFLICT dulu, hapus penanda bila handler gagal). `readWebhookBody` batas 1MB. Meta: hapus `message_reactions`, eventId org-scoped. SumoPod: Svix freshness + timing-safe token + transaksi + idempotency (cek status COMPLETED) + cek amount + anti-downgrade + perpanjangan currentPeriodEnd + timeout fetch + sanitize redirect URL + validasi amount. Billing: role owner/admin + anti-downgrade. Cron billing: downgrade tier expired → FREE. CSP media-src + fonts; video src fix; root .dockerignore; env schema diperluas. |
| **Verifikasi** | `pnpm -r check-types` hijau; `pnpm --filter web build` sukses. Belum diuji live (butuh kredensial platform). |
| **Pelajaran** | Webhook platform WAJIB ikut format signature resmi (jangan tebak); idempotency wajib atomik (INSERT ON CONFLICT); webhook payment butuh freshness + cek amount + transaksi; harga harus satu sumber kebenaran; CSP harus mencakup media-src bila app memutar video. |
| **Log Keyword** | tiktok signature, svix replay, idempotency atomik, onConflict, billing owner admin, cron billing, tier expiry, media-src, resend from email, requireOrgOwnerAdmin |
| **Deploy** | PENDING — belum live |

---

### Fix #4 — Webhook platform sosial media (Meta IG/FB/Threads, TikTok, YouTube) + icon simple-icons
**Gejala:** Fitur inbox komentar & status publish hanya jalan via polling berkala (cron `/api/inbox/sync`, `/api/analytics/sync`) — komentar baru tidak muncul real-time; icon brand social tidak tersedia di lucide-react (sudah dihapus).

**Akar:** Belum ada endpoint webhook inbound; halaman dashboard memakai inisial/teks untuk icon platform.

| | |
|---|---|
| **File** | `apps/web/src/lib/webhooks/{index,meta,tiktok,youtube}.ts` (baru), `apps/web/src/app/api/webhooks/{instagram,facebook,threads,tiktok,youtube}/route.ts` (baru), `apps/web/src/lib/inbox/sync.ts` (export `upsertIncomingComment`), `apps/web/src/components/ui/platform-icon.tsx` (baru), footer + 8 halaman dashboard (accounts/analytics/inbox/posts/status/compose/calendar/trends + connections), `packages/env/src/server.ts` (+`META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`), `apps/web/package.json` (+`simple-icons`), `.env.example` |
| **Masalah** | Lihat Gejala |
| **Akar** | Lihat Akar |
| **Fix** | Webhook terpisah per platform (Meta IG `object:instagram`, FB `object:page`, Threads `object:threads`, TikTok Content Posting, YouTube PubSubHubbub). Verifikasi signature HMAC (`X-Hub-Signature-256`, `X-TikTok-Signature`) + handshake GET challenge. Idempotency via tabel `processed_webhook_event`. Wire: komentar IG/FB/Threads → upsert inbox + auto-reply; TikTok `post.publish.complete/fail` → update status post + publish_error; YouTube feed → aktivitas org. Icon: `PlatformIcon` dari simple-icons (LinkedIn/Manual fallback inisial). |
| **Verifikasi** | `pnpm -r check-types` hijau; `pnpm --filter web build` sukses; 5 route webhook terdaftar di build. Belum diuji live (butuh kredensial platform + config webhook di App Dashboard). |
| **Pelajaran** | Webhook Meta per objek (instagram/page/threads) = callback URL terpisah; signature butuh RAW body (jangan parse ulang); platform tanpa webhook publik (Pinterest/LinkedIn/Google Business) tidak bisa real-time → tetap polling. |
| **Log Keyword** | webhook, meta, instagram, facebook, threads, tiktok, youtube, pubsubhubbub, hub-challenge, x-hub-signature, simple-icons, platform-icon, upsertIncomingComment |
| **Deploy** | PENDING — belum live |

---

### Fix #3 — Audit ke-2: kebocoran data lintas-org, integritas DB, timestamp timezone, Stripe → SumoPod
**Gejala:** (1) `/api/status` membocorkan `publishError` semua org (tabel tanpa organizationId, query tanpa filter). (2) `.env.prod`/`.env.e2e` di root & apps/worker tidak ter-ignore → risiko secret ter-commit. (3) `blog_post_tag` tanpa primary key (sintaks `[{pk, column}]` invalid) → duplikasi baris + seq scan. (4) Kolom timestamp naive (`token_expiry`, `scheduled_at`) dibandingkan di JS → pergeseran zona, token dianggap expired/jadwal meleset. (5) Worker media tiap 10 dtk seq-scan `media` tanpa index `transcode_status`. (6) Billing masih placeholder Stripe, paket `@sahabat-kreator/payment` (SumoPod) dead code. (7) `authorId` admin blog salah simpan orgId.

**Akar:** 1) Query `publishError.findMany` tanpa scope org. 2) Pola `.gitignore` lama hanya `.env*.local`. 3) Sintaks Drizzle PK komposit yang salah. 4) `timestamp` tanpa timezone + perbandingan di sisi JS. 5) Index tidak menyertakan `transcode_status`. 6) Payment package dibuat tapi belum di-wire ke route. 7) `authorId: auth.activeOrganizationId`.

| | |
|---|---|
| **File** | `apps/web/src/app/api/status/route.ts`, `.gitignore`, `packages/db/src/schema/blog.ts`, `packages/db/src/schema/post.ts`, `packages/db/src/schema/social.ts`, `packages/db/src/schema/media.ts`, `packages/db/src/schema/auth.ts`, `packages/db/src/schema/settings.ts`, `packages/db/drizzle.config.ts`, `packages/env/src/server.ts`, `apps/web/src/lib/storage.ts`, `apps/web/src/lib/blog.ts`, `apps/web/src/app/api/billing/route.ts`, `apps/web/src/app/api/billing/webhook/route.ts`, `apps/web/src/app/dashboard/billing/page.tsx`, `packages/payment/src/{billing,sumopod,types}.ts`, `apps/web/next.config.ts`, `apps/web/src/app/(marketing)/{error,not-found}.tsx`, `apps/web/src/app/api/admin/blog/posts/route.ts`, `packages/email/package.json`, `apps/web/package.json`, `apps/web/src/instrumentation.ts` |
| **Masalah** | Lihat Gejala |
| **Akar** | Lihat Akar |
| **Fix** | status route join post + filter org; `.gitignore` → `.env*`+`!.env.example`; `blog_post_tag` composite PK; index media transcode/post status/invitation/team + unique member; `{withTimezone:true}` pada 4 kolom kritis; billing GET pakai plan limits + POST checkout SumoPod + webhook baru; hapus semua kolom stripe (organization & settings); `sumopodCustomerId`/`sumopodTrialDays`; sharp→dependencies; typescript^6; R2 env wajib; getPublicUrl R2_CUSTOM_DOMAIN; error/not-found page; CSP+HSTS; authorId=user.id |
| **Verifikasi** | `pnpm -r check-types` hijau (7 paket). Migrasi `0000_adorable_madame_web.sql` (82 tabel, 0 stripe, blog_post_tag PK, 4 timestamptz). Belum di-apply ke DB. |
| **Pelajaran** | Setiap query lintas-tabel wajib scope org; kolom waktu absolut yang dibandingkan di JS wajib `timestamptz`; pembayaran dipusatkan ke `@sahabat-kreator/payment` (SumoPod) — jangan fork ke Stripe; index harus mengikuti pola query (leading column pertama di WHERE). |
| **Log Keyword** | publishError, idor, timestamptz, blog_post_tag, transcode index, sumopod, webhook, stripe removal, gitignore env, authorId |
| **Deploy** | PENDING — belum live |

---

### Fix #2 — Hardening production + anti-SSRF + cron fail-closed + migrasi blog slug unik
**Gejala:** Endpoint cron bisa dipanggil tanpa auth bila `CRON_SECRET` kosong (fail-open); POST `/api/blog/posts/[slug]` publik bisa insert blog post; admin blog bisa diedit user non-admin; `stock-media/import` fetch URL bebas (SSRF); migrasi `0000_cloudy_rachel_grey.sql` gagal di DB baru karena duplikasi objek unik `blog_post_slug_unique`; `/api/health` tak cek DB; admin health hardcoded; `Bearer undefined` di sync routes.

**Akar:** 1) Pola `if (secret) { cek }` di cron routes melewati auth bila env kosong, dan perbandingan string non-constant-time. 2) Route blog publik menyisakan `POST` lama dari sistem blog. 3) `admin/blog/posts` hanya `requireAuth` tanpa cek role. 4) Fetch URL dari body user tanpa allowlist/validasi IP. 5) Schema blog punya `.unique()` (constraint) + `uniqueIndex("blog_post_slug_unique")` nama sama → Postgres error `relation already exists` saat CREATE UNIQUE INDEX. 6) Health hanya ping.

| | |
|---|---|
| **File** | `apps/web/src/lib/api.ts`, `apps/web/src/app/api/cron/publish/route.ts`, `apps/web/src/app/api/analytics/sync/route.ts`, `apps/web/src/app/api/inbox/sync/route.ts`, `apps/web/src/app/api/blog/posts/[slug]/route.ts`, `apps/web/src/app/api/admin/blog/posts/*`, `apps/web/src/app/api/stock-media/import/route.ts`, `apps/web/src/lib/seb-advisor.ts`, `apps/web/src/app/api/health/route.ts`, `apps/web/src/app/api/admin/health/route.ts`, `packages/db/src/schema/blog.ts`, `packages/db/src/schema/auth.ts`, `packages/env/src/{server,web}.ts`, `apps/web/next.config.ts`, `apps/web/Dockerfile`, `packages/auth/package.json` |
| **Masalah** | Lihat Gejala |
| **Akar** | Lihat Akar |
| **Fix** | `verifyCronSecret` (timingSafeEqual, fail-closed) dipakai 3 route cron; POST publik blog dihapus; `requireAdmin` baru dipakai admin blog; `stock-media/import` allowlist domain (pixabay/pexels/unsplash); `seb-advisor` `assertPublicResolvedIp` (resolve DNS + blokir IPv4 privat/IPv6-mapped/metadata/ULA); health cek `select 1`; admin health metrik nyata; schema blog buang `.unique()` inline; `organization.createdAt` `.defaultNow()`; `NEXT_PUBLIC_APP_URL` divalidasi + ARG build; `ENCRYPTION_KEY` wajib prod; security headers; `@better-auth/utils@0.4.2` di packages/auth |
| **Verifikasi** | `pnpm -r check-types` hijau (6 paket). Migrasi `0000_low_james_howlett.sql` regenerate: 82 tabel, `blog_post_slug_unique` hanya 1 objek, organization default now ada. Belum di-apply ke DB. |
| **Pelajaran** | Jangan pernah fail-open pada auth (fail-closed selalu); satu kolom unique jangan diwakili `.unique()` + `uniqueIndex` nama sama; fetch URL dari input user wajib allowlist + IP check; `CRON_SECRET`/`ENCRYPTION_KEY` wajib di prod. |
| **Log Keyword** | ssrf, cron, fail-open, requireAdmin, blog slug, migrasi, security headers, better-auth peer, health db |
| **Deploy** | PENDING — belum live |

---

### Fix #1 — Error tipe TS: `twoFactor.enable` di better-auth 1.7.0 (totpURI/backupCodes)
**Gejala:** `pnpm -r check-types` gagal di `apps/web`: `Property 'totpURI' does not exist on type '{ method: "otp" }'` (2 error di `enable-two-factor-flow.tsx`), setelah bump better-auth 1.6.29 → 1.7.0 di lockfile.

**Akar:** better-auth 1.7.0 mengubah return type `authClient.twoFactor.enable()` menjadi discriminated union `{ method: "otp" } | { method: "totp"; totpURI; backupCodes }` (bukan lagi objek dengan totpURI langsung). Bump versi ini juga memunculkan warning peer `@better-auth/utils@0.4.2` vs `0.5.0` (fix #2).

| | |
|---|---|
| **File** | `apps/web/src/components/dashboard/security/enable-two-factor-flow.tsx` |
| **Masalah** | Typecheck merah karena akses `data.totpURI`/`data.backupCodes` di union yang menyertakan cabang `{ method: "otp" }`. |
| **Akar** | Return type `twoFactor.enable` berubah di better-auth 1.7.0 (discriminated union by `method`). |
| **Fix** | Panggil `enable({ password, method: "totp" })` eksplisit + narrow `if (data.method !== "totp") return error` sebelum akses totpURI/backupCodes. |
| **Verifikasi** | `pnpm -r check-types` hijau. |
| **Pelajaran** | Saat bump major library, cek breaking change tipe return API client; narrow discriminated union dengan guard eksplisit. |
| **Log Keyword** | better-auth, 2fa, totp, type error, union |
| **Deploy** | PENDING — belum live |
