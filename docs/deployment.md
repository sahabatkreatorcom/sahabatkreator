# Panduan Deploy — Sahabat Kreator

Dokumentasi deployment untuk **produksi** (`sahabatkreator.com`) dan **staging** (`app.sahabatkreator.com`).

---

## 1. Arsitektur

```
Internet
   │
   ▼
Cloudflare (proxy, SSL Full Strict)
   │
   ▼
NGINX host-level :443 (Cloudflare Origin Cert)
   ├── sahabatkreator.com        → 127.0.0.1:3001  (PROD, indexable)
   └── app.sahabatkreator.com    → 127.0.0.1:3002  (STAGING, noindex)
   │
   ▼
Docker Compose (per environment)
   ├── app     → Hono API + serve static web-dist (image: sahabatkreator-app)
   │             rute: /api (session cookie) · /v1 (API key) · /webhooks/* (masuk)
   ├── worker  → BullMQ publisher + webhook delivery (image sama, command berbeda)
   ├── migrate → drizzle-kit push + seed (jalan sekali per deploy)
   ├── redis   → antrean BullMQ (internal, tanpa port host)
   └── postgres (PROD SAJA) → PostgreSQL 17, data di volume postgres_data
       (mount /var/lib/postgresql — parent path, aman untuk upgrade 17.x)

Database: PRODUKSI = PostgreSQL 17 container (self-hosted di server)
          STAGING  = Neon Serverless Postgres (via DATABASE_URL)
Storage : Cloudflare R2
Email   : Resend
Billing : Sumopod Pay
Render  : Modal.com — 3 app di luar server: `sahabatkreator-render`
          (ffmpeg + Whisper, §8), `sahabatkreator-carousel` (Pillow, §9),
          dan `sahabatkreator-clipper` (whisper ingest, **akun kedua**, §10).
          Server prod 2 core/4 GB tidak boleh tambah beban render (OOM).
Integrasi eksternal: Public API /v1 + webhook keluar (server & worker yang
          sama, tanpa container baru, §11). MCP tersedia dua jalur: stdio
          (dijalankan di mesin pengguna) dan HTTP `POST /mcp` (di server ini,
          ikut container `app` — tidak ada container baru, §11.6).
```

**Poin penting:**
- Satu image Docker (`sahabatkreator-app`) untuk app / worker / migrate — hanya berbeda command di compose.
- Port 3000 dipakai aplikasi lain di server (toeflynk) — **jangan diganggu**.
- Redis & Postgres tanpa port host karena hanya di jaringan internal Docker.
- NGINX berjalan di host (bukan container) karena server menampung beberapa aplikasi.
- Aplikasi Python `apps/render-modal/` **sengaja tidak ikut** Docker image —
  ketiga app Modal di-deploy terpisah (§8.3, §9.3, §10.3); clipper bahkan
  berada di **akun Modal kedua** (isolasi concurrency quota, §10).
- `apps/mcp/` = klien/server MCP **stdio** (dijalankan di mesin pengguna). Source-nya
  ikut ter-copy ke image karena `COPY . .`, tapi **tidak dipakai** oleh container mana
  pun — jalur MCP yang hidup di server adalah `POST /mcp` di `apps/server` (§11.6).
  Tapi `package.json`-nya tetap disalin di stage `deps` Dockerfile — workspace
  yang terdaftar di `bun.lock` tapi tidak disalin akan **dilewati diam-diam**
  oleh `bun install` (hanya `note: skipped 1 workspace`, exit 0). Setiap
  workspace baru wajib menambah satu baris `COPY` di Dockerfile.
- Endpoint `POST /mcp` **tidak butuh env baru** dan **tidak butuh location NGINX
  baru** — ikut `location /` yang sudah ada (§11.6).

---

## 2. Prasyarat

### Server
- Linux dengan Docker Engine + Docker Compose v2
- Port 80/443 bebas (NGINX sudah / akan berjalan)
- RAM minimal ±4 GB (app 1 GB + worker 1.5 GB limit + sistem + aplikasi lain)

### Layanan eksternal (siapkan kredensialnya dulu)
| Layanan | Kegunaan | Yang dibutuhkan |
|---|---|---|
| **Neon** | Database Postgres **staging** | Connection string proyek Neon STAGING |
| **Cloudflare** | DNS + proxy + SSL | Akses ke domain `sahabatkreator.com`, buat **Origin Certificate** (`origin.crt` + `origin.key`) |
| **Cloudflare R2** | Storage media | Account ID, Access Key, Secret, Bucket, Public URL |
| **Resend** | Email transaksional | API Key + domain terverifikasi |
| **Sumopod Pay** | Billing | API Key produksi + Webhook Token (base URL `https://api-pay.sumopod.com`) |

Layanan **opsional** (fitur nonaktif secara graceful bila kosong — bukan crash):

| Layanan | Fitur yang diaktifkan | Yang dibutuhkan |
|---|---|---|
| **Modal.com** | Render video (§8) + carousel slide (§9) + auto-clip ingest (§10) | Token + secret `sk-render-auth` (§8.3); clipper pakai **akun kedua** (§10.3) |
| **Pixabay** | Background stock carousel (§9.2) | API key gratis |
| **OpenRouter** | AI outline + toggle AI Visual Layout (§9.4) + **seleksi momen auto-clip (§10.1)** | API key (sudah dipakai fitur AI lain) |

### DNS Cloudflare (sebelum mulai)
| Record | Tipe | Nilai | Proxy |
|---|---|---|---|
| `sahabatkreator.com` | A | IP server | ✅ On (oranye) |
| `www.sahabatkreator.com` | CNAME | `sahabatkreator.com` | ✅ On |
| `app.sahabatkreator.com` | CNAME | `sahabatkreator.com` | ✅ On |

SSL/TLS mode: **Full (Strict)** + nyalakan **Always Use HTTPS**.

---

## 3. Deploy Produksi Pertama Kali

### 3.1 Siapkan source di server

```bash
git clone git@github.com:sahabatkreatorcom/sahabatkreator.git
cd sahabatkreator
```

### 3.2 Isi `.env.prod`

```bash
cp .env.prod.example .env.prod
```

Generate nilai yang wajib acak:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -hex 24      # POSTGRES_PASSWORD (hex, URL-safe — jangan base64!)
```

Yang **wajib** dicek sebelum lanjut:

| Variabel | Catatan |
|---|---|
| `POSTGRES_PASSWORD` | Password PostgreSQL produksi (container di server) — `DATABASE_URL` di-set otomatis oleh compose |
| `BETTER_AUTH_SECRET` | Min 32 karakter acak |
| `ENCRYPTION_KEY` | Base64 32-byte — dipakai enkripsi token OAuth user. **Jika berubah setelah go-live, semua koneksi platform invalid!** |
| `SUMOPOD_API_BASE_URL` | Harus `https://api-pay.sumopod.com` (BUKAN sandbox) |
| `RESEND_API_KEY` | Produksi |
| `R2_*` | Semua terisi |
| `GA_MEASUREMENT_ID` | ID GA4 (G-XXXXXXX) — build arg, tracking hanya di produksi |

Kredensial platform (META_APP_ID dll.) boleh kosong dulu — bisa diisi via **Admin Panel → Kredensial Platform** setelah aplikasi jalan.

