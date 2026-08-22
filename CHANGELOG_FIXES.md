# CHANGELOG FIXES — Sahabat Kreator

Riwayat perbaikan bug. Terbaru → terlama. Hanya entri yang sudah terverifikasi (`PENDING` kalau masih dugaan).

---

### Fix #32 — YouTube "Gagal mengambil profil platform" saat OAuth callback
**Gejala:** Setelah selesai OAuth YouTube, tampilan erroret("Gagal mengambil profil platform.") di halaman connections.

**Akar:** `fetchYouTubeChannel()` di `profile.ts` memanggil YouTube Data API v3 dengan header `Authorization: Bearer <token>` saja. Beberapa konfigurasi kredensial Google API (mis. service account / web app client) memerlukan access_token juga sebagai query parameter agar endpoint `channels?mine=true` merespons dengan data channel. Tanpa query param, API bisa mengembalikan 401/403 atau items kosong, sehingga fungsi return `null` dan callback menampilkan error.

**Fix:** Tambahkan `access_token=<token>` sebagai query parameter pada request ke `https://www.googleapis.com/youtube/v3/channels`. Error response sekarang di-log ke console untuk debugging. Fungsi `fetchYouTubeMetrics()` di `analytics/metrics.ts` juga diperbaiki dengan pola yang sama.

| | |
|---|---|
| **File** | `apps/web/src/lib/platforms/profile.ts`, `apps/web/src/lib/analytics/metrics.ts` |
| **Masalah** | OAuth callback YouTube gagal ambil profil → error "Gagal mengambil profil platform" |
| **Akar** | YouTube Data API v3 kadang tolak Bearer-only, perlu access_token query param |
| **Fix** | Tambah `access_token=` query param; tambahkan error logging |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` lolos. **PENDING verifikasi live** — OAuth YouTube harus berhasil simpan akun tanpa error profil. |
| **Pelajaran** | Google API v3 memiliki inkonsistensi autentikasi antar endpoint; beberapa endpoint menerima Bearer header, beberapa memerlukan query param. Untuk endpoint `?mine=true`, pastikan access_token tersedia. |
| **Log Keyword** | youtube, profile, oauth, fetchYouTubeChannel, access_token, query param, google api |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #31 — "Pilih workspace dulu." setelah login tanpa org switcher
**Gejala:** Setelah login (email/password), semua API route mengembalikan `{ error: "Pilih workspace dulu." }` (HTTP 400). User harus klik org switcher lalu memilih workspace secara manual agar dashboard normal kembali. Setelah pilih manual + refresh, error hilang.

**Akar:** `requireAuth()` di `api.ts` membaca `session.session.activeOrganizationId` secara langsung tanpa fallback. Setelah login email/password, sesi baru belum memiliki `activeOrganizationId` yang tersimpan (client-side belum panggil `organization.setActive`). Sementara itu, `dashboard/layout.tsx:15` sudah punya fallback `?? organizations[0]?.id`, jadi halaman render normal, tapi API route tetap gagal karena `requireAuth()` tidak punya fallback yang sama.

**Fix:** `requireAuth()` sekarang mengambil organisasi pertama user sebagai fallback bila `session.session.activeOrganizationId` kosong, menyamakan perilaku dengan `dashboard/layout.tsx`.

| | |
|---|---|
| **File** | `apps/web/src/lib/api.ts` |
| **Masalah** | Semua API route mengembalikan 400 "Pilih workspace dulu." setelah login |
| **Akar** | `requireAuth()` tidak memiliki fallback aktifOrganizationId; beda dengan dashboard layout |
| **Fix** | Tambah fallback `auth.api.listOrganizations().at(0)?.id` saat activeOrganizationId kosong |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` ✅. **PENDING verifikasi live** — login email/password harus langsung akses dashboard tanpa perlu klik org switcher dulu. |
| **Pelajaran** | Selalu sinkronkan fallback logic antara client-side layout dan server-side API helper; perbedaan kecil menyebabkan inconsistency yang terlihat saat login. |
| **Log Keyword** | workspace, pilih workspace dulu, activeOrganizationId, requireAuth, login, fallback, org switcher |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #30 — Bahasa Mandarin di /listening + status token misleading + tombol hubungkan ulang + 502/503 SEB
**Gejala:** (1) Halaman `/listening` masih berbahasa Mandarin ("新增監控", "監控中", "載入中", dll). (2) Konsol error `502 ()` & `503 ()` saat memakai Seb. (3) TikTok tampil "Token hampir kedaluwarsa (0 hari)" tapi klik "Perbarui" menjawab "Token masih valid" — kontradiktif. (4) Threads "Token kedaluwarsa — hubungkan ulang" TANPA tombol hubungkan ulang. (5) YouTube "Token berhasil diperbarui" tapi status tetap "Token hampir kedaluwarsa (0 hari)".

