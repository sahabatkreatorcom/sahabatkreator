# Upload & Body Limit — arsitektur per-layer

Semua request ke aplikasi melewati rantai yang sama:

```
Browser (XHR/fetch) → Cloudflare (proxy) → NGINX host (:443) → Docker Hono app (127.0.0.1:3001)
```

Setiap layer bisa membatai ukuran body. Dokumentasi ini menjelaskan **layer mana
membatasi apa**, kenapa, dan apa yang harus diubah saat ingin menaikkan/menurunkan
limit — khususnya untuk **upload video besar ke flow klip**, yang merupakan kasus
ukuran terbesar di produk ini.

---

## 1. Yang penting dipahami dulu: klip TIDAK mengirim byte besar via JSON

Flow klip (`Auto Clip` & `Video Render`) didesain agar **byte video besar tidak pernah
lewat route JSON**:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Browser upload video (multipart)                                  │
│    POST /api/media/upload  ──→  R2 storage  ──→  media row (id)       │
│                                                                      │
│ 2. Browser buat job klip (JSON kecil, tidak ada byte video)          │
│    POST /api/auto-clip  { baseVideoMediaId: <id> }                   │
│    POST /api/video      { baseVideoMediaId: <id>, clips: [...] }     │
│    ──→  worker  ──→  Modal.com render (baca video dari R2)            │
│                                                                      │
│ 2b. Alternatif "paste link":                                         │
│     POST /api/auto-clip  { sourceUrl: "https://..." }                │
│     ──→ server unduh video itu sendiri (lihat §5, tidak kena limit    │
│         body client karena yang besar jalan di sisi server)           │
└──────────────────────────────────────────────────────────────────────┘
```

Karena itu:

- Route multipart (`/api/media/upload`) → limit **besar** (110MB).
- Route klip/render (`/api/auto-clip`, `/api/video`) → JSON, limit **kecil** (10MB).
  Mereka hanya membawa id media + parameter.

**Implikasi:** kalau suatu hari ada route multipart baru, ia **wajib** didaftarkan di
`LARGE_UPLOAD_PATHS` (`apps/server/src/lib/body-limit.ts`) — kalau tidak, ia dapat
limit JSON 10MB dan upload besar akan ditolak 413.

---

## 2. Tabel limit per-layer

| Layer                              | Limit        | File / sumber                                        | Catatan |
|------------------------------------|--------------|------------------------------------------------------|---------|
| Cloudflare (proxy)                 | ~100MB       | plan Free/Pro (di luar repo)                         | Pro 100MB, Business 200MB, Enterprise 500MB. Tidak bisa diubah dari repo. |
| **NGINX host**                     | **110MB**    | `sahabatkreator.conf` (`client_max_body_size 110m`)  | Berlaku untuk SEMUA path. Dulu 50m → memotong upload video klip >50MB. |
| NGINX — waktu baca body            | 300s         | `sahabatkreator.conf` (`client_body_timeout 300s`)   | Default 60s; upload 100MB dari jaringan pelan bisa melebihi ini. |
| **Hono bodyLimit (multipart)**     | **110MB**    | `apps/server/src/lib/body-limit.ts` (`UPLOAD_MAX`)   | Hanya path di `LARGE_UPLOAD_PATHS`. |
| **Hono bodyLimit (JSON & lainnya)**| **10MB**     | `apps/server/src/lib/body-limit.ts` (`JSON_MAX`)     | Semua path lain. 10MB masih sangat longgar untuk payload JSON terbesar di repo (batch schedule, caption carousel). |
| Route media — validasi file        | **100MB**    | `apps/server/src/routes/media.ts` (`MAX_FILE_SIZE`)  | Validasi bisnis: "Ukuran file maksimal 100 MB". |
| Route media — tipe file            | whitelist    | `media.ts` (`ALLOWED_TYPES`)                         | image (JPEG/PNG/WebP/GIF), video (MP4/MOV/WebM), audio (MPEG/MP4/WAV variants/WebM-Opus). Semua divalidasi ulang via sniff magic bytes vs content-type klaim. SVG sengaja dilarang (XSS). |
| Route sound — file                 | 20MB         | `apps/server/src/routes/sound.ts` (`MAX_FILE_SIZE`)  | Audio, limit sendiri. |

Urutan efektif (paling luar dulu): Cloudflare → NGINX `client_max_body_size` →
Hono `bodyLimit` (per-path) → validasi route. **Permintaan ditolak di layer pertama
yang dilampaui.**

---

## 3. Kenapa limit NGINX dibesarkan, bukan per-route

Pilihan desainnya: **satu limit besar global di NGINX, tapi limit kecil per-path di
aplikasi**.

Alasannya: di Hono, middleware `app.use("/*")` selalu jalan **sebelum** middleware
route-level. Jadi bila kita pasang `client_max_body_size` … analoginya di Hono:

```ts
// ❌ TIDAK AKAN JALAN seperti yang dibayangkan:
app.use("/*", bodyLimit({ maxSize: 10 * 1024 * 1024 }));        // ini menolak duluan
app.use("/api/media/upload", bodyLimit({ maxSize: 110MB }));    // tidak pernah sampai
```

Limit kecil global mengalahkan limit besar per-route. Karena itu pemilihan limit
dilakukan **di dalam satu middleware `/*`**, berdasarkan path:

```ts
// apps/server/src/lib/body-limit.ts
export const uploadAwareBodyLimit = (): MiddlewareHandler =>
  async (c, next) =>
    bodyLimit({
      maxSize: LARGE_UPLOAD_PATHS.has(c.req.path) ? UPLOAD_MAX : JSON_MAX,
    })(c, next);
```

Di NGINX, pola "satu limit global + lokasi khusus" memang bisa (`location ~ ^/api/(media|sound)/upload$`),
tapi di repo ini **tidak** dipakai: NGINX hanya jadi pagar luar (110m), sementara
pemisahan presisi per-path dilakukan di Hono — satu sumber kebenaran, dan ia
punya test (`apps/server/src/lib/body-limit.test.ts`).

---

## 4. Cara mengubah limit (checklist)

Misal ingin menaikkan upload media ke 500MB:

1. **`sahabatkreator.conf`** — `client_max_body_size 550m;` (file + overhead form-data,
   selalu lebih besar dari limit aplikasi) di blok prod **dan** staging.
2. **`apps/server/src/lib/body-limit.ts`** — `UPLOAD_MAX = 550 * 1024 * 1024;`
   dan/atau tambahkan path multipart baru ke `LARGE_UPLOAD_PATHS`.
3. **`apps/server/src/lib/body-limit.test.ts`** — update assertion konstanta +
   daftar path (test akan gagal kalau lupa).
4. **`apps/server/src/routes/media.ts`** — `MAX_FILE_SIZE` (limit bisnis yang
   dilihat user: "Ukuran file maksimal X MB"). Cek juga UI
   (`apps/web/src/pages/dashboard/media.tsx`) yang menulis labelnya.
5. **`client_body_timeout`** — untuk upload besar, naikkan juga (waktu antar-chunk
   jaringan pelan). `proxy_read_timeout`/`proxy_send_timeout` (120s) tidak membatu
   upload itu sendiri: NGINX menyangga body ke disk dulu (`proxy_request_buffering`
   default `on`) baru mem-proxy.
6. **Cloudflare** — cek plan: Free/Pro ~100MB/request. Di atas itu harus pakai
   upload langsung ke R2 (presigned URL) — saat ini belum dipakai.
7. **Jalankan test**: `cd apps/server && ./node_modules/.bin/vitest.exe run --root .`

Aturan praktis: **limit selalu harus konsisten dari luar ke dalam** — Cloudflare ≥
NGINX ≥ Hono multipart ≥ route. Kalau ada yang lebih kecil di luar, ia jadi
bottleneck diam-diam (persis bug `50m` NGINX yang lama).

---

## 5. Route mana yang menerima multipart besar

Audit lengkap endpoint yang membaca `c.req.formData()` (multipart):

| Path                        | Ukuran typical     | Terdaftar di `LARGE_UPLOAD_PATHS` |
|-----------------------------|--------------------|----------------------------------|
| `POST /api/media/upload`    | hingga 100MB (video untuk klip, foto) | ✅ |
| `POST /api/sound/upload`    | audio, hingga 20MB | ✅ |
| `POST /api/admin/holidays/import` | CSV, kecil     | ✅ |

Semua route lain membaca `c.req.json()` — termasuk semua route klip/render:

- `POST /api/auto-clip` — body: `sourceUrl` **atau** `baseVideoMediaId` + opsi analisa.
- `POST /api/auto-clip/:id/select` — daftar kandidat terpilih.
- `POST /api/video` — `baseVideoMediaId` + array clips (montage) + voiceover/bgm id.
- `POST /api/media/import` — **paste link**: server yang mengunduh media dari URL
  remote (server-side fetch). Byte besar jalan dari R2/remote ke server, **bukan
  dari client**, jadi `client_max_body_size` tidak berlaku. Tetap divalidasi:
  content-type whitelist + ukuran (`MAX_FILE_SIZE`) + magic-bytes sniff.
- `POST /mcp` — MCP remote (Streamable HTTP). Body = JSON-RPC berisi argumen tool
  (beberapa KB), jadi masuk batas JSON 10MB dengan sangat longgar. **Tidak perlu**
  didaftarkan di `LARGE_UPLOAD_PATHS`. Catatan: dari 14 tool MCP yang ada, **tidak
  ada satu pun yang menerima upload file** — `list_media` hanya membaca daftar.
  Jadi byte media tetap hanya naik lewat `POST /api/media/upload` (multipart) dari
  web app, bukan lewat `/mcp`.

Di sisi client, semua upload multipart lewat helper yang sama:

- `api.upload()` / `api.uploadWithProgress()` (`apps/web/src/lib/api.ts`) — XHR
  (`withCredentials`) dengan progress bar; persen di-cap 99% saat mengunggah dan
  baru 100% saat respons sukses.
- Pengguna: `pages/dashboard/media.tsx` (library media), `hooks/use-compose-form.ts`
  (composer), `pages/dashboard/use-video-render.ts` (dasar video render), dan
  `components/compose/{media-library-picker,image-editor-modal}.tsx`.

---

## 6. Deploy konfigurasi NGINX

```bash
# Dari root repo ke server:
sudo cp sahabatkreator.conf /etc/nginx/conf.d/sahabatkreator.conf
sudo mkdir -p /etc/nginx/ssl
sudo cp origin.crt origin.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/origin.key

# WAJIB validasi dulu — salah ketik directive = nginx mati total untuk SEMUA site
sudo nginx -t
sudo systemctl reload nginx
```

File ini di-include dari konteks `http` (`conf.d`), bukan `sites-enabled`. Karena
server yang sama juga menjalankan aplikasi lain (mis. toeflynk di :3000):

- `set_real_ip_from` kumulatif → aman dideklarasikan ulang di sini.
- `real_ip_header` **hanya** di dalam server block, agar tidak bentrok
  "directive is duplicate" dengan konfigurasi lain.

Setelah reload, verifikasi limit benar-benar berlaku:

```bash
# harus gagal (>110MB) — 413
curl -X POST -F "file=@./besar.bin" https://sahabatkreator.com/api/media/upload

# harus diterima layer proxy (autentikasi tetap divalidasi aplikasi) — bukan 413
curl -X POST -F "file=@./kecil.jpg" https://sahabatkreator.com/api/media/upload
```

---

## 7. Troubleshooting: darimana 413 ini datang?

| Gejala | Sumber | Cara verifikasi |
|--------|--------|-----------------|
| 413 dengan body "Payload Too Large" singkat, header server `nginx` | **NGINX** (`client_max_body_size`) | `curl -v`; cek apakah 413 di semua path atau hanya path tertentu |
| 413 setelah `nginx -t` baru saja direload | NGINX, config tidak tersalin | `sudo nginx -T \| grep client_max_body_size` (harus 110m, prod & staging) |
| 413 hanya di route JSON, upload media bisa | **Hono** `JSON_MAX` | Semua yang bukan multipart memang 10MB — periksa apakah route seharusnya multipart tapi tidak terdaftar |
| 400/413 dengan pesan "Ukuran file maksimal 100 MB" (JSON aplikasi) | **Route media** (`MAX_FILE_SIZE`) | Body JSON dari Hono, bukan halaman error nginx |
| Request hang/cancel tengah jalan, tidak ada respons | **`client_body_timeout`** atau bandwidth | Naikkan `client_body_timeout`; lihat `error.log` untuk "client request timed out" |
| Upload selalu gagal tepat di ~100MB walau limit lebih besar | **Cloudflare** (plan) | Bypass CF (akses origin langsung) untuk memastikan; atau cek plan di dashboard CF |
| Progress client mentok di 99% lalu error | Respons non-2xx dari aplikasi | `api.uploadWithProgress` sengaja cap 99% sampai respons sukses — ini sinyal error layer aplikasi, bukan jaringan |

---

## 8. Test regresi

- `apps/server/src/lib/body-limit.test.ts` (6 test) — memastikan:
  - path multipart (`/api/media/upload`) menerima body di atas `JSON_MAX`;
  - path JSON (`/api/posts`) menolaknya dengan 413;
  - body kecil dan request tanpa body tidak terkena limit;
  - `LARGE_UPLOAD_PATHS` mencakup ketiga route multipart dan **tidak** mencakup
    `/api/auto-clip` / `/api/video` (penjaga agar route klip tak sengaja dapat
    jatah limit besar);
  - konstanta `UPLOAD_MAX` / `JSON_MAX` sesuai dokumentasi ini.
- Jalankan: `cd apps/server && ./node_modules/.bin/vitest.exe run --root .`

Catatan: `bodyLimit` Hono memakai header `content-length` untuk fast-path reject,
jadi test tidak benar-benar mengalokasikan body besar — tetap cepat.