> ⚠️ `.env.prod` sudah di-ignore git. JANGAN commit. Nilai kosong dianggap undefined.

### 3.3 Pasang NGINX + SSL

```bash
# Salin konfigurasi (file ada di root repo: sahabatkreator.conf)
sudo cp sahabatkreator.conf /etc/nginx/conf.d/sahabatkreator.conf

# Pasang Origin Certificate Cloudflare
sudo mkdir -p /etc/nginx/ssl
sudo cp origin.crt origin.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/origin.key

# Validasi & reload
sudo nginx -t && sudo systemctl reload nginx
```

### 3.4 Build & jalankan

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

> ⚠️ `--env-file .env.prod` **wajib** — compose membaca `POSTGRES_PASSWORD` (dan `GA_MEASUREMENT_ID`) dari sana untuk interpolasi. Tanpa itu deploy gagal dengan pesan error yang jelas (guard `:?`).

Urutan otomatis: `postgres` & `redis` sehat → `migrate` (drizzle-kit push --force + seed idempoten) → `app` + `worker`.

`DATABASE_URL` **tidak perlu diisi** di `.env.prod` — compose otomatis mengarahkannya ke container postgres internal (`postgresql://sahabatkreator:...@postgres:5432/sahabatkreator`).

### 3.5 Verifikasi

```bash
# Container semua jalan (postgres, redis, migrate exited 0, app, worker)
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

# Health endpoint
curl -s https://sahabatkreator.com/health

# Robots.txt HARUS indexable (tidak ada "Disallow: /")
curl -s https://sahabatkreator.com/robots.txt

# Sitemap
curl -s https://sahabatkreator.com/sitemap.xml | head -5

# Cek service worker + manifest ter-load
curl -sI https://sahabatkreator.com/sw.js | head -3
curl -sI https://sahabatkreator.com/manifest.webmanifest | head -3

# Worker jalan (log tidak error)
docker logs sahabatkreator-worker --tail 50
```

Buka `https://sahabatkreator.com` di browser — halaman landing harus tampil, register/login harus berfungsi.

---

## 4. Deploy Staging (app.sahabatkreator.com)

Mirip produksi, dengan perbedaan:

```bash
cp .env.staging.example .env.staging
# Isi DATABASE_URL dengan proyek Neon STAGING (terpisah dari produksi!)

docker compose -f docker-compose.staging.yml up -d --build
```

Perbedaan build staging (otomatis dari compose):
- `SERVER_URL` = `https://app.sahabatkreator.com`
- `SITE_URL` (canonical) **tetap** `https://sahabatkreator.com` — canonical staging mengarah ke produksi agar tidak muncul duplikat di SERP
- `INDEXABLE` kosong → build web mendapat `robots.txt` Disallow + meta noindex
- `GA_MEASUREMENT_ID` kosong → tidak ada tracking di staging

Staging sudah terwakili di `sahabatkreator.conf` (upstream `127.0.0.1:3002` + `X-Robots-Tag: noindex` dari NGINX — lapisan ke-4).

Verifikasi cepat setelah deploy staging (termasuk jalur MCP):

```bash
# App sehat
curl -s https://app.sahabatkreator.com/health

# MCP remote hidup di staging (butuh API key dari org staging)
curl -s -X POST https://app.sahabatkreator.com/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer sk_live_...' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  | head -c 120
# → {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":...,"serverInfo":{"name":"sahabatkreator"...}}}

# GET harus 405 (bukan SSE yang menggantung)
curl -s -o /dev/null -w '%{http_code}\n' https://app.sahabatkreator.com/mcp

# noindex tetap utuh (jangan sampai header bocor karena perubahan NGINX)
curl -sI https://app.sahabatkreator.com | grep -i x-robots-tag
```

> ⚠️ Jangan uji MCP di staging dengan key produksi — org berbeda, jadi
> `tools/list` akan kosong/terbatas dan datanya bukan data produksi.

---

## 5. Update / Redeploy

### Workflow standar (staging → produksi)

```bash
cd sahabatkreator
git pull origin main

# 1. Uji di staging dulu
docker compose -f docker-compose.staging.yml up -d --build

# 2. Setelah QA lolos, naikkan ke produksi
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

`docker compose up -d --build` otomatis:
1. Rebuild image (build web + server di dalam Docker)
2. Jalankan `migrate` (sync skema + seed) sebelum app/worker baru start
3. Restart app & worker dengan image baru

### Deploy hanya perubahan env (tanpa rebuild)

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate
```

---

## 6. Rollback

Image Docker diberi tag `sahabatkreator-app:prod` (ditimpa tiap build). Untuk rollback cepat:

```bash
# Cek image lama yang masih ada di sistem
docker images

# Rollback ke commit tertentu (paling andal)
git log --oneline -10          # temukan commit terakhir yang sehat
git checkout <commit-sehat>
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

> ⚠️ **Catatan skema DB:** deploy memakai `drizzle-kit push --force` (sinkronisasi skema langsung). Push yang menghapus/mengubah kolom **bersifat destruktif dan tidak otomatis ter-rollback**. Untuk perubahan skema besar, backup dulu (lihat § 7).

### Backup database produksi (PostgreSQL container)

Data produksi ada di volume `postgres_data` — **tidak ada backup otomatis dari provider** (beda dengan Neon). Jadwalkan backup rutin:

```bash
# Backup harian (cron) — dump ke file host
docker exec sahabatkreator-postgres pg_dump -U sahabatkreator sahabatkreator \
  | gzip > /root/backups/sahabatkreator-$(date +%F).sql.gz

# Restore
gunzip -c /root/backups/sahabatkreator-2026-09-13.sql.gz \
  | docker exec -i sahabatkreator-postgres psql -U sahabatkreator -d sahabatkreator
```

---

## 7. Operasional Harian

### Log

```bash
docker logs sahabatkreator-app -f --tail 100      # API
docker logs sahabatkreator-worker -f --tail 100   # publisher worker
docker logs sahabatkreator-postgres --tail 50     # database
docker logs sahabatkreator-redis --tail 50        # antrean
sudo tail -f /var/log/nginx/access.log            # trafik (NGINX host)
```

### Health & resource

```bash
curl -s https://sahabatkreator.com/health
docker stats --no-stream     # cek RAM/CPU container (limit: app 1g/1.5cpu, worker 1.5g/1.5cpu)
df -h                        # disk (watch: growth volume redis_data)
```

### Restart service

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml restart app worker
```

### Endpoint khusus (butuh CRON_SECRET)

Beberapa endpoint internal (cron/fallback) memakai header `Authorization: Bearer $CRON_SECRET`. Lihat `apps/server/src/routes/` untuk detail.

---

## 8. Render Video (Modal.com — di luar server ini)

Render video (ffmpeg 1080p + Whisper transcribe) butuh 0.5–1.5 GB RAM per job.
Server prod **2 core / 4 GB** sudah over-allocated (postgres 1g + app 1g +
worker 1.5g = 3.5g) — render lokal akan menyebabkan OOM killer mematikan
**Postgres** (oom_score tertinggi karena shared memory). Karena itu render
dijalankan di Modal.com (per-second billing, scale-to-zero) dan aplikasi
Python-nya **tidak ikut** Docker image monorepo. Detail: [docs/rfc-video-render.md](rfc-video-render.md) §11.