**Akar:**
1. UI listening pernah ditulis bahasa Mandarin dan belum diterjemahkan penuh.
2. Route Seb (report/chat/brand-knowledge) mengembalikan `502` untuk semua error non-konfigurasi (termasuk OpenRouter request failed), sehingga console penuh error 502/503 tanpa pesan berguna.
3. Helper refresh (`token-refresh.ts`) untuk platform NON-Meta hanya me-refresh saat token SUDAH expired. Tombol "Perbarui" muncul saat tone `warn` (< 7 hari) tapi helper menolak karena belum expired → jawaban "masih valid".
4. Halaman connections hanya punya tombol "Perbarui" & "Putus"; akun yang refresh-nya gagal total tidak punya jalur OAuth ulang.
5. `tokenStatus()` menghitung berdasarkan `tokenExpiry` untuk SEMUA platform — padahal YouTube/TikTok punya access token berumur pendek + refresh token (auto). Setelah refresh, expiry masih < 7 hari → selalu "hampir kedaluwarsa".

**Fix:**
1. Terjemahkan semua teks Mandarin di `/listening` → Bahasa Indonesia.
2. Route Seb: error OpenRouter (belum dikonfigurasi / request failed) → `400` + pesan asli; error lain → `500`. Tidak lagi 502/503.
3. `refreshAccountTokenIfNeeded(account, { force })` — tombol "Perbarui" memanggil POST refresh dengan `force: true`.
4. Halaman connections: akun `expired`/`lastRefreshError` → tombol **"Hubungkan ulang"** (OAuth ulang); akun `warn`/`none` → tombol "Perbarui". Ringkasan "Akun perlu perhatian" ikut konsisten.
5. `tokenStatus(account)` kini tahu platform ber-refresh token (`YOUTUBE`/`GOOGLE_BUSINESS`/`TIKTOK`/`PINTEREST`/`LINKEDIN`): bila ada refreshToken & tanpa error → "Token aktif (refresh otomatis)" (ok), tak peduli expiry access token yang pendek. GET `/api/accounts` kini mengirim `hasRefreshToken`.

| | |
|---|---|
| **File** | `apps/web/src/app/dashboard/listening/page.tsx`, `apps/web/src/app/dashboard/connections/page.tsx`, `apps/web/src/app/api/accounts/route.ts`, `apps/web/src/app/api/accounts/refresh/route.ts`, `apps/web/src/lib/platforms/token-refresh.ts`, `apps/web/src/app/api/seb/{report,chat,brand-knowledge}/route.ts` |
| **Masalah** | Teks Mandarin; 502/503 Seb; refresh token kontradiktif; tak ada tombol hubungkan ulang; status token misleading untuk platform access-token pendek |
| **Akar** | UI terjemahan tidak tuntas; route Seb memetakan semua error → 502; helper refresh non-Meta hanya saat expired; UI tak punya jalur OAuth ulang; tokenStatus abai keberadaan refresh token |
| **Fix** | Terjemahkan UI; route Seb → 400/500 + pesan jelas; `force` refresh untuk tombol manual; tombol "Hubungkan ulang"; tokenStatus sadar refresh token (`hasRefreshToken`) |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` + `pnpm --filter db check-types` lolos. **PENDING verifikasi live** — TikTok: klik Perbarui harus benar-benar refresh; Threads expired: muncul tombol "Hubungkan ulang"; YouTube: tampil "Token aktif (refresh otomatis)"; /listening tanpa Mandarin; Seb tidak lagi 502/503. |
| **Pelajaran** | Jangan asumsikan semua platform pakai long-lived token — platform OAuth dengan refresh token (YouTube 1 jam, TikTok) punya access token pendek secara desain; status token harus bedakan ada-tidaknya refresh token. Error provider (OpenRouter) bukan 502 (bad gateway) — kembalikan 4xx + pesan asli agar UI bisa menampilkan. |
| **Log Keyword** | listening, mandarin, 502, 503, seb, openrouter, token, refresh, force, hubungkan ulang, hasRefreshToken, youtube, tiktok, threads |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #29 — Input di Dialog cuma bisa ketik 1 huruf (focus dicuri tiap re-render)
**Gejala:** Form "Pilar baru" dan "Koleksi hashtag baru" di `/content-tools` hanya menerima 1 huruf per ketikan; setelah huruf pertama, input kehilangan fokus sehingga ketikan berikutnya tidak masuk.

**Akar:** `Dialog` (`apps/web/src/components/ui/dialog.tsx`) punya `useEffect` dengan dependency `[open, onClose]`. Semua pemanggil meneruskan `onClose` sebagai arrow inline (`() => setPillarOpen(false)`) → referensi baru tiap render. Setiap ketikan memicu re-render → effect di-cleanup lalu di-jalankan ulang → `ref.current?.focus()` di-eksekusi → fokus ditarik dari input ke kontainer dialog setelah huruf pertama. Berdampak ke SEMUA dialog yang memakai komponen `Dialog` (content-tools, stock-media-picker, team, dst.).

| | |
|---|---|
| **File** | `apps/web/src/components/ui/dialog.tsx` |
| **Masalah** | 1 huruf per ketikan di dialog dengan input teks |
| **Akar** | Effect dialog dependen pada `onClose` yang berubah tiap render (arrow inline) → re-focus tiap re-render mencuri fokus dari input |
| **Fix** | Simpan `onClose` ke ref (`onCloseRef`, diperbarui tiap render); effect hanya dependen `[open]`, handler Escape memakai `onCloseRef.current`. Fokus hanya ditarik saat dialog terbuka, bukan tiap re-render. |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` lolos. **PENDING verifikasi live** — ketik di dialog pilar/koleksi hashtag harusnya mengalir normal (multi-huruf). |
| **Pelajaran** | Jangan taruh callback inline di dependency array `useEffect` tanpa stabilisasi (useCallback/ref) — kalau effect-nya punya efek samping (focus, fetch), tiap re-render akan me-refresh side-effect tersebut. |
| **Log Keyword** | dialog, input, focus, 1 huruf, content-tools, useCallback, ref, typing |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #28 — Konsolidasi kelola akun: tab settings, sidebar "Akun", dan /settings/connections → satu halaman /connections
**Permintaan:** Kelola akun saat ini tersebar di 3 tempat: tab "Akun Terhubung" di `/dashboard/settings`, grup "Akun" di sidebar (menampilkan daftar akun), dan halaman `/settings/connections`. Dengan banyak akun, daftar di sidebar bikin scroll panjang. Disatukan menjadi **satu halaman `/connections`**.

