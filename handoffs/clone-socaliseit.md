# Clone fitur socaliseit ke Sahabat Kreator
Status: BERJALAN · Service: web/db/payment · Diperbarui: 2026-08-17

## Sedang dikerjakan
Milestone 1 (fondasi): port schema Prisma→Drizzle + perbaiki payment SumoPod.

## Status terakhir
- **Schema Drizzle selesai & typecheck bersih**: 78 tabel, migrasi `0000_init.sql` (74KB) sudah di-generate di `packages/db/src/migrations/`. File baru di `packages/db/src/schema/`: social, post, media, engagement, commerce, analytics, content, seb, settings, payment. `enum.ts` sudah ditambah `META` + `stock_media_source`.
- **payment package selesai**: `sumopod.ts` kini implementasi API SumoPod nyata (POST /api/v1/payments via fetch, webhook verify Svix/X-Webhook-Token, handleWebhook). Billing plan FREE/PRO/BUSINESS/ENTERPRISE/ADMIN sudah ada. Currency diganti IDR. `@sahabat-kreator/db` kini export `schema`.
- **Storage**: user memakai Cloudflare R2 (S3-compatible; `@aws-sdk/client-s3` sudah ada di web + lib/storage.ts lengkap: upload/download/delete/presign/getPublicUrl).
- **Koleksi stock media (M1b)**: selesai — `lib/stock-media.ts` (Pixabay/Pexels/Unsplash search, unified result), API `/api/stock-media/search` + `/api/stock-media/import` (download→R2→insert media+stockMediaImport, dedup per org), komponen `components/media/stock-media-picker.tsx`. Env keys PIXABAY/PEXELS/UNSPLASH ditambahkan ke `packages/env/src/server.ts` + `.env`.
- **Media library (M2)**: selesai — API `/api/media` (GET list w/ filter folder/type/search + POST upload ke R2 + PATCH metadata + DELETE) dan `/api/media/folders` (CRUD folder). Halaman `/dashboard/media` (page.tsx) dengan grid media, sidebar folder, upload multiple, hapus batch, cari, dialog folder baru, integrasi StockMediaPicker. `drizzle-orm` ditambahkan ke deps web.
- **Platform config & OAuth (M2-lanjutan)**: selesai — `lib/platforms/` (config.ts = OAuth URLs/scopes per platform + label/warna; credentials.ts = baca global_platform_credential, META dipakai IG+FB; oauth.ts = getAuthorizationUrl + exchangeCodeForToken + refreshAccessToken untuk FB/IG/Threads/TikTok/Google/Pinterest/LinkedIn; profile.ts = fetch profil per platform; index.ts re-export). `lib/token-encryption.ts` (AES-256-GCM, ENCRYPTION_KEY opsional, fallback derive dari BETTER_AUTH_SECRET). API `/api/accounts` (GET list, POST mulai OAuth dengan state HMAC-signed, DELETE putus) + `/api/accounts/callback/[platform]` (tukar kode→token→simpan/update akun, token di-encrypt). Halaman `/dashboard/settings/connections` (daftar akun, tombol hubungkan/putus, notifikasi hasil callback). Env: META/TIKTOK/YOUTUBE/PINTEREST/LINKEDIN/THREADS/GOOGLE_BUSINESS client ID+secret (opsional, fallback) + ENCRYPTION_KEY.
- **Compose/publishing (M3)**: selesai v1 — `lib/posts-service.ts` (createPosts satu-post-per-akun + linkedGroupId multi-platform, validasi caption/akun/media/waktu; updatePost/deletePost). `lib/publishing/` (types.ts; instagram.ts = publish Feed/Reel/Story via Graph API container flow + poll status; facebook.ts = Page photo post; orchestrator.ts = refresh token otomatis + route per platform; UNSUPPORTED_PLATFORM untuk TikTok/YT/dsb sementara). API `/api/posts` (GET list, POST create) + `/api/posts/[id]/publish` (publish sekarang, simpan publish_error, status PUBLISHING→PUBLISHED/FAILED). Halaman `/dashboard/compose` (pilih akun multi, caption, media dari pustaka/stok, jadwalkan, simpan draft, terbitkan). Nav item "Buat konten" ditambahkan.
- **Instagram dua jalur OAuth (M3)**: `INSTAGRAM` = standalone (app Instagram sendiri, OAuth di `api.instagram.com`, short-lived→long-lived via `graph.instagram.com/access_token` ig_exchange_token, refresh via `ig_refresh_token`, Graph API di `graph.instagram.com/v25.0`). `INSTAGRAM_PAGE` = tertaut FB Page (login Meta via Facebook dialog, profil via `me/accounts` instagram_business_account, publish via `graph.facebook.com/v25.0`). `credentialPlatform`: INSTAGRAM→INSTAGRAM (env `INSTAGRAM_CLIENT_ID/SECRET` baru), INSTAGRAM_PAGE/FACEBOOK→META. Callback sekarang menyimpan `platform` sebenarnya (bukan META — bug lama diperbaiki) & pageAccessToken hanya dipakai utk FACEBOOK/INSTAGRAM_PAGE. Publisher instagram.ts menerima base URL per jenis akun. Env + `.env` ditambah `INSTAGRAM_CLIENT_ID/SECRET`.
- **Publisher lengkap + worker terjadwal (M3)**: `lib/publishing/publish-post.ts` = fungsi bersama publish satu post (validasi→PUBLISHING→publish→PUBLISHED/FAILED + catat publish_error), dipakai route manual & cron. Publisher baru: tiktok.ts (video/photo PULL_FROM_URL + poll status, wajib tiktokPrivacyLevel), youtube.ts (upload resumable dari R2, Shorts bila postType=reel, thumbnail non-fatal), pinterest.ts (pin/carousel image_url, video via /media, wajib boardId), linkedin.ts (versioned Posts API /rest/posts, init upload gambar/video + PUT binary, article via content.article), threads.ts (container flow text/image/video/carousel). Orchestrator sudah route semua platform; YT/GMB/Bluesky → UNSUPPORTED_PLATFORM. API `/api/posts/[id]` (GET/PATCH/DELETE) + halaman `/dashboard/posts` (list, filter status, terbitkan, hapus) + nav item. Worker terjadwal `/api/cron/publish` (guard Bearer CRON_SECRET, claim atomik SCHEDULED→PUBLISHING anti double-publish, batch 50). Env `CRON_SECRET` ditambah.
- **Logo**: `apps/web/public/logo-sahabat-kreator.png` dipakai di auth layout, onboarding, dashboard sidebar, favicon (regenerated dari logo). Komponen reusable `components/ui/logo.tsx`.
- Semua `pnpm -r check-types` hijau (5 paket).