### 8.1 Komponen & alur data

```
Dashboard /video → POST /video (API Hono)
   → video_job (DB, status=queued) + video_job_clip (clip montage) + enqueue
   → worker: presigned R2 URL (GET input + clip, PUT output/thumbnail/SRT)
   → Modal function (POST /render, Bearer MODAL_TOKEN)
       fetch R2 → montage segmen acak → mix audio → resize → Whisper
       → burn caption → extract thumbnail → upload R2
   → worker: simpan output + thumbnail ke tabel media → video_job status=done
   → galeri /renders baca GET /renders/manifest (DB, hanya job opt-in)
```

Aplikasi terkait (semua di repo ini, kecuali Modal function):
- `apps/render-modal/` — Python + FastAPI di Modal. Deploy sendiri (§8.3).
- `packages/render/` — adapter interface; `ModalRenderAdapter` bicara ke Modal.
- `packages/queue/src/render-processor.ts` — claim job, presign, simpan output.
- `apps/web/src/pages/dashboard/video.tsx` — UI buat job + polling status.
- `apps/web/src/pages/dashboard/renders.tsx` — galeri (baca manifest via API).
- `apps/server/src/routes/renders.ts` — `GET /renders/manifest` (requireOrg).

### 8.2 Env yang dibutuhkan (`.env.prod`)

| Variabel | Isi |
|---|---|
| `R2_*` | Wajib — input & output render lewat presigned URL R2 |
| `MODAL_TOKEN` | Bearer secret bersama (sama dengan secret Modal, §8.3) |
| `MODAL_RENDER_URL` | URL output `modal deploy` (`https://<ws>--…modal.run`) |

Kosongnya `MODAL_TOKEN`/`MODAL_RENDER_URL` **bukan crash**: route `/video`
menjawab 503 yang jelas dan worker skip queue (graceful degrade, sama seperti
`REDIS_URL` opsional).

> ⚠️ **Footgun env:** konfig memakai `emptyStringAsUndefined`. Tulis
> `MODAL_TOKEN=` **tanpa spasi setelah `=`**. `MODAL_TOKEN= ` (spasi) dianggap
> terisi → fitur tetap nonaktif tapi pesan errornya menyesatkan.

### 8.3 Deploy Modal function (sekali per perubahan pipeline)

```bash
# Di mesin lokal (bukan server VPS — butuh browser untuk login sekali)
pipx install modal                          # pip polos sering tolak PEP 668
modal token new                             # profil default (akun "primary")

# sekali saja: Bearer auth antara worker ↔ function
modal secret create sk-render-auth \
  MODAL_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(32))")

cd apps/render-modal
modal deploy src/sk_render.py               # → URL function = MODAL_RENDER_URL
```

> Sejak auto-clip memakai **akun Modal kedua** (§10.3), kelola kedua akun
> via profil `~/.modal.toml` (`modal token set --profile`, deploy dengan
> `MODAL_PROFILE=primary …`) — jangan `modal token new` untuk berganti akun
> karena menimpa token profil aktif (footgun §10.3).

Salin token yang sama ke `MODAL_TOKEN` di `.env.prod`, lalu recreate worker:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate worker
```

Verifikasi function sehat (URL dari output deploy):

```bash
curl -H "Authorization: Bearer $MODAL_TOKEN" \
  https://<workspace>--sahabatkreator-render-web.modal.run/health
# {"status":"ok"}
```

> Modal function **sengaja tidak ikut** `Dockerfile`/turbo. Tidak ada
> `apps/render-modal/package.json` — jangan tambahkan ke workspace config.

### 8.4 Galeri `/renders` (manifest via API, bukan file publik)

Halaman `/renders` membaca manifest dari `GET /renders/manifest` (API
terauthentikasi, `requireOrg`) yang **dibangun dari DB saat request** —
bukan lagi file `renders.json` di R2 public URL.

Alasan perubahan: `renders.json` publik adalah *directory listing* anonim
semua karya klien (URL download + slug org + struktur storage path), walau
bucket R2-nya sendiri tidak bisa di-enumerate. Karena halaman `/renders`
sendiri sudah ada di dalam `RequireAuth`, file publik tidak ada gunanya —
manifest cukup di-serving lewat API.

Konsekuensi:
- `publishedToGallery` di `video_job` jadi satu-satunya sumber kebenaran.
  Toggle on/off (`PATCH /video/:id/gallery`) adalah operasi murni DB —
  tidak ada sinkronisasi file, tidak ada backfill script.
- `VITE_RENDERS_MANIFEST_URL` **dihapus** dari env, Dockerfile build arg,
  dan kedua compose file. CORS R2 untuk `renders.json` tidak diperlukan lagi.
- Object `renders.json` lama di R2 **harus dihapus sekali** setelah deploy
  (bisa lewat dashboard R2 / `rclone` / `aws s3api delete-object`):
  `s3://<R2_BUCKET>/renders.json`.

### 8.5 Operasional render

```bash
# Job stuck di 'rendering' lebih dari ~20 menit? Modal timeout, job terminal.
docker logs sahabatkreator-worker --tail 100 | grep -i render

# Worker sehat tapi job tidak diproses? cek adapter terkonfigurasi
curl -s https://sahabatkreator.com/video | head    # renderEnabled: true/false
```

- Job Modal yang `failed` bersifat **terminal** — tidak auto-retry. User
  render ulang via tombol "Render ulang" di riwayat job (clip montage disalin,
  komposisi sama — tapi segmen acak akan berbeda).
- Biaya acuan: CPU $0.0000131/core/s + RAM $0.00000222/GiB/s; render 5 menit
  @ 1 core/2 GiB ≈ $0.005. Free tier Starter $30/bln ≈ ±5.700 render.
- **Egress (sejak 1 Okt 2026):** Modal menambah biaya egress $0.04/GiB di atas
  1 TiB per billing cycle (Starter). Render kita download input dari R2
  (ingress, gratis) dan upload output + thumbnail + SRT ke R2 — egress per
  job ≈ ukuran output (~4 MB per 34 d 1080p portrait). 1 TiB allowance ≈
  ±250 ribu render, jadi untuk skala sekarang **tidak menambah biaya**. Tapi
  bila batch templating (1 job → N varian) aktif nanti, hitung egress = N ×
  ukuran output. Pantau di Modal → Settings → Usage & Billing ( Sept 2026:
  usage tampil, belum ditagih; tagihan pertama 1 Nov 2026).
- Montage (multi-clip) mengunduh + men-`ffprobe` tiap clip; job dengan banyak
  clip lebih lama dari render single — normal, bukan hang.

### 8.6 Rollback / catatan skema render

Migrasi render: `0002_video_render.sql`, `0003_render_gallery.sql`,
`0004_montage_clips.sql`. Deploy memakai `drizzle-kit push --force` (lihat
§6) — migration file tercatat tapi tidak dijalankan literal; push yang
mensinkronkan skema.

`video_job_clip` berm FK cascade ke `media` dan `video_job`. Menghapus media
yang dipakai clip akan menghapus baris clip juga (aman, tidak ada job
broken).

---

## 9. Render Carousel (Modal.com — Pillow, app terpisah)