**Perubahan:**
- Halaman `apps/web/src/app/dashboard/settings/connections/page.tsx` dipindah → `apps/web/src/app/dashboard/connections/page.tsx` (URL `/connections` via rewrite).
- `next.config.ts`: +rewrite `/connections` → `/dashboard/connections`.
- `nav-config.tsx`: +item "Koneksi akun" (`/connections`, icon Link2) di grup **workspace**.
- `sidebar.tsx`: hapus `<AccountSidebar/>` (grup "Akun").
- `dashboard/settings/page.tsx`: hapus tab "accounts" + import `ConnectedAccountsSettings`.
- `dashboard/settings/layout.tsx`: hapus link "Koneksi akun".
- Hapus file `account-sidebar.tsx` & `connected-accounts.tsx` (tak terpakai).
- `compose/page.tsx` & callback OAuth: link/redirect `/settings/connections` → `/connections`.

| | |
|---|---|
| **File** | `apps/web/src/app/dashboard/connections/page.tsx` (dipindah dari settings/connections), `apps/web/next.config.ts`, `apps/web/src/lib/nav-config.tsx`, `apps/web/src/components/dashboard/sidebar.tsx`, `apps/web/src/app/dashboard/settings/{page,layout}.tsx`, `apps/web/src/app/dashboard/compose/page.tsx`, `apps/web/src/app/api/accounts/callback/[platform]/route.ts`; hapus `account-sidebar.tsx`, `connected-accounts.tsx` |
| **Masalah** | 3 tempat kelola akun; sidebar panjang bila akun banyak |
| **Akar** | Duplikasi UI kelola akun |
| **Fix** | Satu halaman `/connections`; sidebar hanya link "Koneksi akun" di grup Workspace |
| **Verifikasi** | `next typegen` + `pnpm --filter web exec tsc --noEmit` lolos. **PENDING deploy** — rebuild web, uji `/connections` (list + dialog pilih halaman FB/IG + tambah akun). |
| **Pelajaran** | Konsolidasikan entry point kelola akun jadi satu halaman; sidebar cukup link, jangan tampilkan daftar penuh (bisa panjang). |
| **Log Keyword** | connections, akun, sidebar, settings, konsolidasi, rewrite, nav |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #27 — Sidebar nav dikelompokkan per fungsi + akun terhubung tampil di sidebar (avatar riil)
**Gejala/permintaan:** (1) Tab "Akun Terhubung" di `/dashboard/settings` menampilkan avatar **placeholder** (inisial platform, `acc.platform.slice(0,2)`) padahal data avatar riil sudah ada di `/api/accounts`. (2) Sidebar nav hanya punya 2 grup longgar ("Konten"/"Pengaturan") — item tidak dikelompokkan berdasarkan fungsi. (3) User ingin daftar akun terhubung tampil langsung di sidebar agar akses cepat.

**Akar:**
1. `connected-accounts.tsx` tidak memakai `acc.avatar` — selalu inisial 2 huruf platform.
2. `nav-config.tsx` memakai `group: "content" | "team"` — kategori terlalu lebar; `sidebar.tsx` hardcode 2 grup.

