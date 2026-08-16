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
- **Logo**: `apps/web/public/logo-sahabat-kreator.png` dipakai di auth layout, onboarding, dashboard sidebar, favicon (regenerated dari logo). Komponen reusable `components/ui/logo.tsx`.
- Semua `pnpm -r check-types` hijau (5 paket).

## Keputusan penting
- Org boleh connect banyak akun per platform (2 FB, 3 IG, dst): unique = `(org, platform, platformId)`, bukan `(org, platform)`.
- Konstrain auth tetap better-auth (org/admin/2FA + drizzle adapter) — TIDAK diganti NextAuth seperti socaliseit.
- Stock media: server-side proxy (API key tidak pernah ke client). Import menyimpan ke R2 + dedup `(org, source, sourceId)`.
- `lib/api.ts` = helper `requireAuth`/`withAuth`/`json` untuk semua route handler baru.
- Media disimpan di R2 dengan key `orgs/{orgId}/media/{uuid}.{ext}`; URL publik dari `getPublicUrl`. Video tidak di-transcode (tanpa ffmpeg) — transcodeStatus null.

## Langkah berikutnya
1. Jalankan migrasi ke DB lokal (`pnpm db:migrate`) bila DB tersedia — verifikasi 78 tabel benar.
2. M2-lanjutan: platform config & OAuth (connect akun sosial), lalu modul compose/publishing.
3. M3+: compose/publishing, calendar, analytics, inbox, AI, billing UI, admin, ekstra (lihat todo sesi).

## Jangan lakukan
- Jangan meng-copy auth socaliseit (Prisma/NextAuth) — sudah beda stack.
- Jangan menyalin stripe.ts/stripe-config.ts dari socaliseit — payment wajib SumoPod.
- Jangan gunakan S3 biasa tanpa penyesuaian R2 endpoint (R2 = S3-compatible tapi endpoint beda).
- Jangan tambah ffmpeg/transcoding video dulu — belum dibutuhkan, hanya menambah kompleksitas.