Carousel generator (`/carousel-generator`) membuat outline slide via AI,
lalu merender setiap slide jadi gambar (Pillow) di Modal — **app terpisah**
dari render video: `sahabatkreator-carousel` (Pillow-only, ringan) vs
`sahabatkreator-render` (ffmpeg + Whisper, §8). Keduanya memakai **secret
`MODAL_TOKEN` yang sama**, tapi URL berbeda dan dua fitur independen —
carousel bisa aktif tanpa render video atau sebaliknya.

Detail arsitektur: [docs/rfc-carousel-render.md](rfc-carousel-render.md).

### 9.1 Komponen & alur data

```
/carousel-generator → POST /carousel (API Hono)
   → carousel_job (DB, status=queued) + carousel_job_slide (teks per slide)
   → worker: resolve background (solid | stock Pixabay | media library)
       [+ AI Visual Layout Director bila toggle on → carousel_job_slide.layout]
       → presigned R2 PUT per slide → Modal POST /carousel (Bearer MODAL_TOKEN)
           (Pillow: 4 style × 3 rasio, auto-shrink, font bundle OFL)
       → upload JPEG → insert media per slide (type=image, source/credit)
   → carousel_job status=done
   → export tambahan per target platform:
       Facebook  → attached_media multi-photo (di compose, bukan di sini)
       LinkedIn  → PDF document post (export ulang exportFormat=pdf)
       TikTok/YT → MP4 slideshow (POST /slideshow di app render §8, ffmpeg xfade)
```

Aplikasi terkait:
- `apps/render-modal/src/sk_carousel.py` — Pillow renderer di Modal (§9.3).
- `apps/render-modal/src/sk_render.py` — endpoint `POST /slideshow` (fase 3,
  butuh ffmpeg → deploy ke app **render**, bukan app carousel).
- `packages/render/src/carousel.ts` — `ModalCarouselAdapter`.
- `packages/queue/src/carousel-processor.ts` — claim job, stock, layout, export.
- `packages/queue/src/stock.ts` — Pixabay source (download → R2, no hotlink).
- `apps/web/src/pages/dashboard/carousel-generator.tsx` — UI + polling 2s.

### 9.2 Env yang dibutuhkan (`.env.prod`)

| Variabel | Isi |
|---|---|
| `R2_*` | Wajib — slide + stock pool lewat presigned URL R2 |
| `MODAL_TOKEN` | Bearer secret bersama (sama dengan §8.3) |
| `MODAL_CAROUSEL_URL` | URL output `modal deploy` app **carousel** |
| `PIXABAY_KEY` | API key Pixabay — untuk `backgroundMode: "stock"`. Kosong = mode stock nonaktif (mode `library`/`solid` tetap jalan) |
| `OPENROUTER_API_KEY` | Hanya untuk toggle AI Visual Layout Director (opsional) |

Kosongnya `MODAL_CAROUSEL_URL`/`MODAL_TOKEN` **bukan crash**: route `/carousel`
menjawab 503 yang jelas dan worker skip queue (graceful degrade, pola sama
dengan §8.2). `PIXABAY_KEY` dan `OPENROUTER_API_KEY` opsional — masing-masing
hanya mematikan satu fitur (stock background / layout director), render slide
dengan background solid atau media library tetap berfungsi penuh.

> ⚠️ Footgun env sama dengan §8.2: tulis tanpa spasi setelah `=`.

### 9.3 Deploy Modal function carousel

```bash
# Di mesin lokal (bukan server VPS). Secret MODAL_TOKEN sudah ada (§8.3).
cd apps/render-modal
MODAL_PROFILE=primary modal deploy src/sk_carousel.py   # → MODAL_CAROUSEL_URL
```

Tidak perlu `modal token new`/`modal secret create` lagi — app baru memakai
secret `sk-render-auth` yang sama di akun `primary`. Salin URL ke
`MODAL_CAROUSEL_URL` di `.env.prod`, lalu recreate worker:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate worker
```

Verifikasi (URL dari output deploy):

```bash
curl -H "Authorization: Bearer $MODAL_TOKEN" \
  https://<workspace>--sahabatkreator-carousel-web.modal.run/health
# {"status":"ok"}
```

Bila fase 3 (export TikTok/YouTube MP4 slideshow) ingin dipakai, deploy juga
`sk_render.py` (sudah mencakup endpoint `POST /slideshow` baru) — lihat §8.3.

### 9.4 Operasional carousel

```bash
# Job stuck? cek log worker
docker logs sahabatkreator-worker --tail 100 | grep -i carousel

# Cek fitur terkonfigurasi
curl -s https://sahabatkreator.com/carousel | head   # carouselEnabled
```

- Queue `sk_carousel_render` (concurrency 4, attempts 3) + fallback DB-polling
  tiap 20s (worker tetap memproses job `queued` walau BullMQ bermasalah).
- Stock Pixabay: **wajib download ke R2 dulu** (ToS melarang hotlink), lalu
  media row per org. Credit fotografer di-append ke **caption**, bukan di
  slide. Dedup global per Pixabay image id.
- AI Visual Layout Director (opt-in): 1 call multimodal OpenRouter untuk
  **semua** background sekaligus (bukan per-slide), cache Redis 30 hari.
  Gagal/quota habis → fallback template center; **render tidak pernah
  diblokir**. Biaya kredit: `carousel_layout` = 2 per job.
- Export TikTok/YouTube MP4 slideshow bersifat **best-effort**: kegagalan
  export tidak membatalkan carousel job — slide JPEG tetap tersedia di media
  library untuk upload manual.
- Biaya acuan: Pillow ringan, 0.5 core/1 GiB, ~2–5 d per job ≈ **<$0.0001**.

### 9.5 Rollback / catatan skema carousel

Migrasi: `0005_carousel_render.sql` (`carousel_job` + `carousel_job_slide` +
kolom `media.source`/`media.credit`). Seperti §8.6, `drizzle-kit push --force`
yang mensinkronkan skema — migration file tercatat saja.

`carousel_job_slide` berm FK cascade; menghapus media stock yang dipakai slide
akan menghapus baris slide terkait (tidak ada job broken).

---

## 10. Auto-Clip (Modal.com — app ketiga, akun kedua)

Auto-clip (`/auto-clip`) memotong video panjang (podcast, talk, vlog) jadi
kandidat klip pendek: transkripsi penuh di Modal, lalu OpenRouter memilih
momen dengan `viral_score`; user memilih kandidat yang akan dirender
(fan-out ke job render biasa §8 — invariant "1 job = 1 output" tetap).

Detail arsitektur: [docs/rfc-auto-clip.md](rfc-auto-clip.md).

**Mengapa app + akun terpisah:** quota concurrency Modal Starter = 100
container per workspace. Transkripsi clipper (1 container/job, 2–8 menit)
bisa menghabiskan seluruh quota dan mengelaparkan job render yang customer
tunggu untuk publish. Karena itu `sahabatkreator-clipper` dideploy ke
**akun Modal kedua** (URL + token sendiri, RFC §4).

### 10.1 Komponen & alur data

```
/auto-clip → POST /auto-clip (API Hono)
   → media row placeholder + video_job (mode=auto_clip, status=queued)
       + enqueue queue sk_auto_clip
   → worker: resolve source (media library presigned GET | URL T1/T2)
       → presigned R2 PUT (sourceUploadUrl + SRT)
       → Modal app clipper POST /ingest (Bearer MODAL_CLIPPER_TOKEN)
           download source → ffprobe → upload source ke R2 (materialisasi)
           → faster-whisper → SRT → upload R2
   → worker: baca SRT → OpenRouter text-only (JSON array, parse defensif)
       → filter durasi + rentang eksplisit + anti-overlap
       → bulk insert video_job_segment (status=pending)
   → video_job status=done
   → user centang kandidat → POST /auto-clip/:id/select
       → fan-out: segment status=selected → child video_job (mode=single,
           videoProcessing.trimStart/trimEnd) → queue sk_video_render (§8)
           → segment status=rendered oleh render-processor hook
   → klip jadi ada di media library + galeri /renders