| | |
|---|---|
| **File** | `apps/web/src/lib/nav-config.tsx` (`NavGroup` baru: overview/content/inbox/insight/workspace + `navGroups[]` dengan label fungsi; item dipetakan ulang), `apps/web/src/components/dashboard/sidebar.tsx` (render per-grup dinamis dari `navGroups`), `apps/web/src/components/dashboard/account-sidebar.tsx` (**baru**: daftar akun terhubung dgn avatar riil dari `/api/accounts` + link Kelola/Tambah ke `/settings/connections`), `apps/web/src/components/settings/connected-accounts.tsx` (avatar riil `acc.avatar`, fallback inisial nama) |
| **Masalah** | Avatar placeholder; sidebar tidak terkelompok per fungsi; akun tak terlihat di sidebar |
| **Akar** | `connected-accounts.tsx` abaikan avatar; `NavGroup` hanya 2 nilai; sidebar hardcode grup |
| **Fix** | Avatar riil + fallback; 5 grup fungsi (Ringkasan/Konten/Inbox/Analitik & Riset/Workspace); `AccountSidebar` di sidebar antara Konten & Analitik; komponen settings pakai avatar |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` lolos. **PENDING deploy** — rebuild web, cek sidebar grup + avatar akun. |
| **Pelajaran** | Sidebar nav lebih mudah dirawat bila grouping data-driven (`navGroups[]`); jangan hardcode grup di komponen. Avatar akun: selalu pakai `avatar` dari `/api/accounts`. |
| **Log Keyword** | sidebar, nav, group, fungsi, akun terhubung, avatar, connected accounts, nav-config |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #26 — Halaman /dashboard/billing tidak menampilkan hasil redirect pembayaran SumoPod (?status=)
**Gejala:** Setelah checkout SumoPod selesai, user di-redirect kembali ke `/dashboard/billing?status=success` (atau `?status=cancelled`), tapi halaman tidak menampilkan konfirmasi apa pun — seolah-olah tidak terjadi apa-apa.

**Akar:** `apps/web/src/app/api/billing/route.ts:122-123` sudah meng-`override` `success_return_url`/`cancel_return_url` ke `/dashboard/billing?status=success|cancelled`, tetapi halaman billing tidak membaca query `status`.

| | |
|---|---|
| **File** | `apps/web/src/app/dashboard/billing/page.tsx` (baca `useSearchParams().get("status")` → banner sukses/batal) |
| **Masalah** | Tidak ada feedback setelah redirect pembayaran |
| **Akar** | Halaman tidak memproses query `?status=` |
| **Fix** | Banner hijau "Pembayaran berhasil" / amber "Pembayaran dibatalkan" saat `status=success`/`cancelled` |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` lolos. **PENDING deploy** — rebuild web di VPS, lalu uji checkout → bayar/batal → cek banner muncul. |
| **Pelajaran** | Saat menyetel redirect URL payment, pastikan halaman tujuan benar-benar membaca query/param-nya. |
| **Log Keyword** | sumopod, payment, billing, redirect, success, cancelled, return url, banner |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #25 — Google Console: nama app tidak terlihat di home; delete media tak hapus transcode; avatar FB page hilang; SW/icons/CSP
**Gejala:**
1. **Google OAuth consent verification** menolak: (a) "Your home page does not explain the purpose of your app", (b) "The app name 'Sahabat Kreator' ... does not match the app name on your home page".
2. **Delete galeri/media** kadang "gagal" — file hasil transcode video (`transcodedUrl`) & thumbnail tidak pernah dihapus dari R2, dan UI tak menampilkan pesan error.
3. **Avatar Facebook page** tidak tersimpan setelah connect (avatar kosong).
4. **Konsol browser**: CSP memblokir `static.cloudflareinsights.com/beacon.min.js`; `apple-mobile-web-app-capable` deprecated; `sw.js` install gagal (`Cache.addAll` Request failed); manifest shortcuts menunjuk `/icons/*` yang tidak ada (file asli di `/favicon/`).