## Keputusan penting
- Org boleh connect banyak akun per platform (2 FB, 3 IG, dst): unique = `(org, platform, platformId)`, bukan `(org, platform)`.
- Konstrain auth tetap better-auth (org/admin/2FA + drizzle adapter) — TIDAK diganti NextAuth seperti socaliseit.
- Stock media: server-side proxy (API key tidak pernah ke client). Import menyimpan ke R2 + dedup `(org, source, sourceId)`.
- `lib/api.ts` = helper `requireAuth`/`withAuth`/`json` untuk semua route handler baru.
- Media disimpan di R2 dengan key `orgs/{orgId}/media/{uuid}.{ext}`; URL publik dari `getPublicUrl`. Video tidak di-transcode (tanpa ffmpeg) — transcodeStatus null.
- Token sosial di-encrypt AES-256-GCM sebelum disimpan; kunci dari ENCRYPTION_KEY atau derive SHA-256 BETTER_AUTH_SECRET.
- Kredensial OAuth = global (super admin) di `global_platform_credential`, IG & FB share kredensial META. Env vars jadi fallback.
- State OAuth HMAC-signed (15 menit), callback wajib user terautentikasi via better-auth.
- Arsitektur post: satu Post per akun platform, multi-platform dikelompokkan via `linkedGroupId` (mengikuti socaliseit).
- Publisher saat ini mendukung IG (Feed/Reel/Story), FB (Page), TikTok, YouTube, Pinterest, LinkedIn, Threads. GOOGLE_BUSINESS & BLUESKY & META → UNSUPPORTED_PLATFORM.
- Auto-publish terjadwal jalan via `/api/cron/publish` yang dipanggil scheduler eksternal dengan Bearer CRON_SECRET; claim atomik SCHEDULED→PUBLISHING mencegah double-publish antar runner.

## Langkah berikutnya
1. Jalankan migrasi ke DB lokal (`pnpm db:migrate`) bila DB tersedia — verifikasi 78 tabel benar.
2. Isi kredensial OAuth global via admin panel (M9) atau langsung di DB — supaya tombol Hubungkan berfungsi.
3. Schedule cron ke endpoint `/api/cron/publish` (Vercel Cron / GitHub Actions / server cron) dengan header `Authorization: Bearer $CRON_SECRET`.
4. M4+: calendar, analytics, inbox, AI, billing UI, admin, ekstra (lihat todo sesi).

## Jangan lakukan
- Jangan meng-copy auth socaliseit (Prisma/NextAuth) — sudah beda stack.
- Jangan menyalin stripe.ts/stripe-config.ts dari socaliseit — payment wajib SumoPod.
- Jangan gunakan S3 biasa tanpa penyesuaian R2 endpoint (R2 = S3-compatible tapi endpoint beda).
- Jangan tambah ffmpeg/transcoding video dulu — belum dibutuhkan, hanya menambah kompleksitas.
- Jangan simpan token sosial plaintext — wajib lewat encryptToken().
- Jangan samakan kedua Instagram: INSTAGRAM (standalone, graph.instagram.com, env INSTAGRAM_*) ≠ INSTAGRAM_PAGE (tertaut FB Page, graph.facebook.com, env META_*). credentialPlatform & getAuthorizationUrl sudah memetakannya terpisah.
- Jangan pakai scopes legacy (instagram_business_*) — sudah pakai instagram_* untuk Facebook Login for Business.
- Jangan lupa: post yang autoPublish tanpa scheduledAt = status sementara SCHEDULED lalu publishNow harus segera mengeksekusi — saat ini belum ada worker, jadi autoPublish langsung belum jalan end-to-end.