```

Aplikasi terkait:
- `apps/render-modal/src/sk_clipper.py` — ingest di Modal, akun kedua (§10.3).
- `packages/render/src/clipper.ts` — `ModalClipperAdapter` (+ `clipper-types.ts`).
- `packages/queue/src/auto-clip-processor.ts` — claim, prompt, parse, fan-out.
- `packages/queue/src/auto-clip.ts` — queue `sk_auto_clip` (concurrency 2, attempts 4).
- `apps/server/src/routes/auto-clip.ts` — REST + `POST /:id/select`.
- `apps/web/src/pages/dashboard/auto-clip.tsx` — UI + polling 2s.

> ⚠️ **Isolasi queue:** tabel `video_job` dipakai dua queue
> (`sk_video_render` + `sk_auto_clip`). Claim dan query due-jobs di **kedua**
> processor wajib filter `mode` — tanpa itu fallback loop render bisa klaim
> job analysis dan merender source utuh sebagai video biasa (RFC §6).

### 10.2 Env yang dibutuhkan (`.env.prod`)

| Variabel | Isi |
|---|---|
| `R2_*` | Wajib — source dimaterialkan + SRT + output klip (lewat §8) |
| `OPENROUTER_API_KEY` | Wajib untuk analisis — tanpa ini job gagal dengan error `ai_not_configured` |
| `MODAL_CLIPPER_URL` | URL output `modal deploy` app clipper (akun kedua) |
| `MODAL_CLIPPER_TOKEN` | Bearer secret app clipper — **nilai beda** dari `MODAL_TOKEN`; fallback ke `MODAL_TOKEN` bila satu akun dirasa cukup |

Kosongnya `MODAL_CLIPPER_URL`/`MODAL_CLIPPER_TOKEN` **bukan crash**: route
`/auto-clip` menjawab 503 yang jelas dan worker skip queue (pola sama
§8.2/§9.2). `OPENROUTER_API_KEY` sudah dipakai fitur AI lain.

> ⚠️ Footgun env sama dengan §8.2: tulis tanpa spasi setelah `=`.

### 10.3 Deploy Modal function clipper (akun kedua)

Modal CLI menyimpan kredensial di `~/.modal.toml` sebagai **profil bernama**
(section `[<nama-profil>]`). Daftarkan kedua akun sekali saja, lalu pilih
akun per perintah dengan `MODAL_PROFILE` — tidak perlu re-login tiap deploy.

**Sekali saja — daftar profil** (token pair dari dashboard Modal:
Settings → API Tokens, bukan `modal token new` — lihat footgun di bawah):

```bash
# cek token sekarang dipakai akun mana (baris "Workspace:" = nama akun)
modal token verify

modal token set --profile primary \
  --token-id <ak-...> --token-secret <as-...>     # akun render + carousel (§8/§9)
modal token set --profile clipper \
  --token-id <ak-...> --token-secret <as-...>     # akun KEDUA (kosong, clipper)
```

**Sekali saja di profil clipper — secret Bearer** (nama SAMA `sk-render-auth`,
tapi akun berbeda → nilai BEDA dari `MODAL_TOKEN` render):

```bash
MODAL_PROFILE=clipper modal secret create sk-render-auth \
  MODAL_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(32))")
```

**Deploy** — profil dipilih per perintah, profil default di `~/.modal.toml`
tidak berubah:

```bash
cd apps/render-modal
MODAL_PROFILE=clipper modal deploy src/sk_clipper.py     # → MODAL_CLIPPER_URL
MODAL_PROFILE=primary  modal deploy src/sk_render.py     # §8.3
MODAL_PROFILE=primary  modal deploy src/sk_carousel.py   # §9.3
```

Salin nilai token secret clipper ke `MODAL_CLIPPER_TOKEN` (**bukan**
`MODAL_TOKEN`) di `.env.prod`, lalu recreate worker:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --force-recreate worker
```

Verifikasi (URL dari output deploy):

```bash
curl -H "Authorization: Bearer $MODAL_CLIPPER_TOKEN" \
  https://<workspace-kedua>--sahabatkreator-clipper-web.modal.run/health
# {"status":"ok","app":"sahabatkreator-clipper"}
```

> ⚠️ **Footgun `modal token new`:** perintah ini **menimpa token profil
> aktif** dengan login browser baru. Kalau profil aktif = `primary`, token
> render/carousel bisa tertimpa tanpa disengaja dan deploy berikutnya
> menghasilkan URL di akun yang salah (bisa tidak disadari sampai worker
> 401). Aturan: pakai `modal token set --profile <nama>` untuk menambah
> akun, `MODAL_PROFILE=<nama> <perintah>` untuk memilih akun per perintah,
> dan `modal token verify` untuk cek akun aktif sebelum setiap deploy.
>
> ⚠️ **Jangan deploy `sk_clipper.py` ke profil `primary`** — mengalahkan
> tujuan isolasi concurrency (RFC §4): quota 100 container jadi dibagi
> analysis clipper, render, dan slideshow publish.

### 10.4 Operasional auto-clip

```bash
# Job analysis stuck? cek log worker
docker logs sahabatkreator-worker --tail 100 | grep -i "auto-clip"

# Cek fitur terkonfigurasi
curl -s https://sahabatkreator.com/auto-clip | head   # clipperEnabled
```

- Queue `sk_auto_clip` (concurrency 2, attempts 4, backoff 30s) + fallback
  DB-polling tiap 30s (pola §9.4).
- Source dari URL **dimaterialkan ke R2 saat ingest** — fan-out render job
  mempresign GET `storageKey` biasa, jadi `sk_render.py` tidak tahu soal URL
  input dan job retry kebal terhadap link Drive kedaluwarsa.
- Rentang eksplisit di textarea arah (`2:00-2:50`) dikecualikan dari filter
  durasi dan **dijamin** masuk daftar kandidat (disintesis bila model lupa).
- T3 (platform scraping YouTube/TikTok/IG) **tidak ada kodenya** — ditahan
  total (RFC §2). Hanya URL direct-media (T1) atau Google Drive sendiri (T2).
- Biaya acuan: analysis ≈ $0,037 (whisper `small` + 1 call OpenRouter);
  render klip mengikuti §8 (~$0,005 per menit). Cache Redis
  `sk:auto-clip-analysis:*` TTL 30 hari → source + pengaturan sama tidak
  ditranskripsi ulang.
- AI kredit: `auto_clip_analysis` = 3 per job analysis. Quota billing per
  paket (free/pro/business) **ditunda ke akhir proyek** — konsumsi hanya
  dicatat dulu.