**Akar:**
1. Hero home page tidak menyebut nama "Sahabat Kreator" (hanya badge "Platform Manajemen Media Sosial"); metadata OG/app name kurang.
2. `DELETE /api/media` hanya menghapus `url` (satu key), tidak `thumbnailUrl`/`transcodedUrl`; UI `handleDelete` tanpa feedback error.
3. Alur pending (Fix #22) tidak menyertakan avatar FB page — `fetchPageChoices` tidak minta `picture{url}`; `PageChoice.pagePicture` null → avatar null.
4. Semua aset ikon ada di `/favicon/` tapi `sw.js` (precache + push + isImmutableAsset), `manifest.json` (shortcuts), dan `seo.ts` (icons) memakai `/icons/*` yang tidak ada → `addAll` gagal; CSP tidak allow Cloudflare beacon; layout pakai tag deprecated.

| | |
|---|---|
| **File** | `apps/web/src/app/(marketing)/page.tsx` (H1 hero + subtext sebut "Sahabat Kreator"; metadata `applicationName` + openGraph siteName/title/url), `apps/web/src/app/api/media/route.ts` (DELETE hapus url+thumbnail+transcoded; `keyFromUrl` +decodeURIComponent), `apps/web/src/app/dashboard/media/page.tsx` (+state `actionError` + feedback), `apps/web/src/lib/platforms/profile.ts` (`fetchPageChoices` +`picture{url}` → `PageChoice.pagePicture`), `apps/web/src/app/api/accounts/pending/[id]/route.ts` (FACEBOOK simpan `pagePicture`; GET list sertakan avatar), `apps/web/public/sw.js` (precache/push/isImmutableAsset `/icons/`→`/favicon/`), `apps/web/public/manifest.json` (shortcuts icons path), `apps/web/src/lib/seo.ts` (icons `/icons/`→`/favicon/`), `apps/web/next.config.ts` (CSP `script-src` +`https://static.cloudflareinsights.com`), `apps/web/src/app/layout.tsx` (`apple-mobile-web-app-capable`→`mobile-web-app-capable`) |
| **Masalah** | Verifikasi Google menolak; delete media tak bersih; avatar FB hilang; SW install gagal + warning konsol |
| **Akar** | Hero tanpa nama app; delete hanya 1 key + tanpa error UI; pending tidak ambil picture; path ikon salah `/icons/` vs `/favicon/`; CSP kurang allow; tag deprecated |
| **Fix** | Home + metadata sebut nama & tujuan; DELETE hapus semua file R2 milik media + feedback error; avatar page diambil dari `picture{url}`; semua path ikon/manifest/SEO konsisten `/favicon/`; CSP +cloudflare beacon; meta mobile-web-app-capable |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` lolos. **PENDING deploy** — perlu rebuild web di VPS. Setelah deploy: cek konsol browser (SW install bersih, no CSP block), connect FB page → avatar tampil, hapus video → file transcode hilang dari R2, submit ulang verifikasi Google (home page + nama app). |
| **Pelajaran** | Google OAuth verification butuh nama app & tujuan EKSPLISIT di home page (hero). SW precache `addAll` gagal total bila satu path salah — pastikan path aset sesuai struktur public/. Simpan nama path ikon konsisten (pilih satu: `/favicon/`). Hapus semua artefak R2 (thumbnail/transcode) saat media dihapus. |
| **Log Keyword** | google console, oauth consent, app name, home page, delete media, r2, transcode, avatar, facebook page, service worker, precache, manifest, icons, csp, cloudflare beacon, apple-mobile-web-app-capable |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #24 — Dukungan Pinterest Trial access / Sandbox (api-sandbox.pinterest.com)
**Gejala:** Pinterest API selalu dipanggil ke production (`api.pinterest.com/v5`) — tidak ada cara menguji dengan **Trial access** yang menyediakan **Sandbox environment** (`api-sandbox.pinterest.com`) untuk meng-explore API tanpa menyentuh data produksi.

**Akar:** Base URL Pinterest di-*hardcode* di 4 tempat (`config.ts` tokenUrl/apiBase, `oauth.ts` exchange/refresh, `profile.ts` user_account, `publishing/pinterest.ts` pins/media) — semuanya production.

**Dokumentasi resmi (dari docs Pinterest, agt 2026):** Trial access → semua Pins & Boards dibuat hanya visible to creator (Sandbox entity); rate limit harian per-app; sandbox memakai subdomain `api-sandbox.` pada token & semua endpoint data (OAuth authorize tetap `www.pinterest.com/oauth/`); token sandbox terpisah dari production (tak bisa ditukar); **video Pin tidak didukung di Sandbox**; untuk produksi hapus `-sandbox` dan pakai token produksi.

| | |
|---|---|
| **File** | `packages/env/src/server.ts` (+`PINTEREST_SANDBOX` enum true/false default false), `apps/web/src/lib/platforms/pinterest-config.ts` (**baru**: `PINTEREST_IS_SANDBOX`, `PINTEREST_API_BASE`, `PINTEREST_TOKEN_URL`), `apps/web/src/lib/platforms/oauth.ts` (exchange/refresh pakai `PINTEREST_TOKEN_URL`), `apps/web/src/lib/platforms/profile.ts` (user_account pakai `PINTEREST_API_BASE`), `apps/web/src/lib/publishing/pinterest.ts` (pins/media pakai `PINTEREST_API_BASE`; **video ditolak saat sandbox** → error `SANDBOX_NO_VIDEO`), `.env.example` (+blok Pinterest sandbox) |
| **Masalah** | Tidak ada cara pakai Trial access / Sandbox Pinterest |
| **Akar** | Base URL Pinterest hardcode production di 4 file |
| **Fix** | Env `PINTEREST_SANDBOX` mengarahkan semua panggilan API (token+data) ke `api-sandbox.pinterest.com/v5`; video Pin diblokir eksplisit saat sandbox (sesuai batasan resmi); dokumentasi di `.env.example` |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` & `pnpm --filter @sahabat-kreator/env check-types` lolos. **PENDING deploy** — perlu set `PINTEREST_SANDBOX=true` di env saat ingin uji trial, lalu uji connect + publish Pin. |
| **Pelajaran** | Platform yang punya sandbox environment (Pinterest api-sandbox) butuh base URL yang bisa di-toggle per-env; jangan hardcode host API di banyak file — pusatkan di satu helper (`pinterest-config.ts`). Token environment sandbox tidak pernah boleh dicampur ke production. |
| **Log Keyword** | pinterest, sandbox, trial access, api-sandbox, video pin, base url, oauth token |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #23 — Koneksi akun sosial hanya mendukung 1 akun per platform di halaman connections
**Gejala:** Di `/settings/connections`, begitu satu akun dari suatu platform terhubung (mis. 1 Instagram), tombol "Hubungkan" berubah jadi status "Terhubung" dan tidak bisa menambah akun kedua (mis. 2 Instagram, 3 Threads).

**Akar:** `connections/page.tsx` memakai `connected = new Set(accounts.map(a => a.platform))` lalu mengganti tombol dengan label statis "Terhubung" — secara implisit membatasi satu akun per platform di UI. Backend sebenarnya sudah mendukung multi-akun: `social_account` unik per `(org, platform, platformId)`, `createPosts` menerima `platformAccountIds[]` (1 post per akun), halaman `/dashboard/accounts` & komponen settings sudah punya tombol "Tambah Akun".

| | |
|---|---|
| **File** | `apps/web/src/app/dashboard/settings/connections/page.tsx` (tombol selalu "Hubungkan"/"Tambah akun" + tampilkan jumlah akun per platform `countByPlatform`) |
| **Masalah** | Tidak bisa menambah akun ke-2/ke-3 dari platform yang sama di halaman connections |
| **Akar** | UI membatasi 1 akun per platform via `Set(platform)`; backend sudah multi-akun |
| **Fix** | Selalu tampilkan tombol aksi per platform (label "Hubungkan" bila 0 akun, "Tambah akun" bila ≥1) + indikator jumlah akun; arahkan ke `/dashboard/accounts` sebagai pengingat bahwa kelola akun penuh ada di sana |
| **Verifikasi** | `pnpm --filter web exec tsc --noEmit` lolos. **PENDING deploy** — perlu rebuild web. Belum diuji dengan 2 akun Instagram nyata (butuh login Instagram berbeda). |
| **Pelajaran** | Jangan simpan asumsi "1 akun per platform" di UI hanya karena data per platform; backend sudah per-akun (platformId unik). |
| **Log Keyword** | multi account, multiple accounts, connections, social account, platform, tambah akun |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #22 — OAuth Instagram: scope standalone salah + koneksi Facebook/Instagram-Page auto-ambil halaman pertama
**Gejala:**
1. Hubungkan **Instagram (standalone)** → redirect ke halaman error Instagram: `Invalid Request: Request parameters are invalid: Invalid platform app`.
2. Hubungkan **Facebook Page** atau **Instagram (via Page)** → langsung menghubungkan **halaman pertama** dari `me/accounts` tanpa dialog pilihan — user tidak bisa memilih halaman mana yang dihubungkan.

**Akar:**
1. Scope `INSTAGRAM` standalone di `config.ts` memakai scope **Instagram Graph API** (`instagram_graph_api`, `instagram_content_publish`, dst.) yang seharusnya dipakai lewat **Facebook Login**. Endpoint standalone `api.instagram.com/oauth/authorize` (Instagram API with Instagram Login — rebrand dari Basic Display, tidak deprecated) menolak kombinasi itu → "Invalid platform app". Terbukti dengan tes langsung: scope lama → error; tanpa scope → login OK.
2. `fetchPlatformProfile` untuk `FACEBOOK`/`INSTAGRAM_PAGE` memakai `data.data?.[0]` / `.find(...)` → halaman pertama selalu terpilih. Tidak ada mekanisme memilih halaman.

| | |
|---|---|
| **File** | `apps/web/src/lib/platforms/config.ts` (scope standalone IG → `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_insights`, `instagram_business_manage_messages`), `apps/web/src/lib/platforms/profile.ts` (+`fetchPageChoices` & `PageChoice`), `apps/web/src/app/api/accounts/callback/[platform]/route.ts` (FACEBOOK/INSTAGRAM_PAGE → simpan sesi pending + redirect `?pending=<id>`; platform lain alur lama; hapus `effectiveToken` yang kini tak terpakai), `apps/web/src/app/api/accounts/pending/[id]/route.ts` (**baru**: GET daftar halaman/IG business, POST pilih halaman → simpan akun + hapus sesi), `packages/db/src/schema/social.ts` (+`pendingOauthSession`, expires 10 menit), migrasi `0001_hesitant_spectrum.sql`, `apps/web/src/app/dashboard/settings/connections/page.tsx` (+dialog pilih halaman saat `?pending=`) |
| **Masalah** | IG standalone gagal "Invalid platform app"; FB/IG-Page tidak ada dialog pilih halaman |
| **Akar** | Scope standalone salah (pakai scope Graph API via FB Login); profil auto-ambil halaman pertama |
| **Fix** | Scope standalone diperbaiki ke scope Instagram API with Instagram Login; alur FACEBOOK/INSTAGRAM_PAGE kini 2 langkah: OAuth → simpan token sementara → dialog pilih halaman → simpan akun dgn page access token |
| **Verifikasi** | Tes langsung OAuth authorize: scope baru → **halaman login Instagram OK** (sebelumnya error). `pnpm --filter web exec tsc --noEmit` lolos. Migrasi `0001` belum di-apply. **PENDING deploy** — perlu `db:migrate` di Neon+VPS lalu rebuild web, uji connect FB Page (dialog) & IG standalone. |
| **Pelajaran** | Scope Instagram standalone vs via-Page itu beda set — jangan pakai scope Graph API (FB Login) di endpoint `api.instagram.com/oauth/authorize`. Untuk platform yang punya banyak target (FB Page, IG via Page), jangan auto-pick pertama — sediakan sesi pending + dialog pilih. |
| **Log Keyword** | instagram, oauth, standalone, instagram api with instagram login, basic display, scope, invalid platform app, facebook page, page picker, pending session, me/accounts |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #21 — Area admin: billing mock, nav blog hilang, dropdown tertutup, Overview selalu aktif, platform tanpa callback URL, SumoPod tanpa UI
**Gejala:** 7 temuan di `/admin`:
1. `/admin/billing` menampilkan angka statis (Rp 15.000.000 / 45 sub) — data palsu, bukan dari DB.
2. Editor blog (`/admin/blog`, `/admin/blog/new`, `/admin/blog/[id]`) sudah ada tapi tak ada menu di sidebar admin → tidak bisa ditemukan.
3. Daftar platform di `/admin/platforms` tampil 8 (IG, Meta, TikTok, YouTube, Pinterest, Google Business, LinkedIn, Threads) — perlu dipastikan tak ada yang terlewat & tak ada petunjuk callback/webhook URL untuk developer portal.
4. Dropdown action di `/admin/users` terpotong (tombol menu aksi user) — item terbawah tak terlihat.
5. Nav "Overview" di sidebar admin selalu menyala di semua sub-route `/admin/*`.
6. **Konfigurasi SumoPod Pay (`global_integration_settings`) tidak punya UI admin sama sekali** — hanya bisa diisi manual via DB.
7. (Bonus) halaman blog publik `/blog/[slug]` memakai `sahabatkreator.id` hardcode di preview slug editor.

**Akar:**
1. `apps/web/src/app/api/admin/billing/stats/route.ts` mengembalikan literal hardcoded — tak pernah query `payment`/`subscription`.
2. `adminNavItems` di `admin-sidebar.tsx` tidak punya entri Blog.
3. List kredensial benar (FACEBOOK & INSTAGRAM_PAGE memang pakai kredensial META via `credentialPlatform`; BLUESKY tidak punya OAuth client id/secret — memakai app password), tapi UI tak menampilkan callback URL (`/api/accounts/callback/<platform>`) & webhook URL yang harus didaftarkan.
4. Wrapper tabel `overflow-hidden rounded-lg` memotong dropdown absolute (`top-[calc(100%-4px)]`) milik `<td>` terakhir.
5. `isActive("/admin", pathname)` memakai prefix `startsWith(href + "/")` → `/admin/users`.startsWith(`/admin/`) = true.
6. Tidak pernah ada route admin + halaman untuk menulis `globalIntegrationSettings`; secret SumoPod disimpan plaintext dan dibaca plaintext oleh `sumopod.ts`.

| | |
|---|---|
| **File** | `apps/web/src/app/api/admin/billing/stats/route.ts` (query real: sum amount COMPLETED by month, count subscription aktif + cancel bulan ini + distinct org), `apps/web/src/components/admin/admin-sidebar.tsx` (tambah item `Blog` → `/admin/blog`; `isActive` exact-match untuk `/admin`), `apps/web/src/app/api/admin/platform-credentials/route.ts` (+`callbackUrl` & `webhookUrls` berbasis `BETTER_AUTH_URL`), `apps/web/src/app/admin/platforms/page.tsx` (render callback/webhook URL per kartu), `apps/web/src/components/admin/users-table.tsx` (hapus `overflow-hidden`), `apps/web/src/app/api/admin/sumo-pod/route.ts` (**baru**: GET masked + PUT upsert `globalIntegrationSettings`, secret di-`encryptToken`), `apps/web/src/app/admin/billing/page.tsx` (+kartu `SumoPodPaySettingsCard`: API key/secret, webhook secret/token, base URL, trial days, toggle aktif), `packages/payment/src/encryption.ts` (**baru**: AES-256-GCM encrypt/decrypt dipakai `sumopod.ts`), `packages/payment/src/sumopod.ts` (baca config kini `decryptToken`), `packages/payment/package.json` (+dep `@sahabat-kreator/env`) |
| **Masalah** | Billing mock; nav blog hilang; dropdown action terpotong; Overview selalu aktif; platform tanpa info callback URL; SumoPod tanpa UI admin & secret plaintext |
| **Akar** | Stats hardcoded; sidebar tanpa item blog; `overflow-hidden` di wrapper tabel; `isActive` prefix; UI credential tanpa URL setup; belum ada route+halaman admin untuk `global_integration_settings` |
| **Fix** | Billing query DB nyata (totalRevenue, monthlyRevenue, revenueLastMonth, activeSubscriptions, totalCustomers, churnRate); sidebar +Blog; isActive `/admin` exact; users-table tanpa overflow-hidden; API+UI callback/webhook URL; API+UI SumoPod Pay dengan secret terenkripsi + decrypt di service |
| **Verifikasi** | `pnpm --filter web check-types` lolos (web) setelah `pnpm install` (payment +dep env). **PENDING deploy** — perlu rebuild web di VPS. Data billing = 0/Rp0 bila belum ada payment COMPLETED (wajar). |
| **Pelajaran** | Cek `overflow-hidden` di wrapper tabel saat dropdown absolute terpotong. Jangan hardcode angka statistik admin — selalu query DB. Sidebar nav perlu exact-match untuk root route agar tak menyala di sub-route. Secret gateway pembayaran wajib dienkripsi di DB & didekripsi hanya di service. |
| **Log Keyword** | admin, billing, mock, blog, sidebar, dropdown, overflow-hidden, isActive, callback url, webhook, platform credentials, sumopod, payment, encrypt, global integration settings |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #20 — Setelah login/buat workspace redirect ke `/` (landing) bukan `/dashboard`
**Gejala:** User login (atau membuat workspace pertama, atau menerima undangan) berakhir di
`https://sahabatkreator.com/` (halaman landing) — harusnya masuk dashboard.

**Akar:** 3 komponen memakai `router.push("/")` setelah aksi sukses, padahal user sudah terautentikasi
dan punya workspace aktif:
1. `new-workspace-form.tsx` — setelah `organization.create` + `setActive`.
2. `accept-invitation-actions.tsx` — setelah `acceptInvitation`/`rejectInvitation` + `setActive`.
3. `verify-2fa-form.tsx` — fallback `post-login-redirect` default ke `"/"`.

Alur lengkap yang keliru: login → `/dashboard` → layout redirect ke `/onboarding/new-workspace`
(belum punya org) → buat workspace → `push("/")` → landing.

| | |
|---|---|
| **File** | `apps/web/src/components/onboarding/new-workspace-form.tsx`, `apps/web/src/components/auth/accept-invitation-actions.tsx`, `apps/web/src/components/auth/verify-2fa-form.tsx` |
| **Masalah** | Setelah aksi sukses user diarahkan ke landing, bukan dashboard |
| **Akar** | `router.push("/")` dipakai di 3 tempat untuk redirect post-auth |
| **Fix** | Ganti semua ke `router.push("/dashboard")`; fallback 2FA default `/` → `/dashboard` |
| **Verifikasi** | `pnpm --filter web check-types` lolos. **PENDING deploy** — perlu rebuild web di VPS lalu uji login/registrasi/undangan. |
| **Pelajaran** | Jangan redirect ke `/` untuk user terautentikasi; selalu ke `/dashboard`. Dashboard layout sudah handle redirect ke onboarding bila org belum ada — jadi push `/dashboard` aman dari loop. |
| **Log Keyword** | redirect, login, dashboard, onboarding, new-workspace, accept invitation, verify 2fa, landing |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #19 — Register error: field "issuer" tidak ada di schema "account" (better-auth 1.7.0 beta)
**Gejala:** Saat register (email/password) di prod: `ERROR [Better Auth]: The field "issuer" does not exist in the "account" Drizzle schema.` User bisa gagal didaftarkan.

**Akar:** `pnpm-workspace.yaml` catalog `better-auth: ^1.6.22` (caret) me-resolve ke **1.7.0** yang masih beta/rc. Di 1.7, `Account.issuer` wajib (breaking change "scope accounts by issuer") — schema `account` di `packages/db` belum punya kolom itu → adaptor drizzle menolak.

**Keputusan:** **Downgrade ke stable track** (bukan menambah kolom `issuer`), karena 1.7 masih beta dan perubahan breaking-nya belum diperlukan.

| | |
|---|---|
| **File** | `pnpm-workspace.yaml` (`better-auth: ^1.6.22` → `~1.6.29` → terpasang **1.6.30**), `apps/web/src/components/dashboard/security/enable-two-factor-flow.tsx` (API 2FA 1.6: `enable({ password, method })` → `enable({ password })`; hapus cek `data.method`; return 1.6 = `{ totpURI, backupCodes }`). Migrasi 0001 (dari percobaan tambah `issuer`) dihapus. |
| **Masalah** | Register error karena better-auth 1.7.0 (beta) butuh kolom `account.issuer` |
| **Akar** | Catalog caret `^1.6.22` ikut naik ke 1.7.0 beta; 1.7 mewajibkan `issuer` |
| **Fix** | Pin catalog `~1.6.29` (hanya patch 1.6.x) → terpasang 1.6.30 stable; sesuaikan API 2FA yang berubah |
| **Verifikasi** | `pnpm -r check-types` lolos (9 workspace). **PENDING deploy** — perlu rebuild web di VPS lalu uji register. |
| **Pelajaran** | Catalog pnpm pakai caret (`^`) mengizinkan minor upgrade otomatis — risiko versi beta terserap; pin dengan `~` untuk major line yang diinginkan. API better-auth bisa berubah antar minor (2FA `enable`). |
| **Log Keyword** | issuer, account schema, better-auth, 2FA, enable two factor, method totp, catalog, downgrade |
| **Deploy** | PENDING — belum di-deploy di VPS |

---

### Fix #18 — `www` subdomain HTTP 525: Caddy tak punya sertifikat untuk `www`
**Gejala:** Setelah Cloudflare proxied + SSL Full (strict), `https://sahabatkreator.com` → 200,
tapi `https://www.sahabatkreator.com` → **HTTP 525** (SSL handshake failed). Log Caddy hanya
menunjukkan proses ACME untuk `sahabatkreator.com`, tidak pernah untuk www.

**Akar:** `Caddyfile` hanya mendefinisikan site block `{$DOMAIN}` (apex). Caddy tidak otomatis
menerbitkan sertifikat untuk subdomain yang tidak ada di config → handshake www gagal saat
Cloudflare proxy mencoba koneksi SSL ke origin.

| | |
|---|---|
| **File** | `Caddyfile` — tambah site block `www.{$DOMAIN}` → `redir https://{$DOMAIN}{uri} permanent` di atas block apex. |
| **Masalah** | www → 525 SSL handshake failed (Caddy tak punya cert www) |
| **Akar** | Tidak ada site block www di Caddyfile → Caddy tidak meng-issue sertifikat untuk www |
| **Fix** | Blok `www.{$DOMAIN}` dengan redirect permanen ke apex; Caddy auto-TLS menerbitkan sertifikat Let's Encrypt untuk www juga. |
| **Verifikasi** | VPS: `docker compose up -d --force-recreate caddy` → log `certificate obtained successfully identifier=www.sahabatkreator.com`; `curl -I https://www.sahabatkreator.com` → **301 Moved Permanently** `Location: https://sahabatkreator.com/`. |
| **Pelajaran** | Setiap subdomain yang diarahkan ke origin harus ada site block-nya di Caddyfile (atau pakai `www` via placeholder) — Caddy hanya menerbitkan cert untuk hostname yang terdaftar di config. |
| **Log Keyword** | www, 525, SSL handshake, certificate obtained, redir, subdomain |
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200, www → 301 redirect apex |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |

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
| **Deploy** | LIVE 2026-08-19 - https://sahabatkreator.com 200 (HTTPS, Caddy Let's Encrypt, web healthy, migrate sukses) |