### 10.5 Rollback / catatan skema auto-clip

Migrasi: `0006_auto_clip.sql` (enum `video_job.mode` + tabel
`video_job_segment` + kolom `urlSource`/`urlSourceTier`/`clipSettings`).
Seperti §8.6/§9.5, `drizzle-kit push --force` yang mensinkronkan skema —
migration file tercatat saja.

`video_job_segment` FK cascade ke `video_job`; child render job
(`renderVideoJobId`) **tidak ter-cascade** saat analysis job dihapus —
kandidat yang sudah dirender tetap ada di media library (aman, tidak ada
job broken).

---

## 11. Public API, Webhook Keluar & MCP

Fitur integrasi eksternal: `/v1` (bearer token), webhook keluar, dan server
MCP — dua transport (stdio di mesin pengguna, HTTP di server). RFC lengkap:
[docs/rfc-public-api.md](rfc-public-api.md).

### 11.1 Komponen & alur data

```
klien eksternal (Zapier/Make/dashboard klien/MCP)
  │  Authorization: Bearer sk_live_...   (atau X-API-Key)
  ▼
/v1  ── verifyApiKey ── rate limit 60/menit per key ── plan gate ── scope
  │
  └─ handler = route /api yang SAMA (di-mount ulang lewat allowlist tertutup)

agen AI (Claude Code / Cursor / ChatGPT Responses API)
  │  POST /mcp  Authorization: Bearer sk_live_...
  ▼
/mcp ── verifyApiKey ── envelope limit 120/menit ── plan gate (access)
  │      └─ tools/call → buildToolRequest → Request internal ke /v1 di app
  │         YANG SAMA via app.fetch (tanpa hop jaringan)
  │         → scope + plan gate + kuota + kredit + audit /v1 berlaku utuh
  ▼
hasil tool (JSON-RPC) dikembalikan ke agen

event org (post terbit, render selesai, automation terpicu, ...)
  ▼
emitWebhookEvent ── insert webhook_delivery (dedup unique index)
  ▼
queue sk_webhook_delivery ── POST + HMAC ── endpoint milik org
```

- **Tidak ada layanan/container baru.** `/v1`, `/mcp`, dan webhook delivery
  semuanya hidup di app/worker yang sama.
- **Tidak ada env baru.** `ENCRYPTION_KEY` (sudah wajib) dipakai mengenkripsi
  secret webhook; `REDIS_URL` (sudah ada) mengaktifkan queue BullMQ — tanpa
  Redis, delivery jatuh ke DB-polling tiap 30 detik. `POST /mcp` juga tidak
  membaca env apa pun (auth murni dari API key di DB).
- Env `SERVER_URL` + `SAHABATKREATOR_API_KEY` hanya untuk **klien MCP stdio** di
  mesin pengguna, bukan di server.

### 11.2 Migrasi 0007–0009 (WAJIB sebelum deploy)

Tiga migrasi baru. **Belum di-push ke staging maupun produksi.**

```bash
# Staging dulu (Neon). Jalankan dari packages/db.
cd packages/db
bun ../../node_modules/drizzle-kit/bin.cjs push --force

# Verifikasi tabel benar-benar ada sebelum lanjut ke produksi:
#   render_usage, api_key, webhook_endpoint, webhook_delivery
#   plan.render_credits_per_month (kolom baru)
```

| Migrasi | Tabel / kolom |
|---|---|
| `0007_render_credits.sql` | `render_usage` + `plan.render_credits_per_month` |
| `0008_slow_squadron_supreme.sql` | `api_key` |
| `0009_military_colossus.sql` | `webhook_endpoint`, `webhook_delivery` |

> ⚠️ Catatan sama seperti §8.6/§10.5: `drizzle-kit push --force` dipakai
> karena file migrasi tercatat di journal tapi tidak dijalankan literal.
> Selalu cek dulu di staging.

### 11.3 Seed ulang paket (fitur API + kredit render)

`api_access` / `api_write` / `api_webhook` dan `render_credits_per_month`
berasal dari seed, bukan dari kode.

```bash
bun run db:seed      # idempotent — upsert paket default
```

Setelah seed, verifikasi di `/admin/plans`: Pro punya `api_access`, Bisnis
punya `api_access` + `api_write`, Enterprise punya ketiganya. Definisi paket ada
di `packages/db/scripts/seed.ts`; label & key fitur di
`apps/web/src/lib/feature-catalog.ts`.

### 11.4 Verifikasi

```bash
# 1. Dokumentasi terbuka tanpa token (path spesifik menang atas use("*"))
curl -s https://sahabatkreator.com/v1/openapi.json | head -c 200

# 2. Tanpa token → 401 (bukan 404 — endpoint tidak boleh terpetakan)
curl -s -o /dev/null -w '%{http_code}\n' https://sahabatkreator.com/v1/ping

# 3. Dengan token asli (buat di Settings → API)
curl -s -H "Authorization: Bearer sk_live_..." https://sahabatkreator.com/v1/ping

# 4. Drift spec OpenAPI (jalankan tiap kali skema /v1 berubah)
cd packages/api && bun src/verify-openapi.ts

# 5. MCP remote — handshake (WAJIB kirim Accept, kalau tidak → 406)
curl -s -X POST https://sahabatkreator.com/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer sk_live_...' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  | head -c 200
# → serverInfo.name = "sahabatkreator"

# 6. MCP remote — daftar tool (harus ≤ 14, sesuai scope key)
curl -s -X POST https://sahabatkreator.com/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer sk_live_...' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 7. GET /mcp harus 405 + Allow: POST (bukan SSE yang menggantung di nginx)
curl -s -o /dev/null -w '%{http_code} allow=%header{allow}\n' \
  https://sahabatkreator.com/mcp
```

`GET /v1/ping` mengembalikan `organization`, `key.scopes`, dan `serverTime` —
cara tercepat membuktikan token valid sekaligus melihat scope yang dimilikinya.
Daftar tool yang muncul di langkah 6 **ditentukan oleh scope key** — key
read-only tidak akan melihat tool tulis. Setiap tool di respons itu juga membawa
`title` dan `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`): inilah yang dibaca klien untuk memutuskan apakah tool boleh
dipanggil tanpa konfirmasi, sekaligus syarat direktori Connector Claude
(RFC §7.3). Panduan klien lengkap:
[docs/mcp-remote.md](mcp-remote.md).

### 11.5 Operasional

```bash
# Delivery webhook menumpuk di 'queued'?
#   1. cek worker hidup          → docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f worker
#   2. cek endpoint aktif        → Settings → Webhook (revoked/nonaktif = gagal permanen, tanpa retry)
#   3. tanpa Redis?              → fallback polling jalan tiap 30s (lebih lambat, tetap sampai)

# Webhook gagal terus?
#   status 'failed' + response_body 500 char terakhir tersimpan di webhook_delivery.
#   BullMQ retry 5× (30s → 2m → 8m → 30m → 2j), lalu menyerah.

# Key tidak jalan padahal baru dibuat?
#   - pembuat key sudah dikeluarkan dari org → key mati otomatis (role di-resolve live)
#   - plan turun di bawah api_access → 402, bukan 401
#   - key expired (kalau dibuat dengan expiresInDays) → 401
```

**Yang perlu diingat saat rotasi secret webhook:** PATCH secret langsung
berlaku untuk pengiriman berikutnya. Tidak ada jendela dual-signing — klien
harus siap menerima signature baru segera.

### 11.6 MCP remote (`POST /mcp`)

Agen AI bisa memanggil tool kita tanpa instalasi apa pun lewat endpoint
**Streamable HTTP** di `https://sahabatkreator.com/mcp`. Panduan klien:
[docs/mcp-remote.md](mcp-remote.md).

**Tidak ada yang perlu ditambah saat deploy.** Ringkasnya:

| Aspek | Status |
|---|---|
| Container baru | Tidak — ikut container `app` (§11.1) |
| Env baru | Tidak — auth dari API key di DB |
| Location NGINX baru | Tidak — dilayani `location /` yang sudah ada |
| Migrasi DB | Tidak — pakai tabel `api_key` yang sama |
| Dependency | `@modelcontextprotocol/sdk` (sudah di `bun.lock` + `apps/server`) |

**Rate limit dua lapis** (sengaja, supaya tidak double-charge):

| Lapisan | Batas | Yang dihitung |
|---|---|---|
| Envelope `/mcp` | 120/menit per key | `initialize`, `tools/list`, dll |
| Kuota `/v1` | 60/menit per key | **`tools/call`** (1 call = 1 hit `/v1`) |

`tools/call` **di-skip** dari envelope limiter karena tiap call sudah menagih
kuota `/v1`; kalau ikut dihitung, kapasitas efektif terpotong separuh. Kedua
limit berbentuk JSON-RPC `-32000` saat tercapai, bukan `{message}` biasa.

**Catatan operasional:**

- `GET`/`DELETE /mcp` dibalas **405** (`Allow: POST`). Ini disengaja — transport
  SDK membuka SSE keep-alive yang akan menggantung di belakang nginx.
- Klien **wajib** mengirim `Accept: application/json, text/event-stream`;
  tanpa itu dibalas **406** (perilaku spec MCP, bukan bug).
- Mode **stateless** — tidak ada session store, jadi aman di-scale tanpa
  sticky session.
- Batas praktis: `proxy_read_timeout 120s` > timeout origin Cloudflare free
  (~100s). Tool call yang butuh >100s akan diputus Cloudflare lebih dulu.
- Kalau butuh cek cepat tanpa klien MCP, pakai langkah 5–7 di §11.4.

### 11.7 Catatan skema

- `api_key` menyimpan **hanya SHA-256** token. Tidak ada cara memulihkan token
  yang hilang — user harus rotate.
- `webhook_endpoint.secret_enc` terenkripsi dengan `ENCRYPTION_KEY`. **Ganti
  `ENCRYPTION_KEY` = semua secret webhook (dan kredensial platform lain) tidak
  bisa didekripsi lagi.** Simpan backup seperti catatan di §13.
- `webhook_delivery` belum punya job pembersih — tabel akan tumbuh terus.
  Pantau ukurannya; retensi otomatis masuk daftar keputusan tertunda RFC §14.

---

## 12. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| 502 Bad Gateway | Container app belum sehat / mati | `docker compose --env-file .env.prod -f docker-compose.prod.yml ps`, cek log app, tunggu start_period 20s |
| Container migrate Exit 1 | `POSTGRES_PASSWORD` kosong / container postgres belum sehat | Cek `.env.prod` + `--env-file`, `docker logs <container-migrate>` |
| App connect DB gagal | `DATABASE_URL` tertimpa nilai salah di `.env.prod` | Hapus `DATABASE_URL` dari `.env.prod` — compose yang mengaturnya |
| SSL error dari Cloudflare | Origin cert salah / kadaluarsa | Pastikan `origin.crt`/`origin.key` valid di `/etc/nginx/ssl/`, mode SSL **Full (Strict)** |
| Email verifikasi tidak terkirim | `RESEND_API_KEY` kosong / domain belum diverifikasi | Dashboard Resend → Domain |
| Upload media gagal | R2 kredensial/bucket salah | Cek `R2_*`, test dari Admin Panel |
| Pembayaran lewat sandbox | `SUMOPOD_API_BASE_URL` masih sandbox | Ganti ke `https://api-pay.sumopod.com` + recreate container |
| Koneksi platform tiba-tiba invalid semua | `ENCRYPTION_KEY` berubah | Kembalikan nilai lama — key ini tidak boleh dirotasi sembarangan |
| Google mengindeks staging | — | Sudah dijaga 4 lapis (build guard, seo.ts runtime, middleware Hono, NGINX). Cek `curl -sI https://app.sahabatkreator.com` ada `X-Robots-Tag: noindex` |
| Webhook platform tidak masuk | Cloudflare/firewall blokir atau verify token salah | Cek Admin Panel → log webhook; pastikan callback URL terdaftar di developer console platform |
| `nginx: directive "real_ip_header" is duplicate` | Konflik dengan config aplikasi lain | `sahabatkreator.conf` sudah menaruh `real_ip_header` di dalam server block — jangan pindah ke level http |
| Render gagal / `/video` 503 | `MODAL_TOKEN`/`MODAL_RENDER_URL` kosong atau ada spasi setelah `=` | Cek `.env.prod` (§8.2); pastikan Modal function sudah deploy (§8.3) |
| `/renders` kosong / "tidak dapat memuat manifest" | dulu = CORS R2 / `renders.json` publik; sekarang = belum ada job opt-in publish | Toggle "Publikasikan ke galeri" di riwayat job done; manifest dibangun dari DB via `GET /renders/manifest` (auth) |
| Job render `failed` setelah ±20 menit | Modal timeout (pipeline sync) | Terminal — user render ulang via UI; cek log worker untuk error code |
| `bun: command not found` di server | Bun hanya ada di dalam container | Pakai `docker compose … exec app bun …` (§8.4), jangan `bun` langsung di host |
| Carousel gagal / `/carousel` 503 | `MODAL_TOKEN`/`MODAL_CAROUSEL_URL` kosong atau ada spasi setelah `=` | Cek `.env.prod` (§9.2); pastikan app `sahabatkreator-carousel` sudah deploy (§9.3) — app ini **berbeda** dengan app render video |
| Mode "stock background" carousel 503 | `PIXABAY_KEY` kosong / rate limit Pixabay | Mode stock opsional — pakai `library`/`solid` sementara; isi `PIXABAY_KEY` untuk reaktifkan |
| Slide ter-render tapi teks menutupi wajah gambar | AI Visual Layout Director tidak aktif/gagal | Toggle "AI Visual Layout" aktif? Gagal = fallback template center (by design, render tidak diblokir); cek `OPENROUTER_API_KEY` + log worker |
| Carousel done tapi tidak ada MP4 untuk TikTok/YT | Export slideshow gagal (app render belum dideploy / ffmpeg) | Best-effort — slide JPEG tetap ada di media library; deploy `sk_render.py` (§9.3) untuk `POST /slideshow` |
| Auto-clip gagal / `/auto-clip` 503 | `MODAL_CLIPPER_URL`/`MODAL_CLIPPER_TOKEN` kosong atau ada spasi setelah `=` | Cek `.env.prod` (§10.2); pastikan app `sahabatkreator-clipper` sudah dideploy ke **akun kedua** (§10.3) |
| Worker 401 / "Unauthorized" padahal URL terisi | `sk_clipper.py` terlanjur dideploy ke profil `primary`, atau `modal token new` menimpa token profil utama | `modal token verify` cek akun aktif; redeploy dengan `MODAL_PROFILE=clipper` (§10.3); pastikan `MODAL_CLIPPER_TOKEN` cocok dengan secret di akun kedua |
| Job analysis `failed` `[ai_not_configured]` | `OPENROUTER_API_KEY` kosong | Isi kunci; job bisa diulang via tombol "Coba lagi" (source sudah ter-materialisasi di R2, tidak download ulang) |
| Kandidat terpilih tapi klip tidak muncul di media library | Fan-out child job render gagal (§8) | Kandidat tidak bisa dipilih ulang jika sudah `rendered`; cek job render anak via riwayat `/video` — pola troubleshooting §8.5 |
| `/mcp` balas **406 Not Acceptable** | Klien tidak mengirim header `Accept` | Kirim `Accept: application/json, text/event-stream` — wajib oleh spec MCP, bukan bug server (§11.6) |
| `/mcp` balas **405** | Klien memakai `GET` (biasanya untuk SSE) | Server ini stateless & JSON-only — pakai `POST`. `GET` memang ditolak (§11.6) |
| `/mcp` balas **429** berbentuk `-32000` | Kena envelope limit 120/menit per key | Tunggu 1 menit atau pakai key lain; `tools/call` sendiri dibatasi kuota `/v1` 60/menit (§11.6) |
| Tool tidak muncul di `tools/list` | Scope key kurang | Cek scope di Settings → API; daftar tool difilter per scope (§11.4 langkah 6) |
| `/mcp` 404 di **dev** padahal prod jalan | Vite dev tidak mem-proxy `/mcp` | Sudah ada di entri regex `apps/web/vite.config.ts`; kalau hilang, path jatuh ke fallback SPA → halaman 404 palsu |
| Boot server gagal `Cannot find package '@modelcontextprotocol/sdk'` | SDK ter-external dari bundle tsdown | Pastikan ia ada di `dependencies` `apps/server/package.json` dan `node_modules` ikut ter-copy ke image (bukan devDependency) |

---

## 13. Checklist Go-Live

- [x] DNS Cloudflare aktif (apex, www, app) + proxy on + Full (Strict)
- [x] `origin.crt` / `origin.key` terpasang di `/etc/nginx/ssl/`
- [x] `.env.prod` lengkap: POSTGRES_PASSWORD, BETTER_AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET, Resend, R2, Sumopod **produksi**
- [ ] `docker compose --env-file .env.prod -f docker-compose.prod.yml ps` semua healthy
- [ ] Backup DB berjalan (pg_dump harian via cron — data ada di volume `postgres_data`, tidak ada backup provider)
- [ ] `/health` balas OK
- [ ] Register + login + verifikasi email berfungsi
- [ ] `robots.txt` indexable, `sitemap.xml` accessible
- [ ] `ENCRYPTION_KEY` disimpan backup aman (password manager) — wajib sama selamanya
- [ ] Backup `.env.prod` disimpan aman (tidak di repo)
- [ ] Staging deploy + noindex terverifikasi
- [ ] Setelah semua: submit sitemap ke Google Search Console
- [ ] Kredensial platform diisi via Admin Panel → Kredensial Platform
- [ ] Pengajuan akses API social platform (Meta / TikTok / LinkedIn / dll.) sudah diajukan & disetujui
- [x] (Bila fitur render aktif) Modal function terdeploy + `MODAL_TOKEN`/`MODAL_RENDER_URL` terisi, `/video` jawab `renderEnabled: true` (§8)
- [ ] (Bila fitur carousel aktif) app `sahabatkreator-carousel` terdeploy + `MODAL_CAROUSEL_URL` terisi, `/carousel` jawab `carouselEnabled: true` (§9); `PIXABAY_KEY` untuk mode stock (opsional)
- [ ] (Bila fitur auto-clip aktif) app `sahabatkreator-clipper` terdeploy ke **akun Modal kedua** + `MODAL_CLIPPER_URL`/`MODAL_CLIPPER_TOKEN` terisi, `/auto-clip` jawab `clipperEnabled: true` (§10); `OPENROUTER_API_KEY` wajib untuk analysis
- [ ] Migrasi `0007`–`0009` sudah di-push ke staging **dan** produksi (§11.2)
- [ ] `bun run db:seed` dijalankan → Pro punya `api_access`, Bisnis + `api_write`, Enterprise + `api_webhook` (§11.3)
- [ ] `/v1/openapi.json` terbuka tanpa token; `/v1/ping` tanpa token balas **401** (bukan 404) (§11.4)
- [ ] (Bila webhook aktif) worker log bersih + delivery pertama berstatus `delivered` (§11.5)
- [ ] MCP remote: handshake `POST /mcp` balas `serverInfo.name = "sahabatkreator"`; `GET /mcp` balas **405** + `Allow: POST` (§11.4 langkah 5–7)
- [ ] `sahabatkreator.conf` versi terbaru terpasang di server (`nginx -t` lalu reload) — wajib kalau conf berubah
- [ ] Image baru ter-build dari `bun.lock` yang **sinkron** dengan `package.json` (`--frozen-lockfile` gagal kalau drift)

---

## 14. Referensi File

| File | Peran |
|---|---|
| [Dockerfile](../Dockerfile) | Build image tunggal (deps → build web+server → runtime non-root) |
| [docker-compose.prod.yml](../docker-compose.prod.yml) | Orkestrasi produksi (redis, migrate, app :3001, worker) |
| [docker-compose.staging.yml](../docker-compose.staging.yml) | Orkestrasi staging (app :3002) |
| [sahabatkreator.conf](../sahabatkreator.conf) | NGINX host-level + Cloudflare real IP + noindex staging |
| [.env.prod.example](../.env.prod.example) | Template env produksi |
| [.env.staging.example](../.env.staging.example) | Template env staging |
| [docs/rfc-video-render.md](rfc-video-render.md) | RFC fitur render (arsitektur, kenapa di luar server, biaya) |
| [docs/rfc-carousel-render.md](rfc-carousel-render.md) | RFC fitur carousel render (fase, stock sourcing, export multi-platform) |
| [docs/rfc-auto-clip.md](rfc-auto-clip.md) | RFC fitur auto-clip (seleksi momen, tiering URL T1/T2, alasan akun Modal kedua) |
| [docs/rfc-public-api.md](rfc-public-api.md) | RFC Public API v1, API key, webhook keluar & server MCP (scope, signing, pool quota) |
| [docs/mcp-remote.md](mcp-remote.md) | Pakai MCP remote `POST /mcp` dari agen AI (setup klien, rate limit, batasan) |
| [docs/api-public-quickstart.md](api-public-quickstart.md) | Panduan cepat pemakaian `/v1` (auth, endpoint, webhook, verifikasi signature) |
| [apps/mcp/README.md](../apps/mcp/README.md) | Server MCP **stdio** — dijalankan di mesin pengguna (bukan di server) |
| [apps/render-modal/README.md](../apps/render-modal/README.md) | Deploy Modal function (ffmpeg + Whisper) |
