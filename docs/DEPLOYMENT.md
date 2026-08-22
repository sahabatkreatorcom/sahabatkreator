# Deployment Produksi (VPS Docker)

Panduan men-deploy **Caddy (SSL) + postgres + web + media worker + Redis (job queue)** di VPS dengan Docker Compose.

## Arsitektur Deployment

```
Internet
   │  (80/443 — satu-satunya port publik)
   ▼
VPS
├── caddy    : reverse proxy + SSL otomatis (Let's Encrypt) — HTTP→HTTPS, proxy ke web
├── postgres : Postgres 16 (persistent volume) — database utama (TIDAK ter-expose publik)
├── migrate  : sekali-jalan — migrasi Drizzle sebelum web/worker start
├── redis    : Redis 7 (AOF) — backbone BullMQ job queue
├── web      : Next.js (standalone) — UI + API + BullMQ worker (in-process via instrumentation)
└── worker   : Node/tsx + ffmpeg — frame extraction & transcode video
```

- **Caddy** satu-satunya service yang membuka port publik (80/443); otomatis minta sertifikat
  Let's Encrypt untuk `DOMAIN`, redirect HTTP→HTTPS, dan proxy ke `web:3000`.
- **postgres** menyimpan data di volume `postgres-data` (survive restart); tidak diekspos ke host.
- **migrate** menjalankan `pnpm db:migrate` sekali; web & worker menunggu `service_completed_successfully`.
- **Web** menjalankan BullMQ worker di proses yang sama (via `src/instrumentation.ts`).
  Dengan Redis, publish terjadwal dieksekusi presisi tanpa perlu cron per-menit.
- **Worker** hanya untuk media (ffmpeg); tidak membutuhkan Redis.

## 0. Fresh VPS — Langkah Demi Langkah

Dilakukan **sekali** saat VPS baru (Ubuntu 22.04/24.04, 2 core / 4 GB). Jalankan sebagai user dengan `sudo`.

**Langkah 0.1 — Update sistem + install Docker**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
Verifikasi: `docker --version` dan `docker compose version` (harus ada output versi).

**Langkah 0.2 — Aktifkan swap 2 GB** (jaring pengaman ffmpeg)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
Verifikasi: `free -h` → kolom `Swap` menunjukkan `2.0Gi`.

**Langkah 0.3 — Firewall** (hanya 22, 80, 443)
```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```
Verifikasi: `sudo ufw status verbose` → 22, 80, 443 `ALLOW`, state `active`.

**Langkah 0.4 — DNS** (di panel registrar/Cloudflare)
- Buat **A record** `@` dan `www` → IP VPS Anda.
- Tunggu propagate (cek: `dig +short domain-anda.com` dari laptop → IP VPS).
- **Mulai dengan DNS only (grey cloud)** dulu — biarkan Caddy meng-issue sertifikat
  sebelum mengaktifkan proxied. Detail di bagian **2.1 Cloudflare**.

**Langkah 0.5 — Clone repo + siapkan .env**
```bash
cd /opt
sudo git clone <url-repo> sahabat-kreator
sudo chown -R $USER:$USER sahabat-kreator
cd sahabat-kreator
cp .env.example .env
nano .env   # isi DOMAIN + semua secret (lihat bagian 1)
```

**Langkah 0.6 — Build & jalankan**
```bash
docker compose up -d --build
```
Verifikasi (tunggu 1–2 menit, build pertama lama):
```bash
docker compose ps              # semua service "Up" (migrate harus "Exited (0)")
docker compose logs web | tail -20   # cari "[queue-worker]" aktif
curl -I https://domain-anda.com      # 200/301 + sertifikat valid
```
- Akses `https://domain-anda.com` → halaman landing muncul.
- Login → buat akun → coba upload video di `/dashboard/media` → dalam ~1 menit `thumbnail` + `transcodedUrl` terisi (log `[worker] done ...`).

**Langkah 0.7 — Update & maintenance**
```bash
cd /opt/sahabat-kreator
git pull
docker compose up -d --build
docker image prune -f          # bersihkan image lama
```

## 1. Persiapkan Env

Salin dari template dan isi semua nilai:

```bash
cp .env.example .env   # lalu isi
```

`docker-compose.yml` membaca file `.env` di direktori yang sama.

Minimal yang wajib:

```env
# Domain — WAJIB, untuk Caddy SSL (arahkan DNS A record ke IP VPS)
DOMAIN=domain-anda.com

# Postgres (service docker) — jangan gunakan sslmode (container lokal tanpa TLS)
POSTGRES_USER=sahabat
POSTGRES_PASSWORD=<acak-kuat>
POSTGRES_DB=sahabat
DATABASE_URL=postgres://sahabat:<password>@postgres:5432/sahabat

BETTER_AUTH_SECRET=panjang-minimal-32-karakter-...
BETTER_AUTH_URL=https://domain-anda.com
CORS_ORIGIN=https://domain-anda.com
NEXT_PUBLIC_APP_URL=https://domain-anda.com
ENCRYPTION_KEY=<base64 32-byte>   # WAJIB di production
CRON_SECRET=<acak-panjang>        # WAJIB di production
REDIS_URL=redis://redis:6379      # dipakai compose (service redis)
```

> **Bila memakai DB eksternal (Neon/Supabase)** di produksi: ganti `DATABASE_URL` ke URL penyedia
> (sertakan `?sslmode=require` untuk Neon), **nonaktifkan service `postgres`** di `docker-compose.yml`,
> dan matikan `migrate` (jalankan `pnpm db:migrate` manual dari host).

Opsional sesuai fitur: `RESEND_API_KEY`, `OPENROUTER_API_KEY`, `R2_*`,
`PIXABAY/PEXELS/UNSPLASH_API_KEY`, kredensial OAuth platform, `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, dll.
> **SumoPod** dikonfigurasi di tabel `global_integration_settings` (admin panel), bukan env.

> **ENCRYPTION_KEY**: `openssl rand -base64 32`. Set sekali, jangan diubah — token sosial yang
> terenkripsi dengan key lama tidak bisa didekripsi setelah key berganti.

## 2. DNS & SSL

1. Di registrar DNS, buat **A record** `domain-anda.com` (dan `www` bila mau) → **IP VPS**.
2. Pastikan port **80 & 443** terbuka di firewall VPS.
3. Saat `docker compose up`, **Caddy** otomatis meminta & memperbarui sertifikat
   Let's Encrypt untuk `DOMAIN` (berlangsung beberapa detik). Tidak perlu mengelola sertifikat manual.

### 2.1 Cloudflare (proxied + SSL Full strict)

Mode yang terverifikasi di produksi (`sahabatkreator.com`):

- **DNS → A record → Proxied (orange cloud)** untuk `@` dan `www`.
- **SSL/TLS → Overview → Full (strict)** — aman dipakai selama Caddy punya sertifikat Let's Encrypt valid untuk domain.

Caddyfile melayani apex dan `www`: `www.{$DOMAIN}` di-redirect permanen ke `https://{$DOMAIN}`,
dan Caddy otomatis menerbitkan sertifikat Let's Encrypt untuk keduanya.

Catatan penting:

- **Jangan aktifkan "Always Use HTTPS"** di Cloudflare Edge Certificates — bisa membuat HTTP-01 challenge renew Let's Encrypt gagal (Cloudflare redirect http→https sebelum challenge sampai ke Caddy). Caddy sendiri sudah mengecualikan `/.well-known/acme-challenge` dari redirect.
- Renewal otomatis (~60 hari) tetap jalan lewat proxied selama path challenge tembus. Bila suatu saat `sudo docker compose logs caddy` menampilkan error acme:
  - Solusi cepat: **DNS only (grey cloud)** sementara 5 menit → cert renew → proxied lagi.
  - Solusi permanen: pasang **Cloudflare Origin CA cert** di Caddy (renew internal, tak bergantung HTTP-01).
- Urutan yang direkomendasikan saat setup awal: biarkan **DNS only** dulu sampai Caddy sukses meng-issue sertifikat, baru aktifkan **Proxied + Full (strict)**. Mengaktifkan proxied sebelum sertifikat origin ada akan menghasilkan **HTTP 522** (origin tak terjangkau/valid).

## 3. Build & Jalankan

```bash
docker compose up -d --build
```

- Akses via `https://domain-anda.com` (HTTP di-redirect otomatis ke HTTPS oleh Caddy).
- Postgres mulai + healthy → `migrate` jalan → baru web & worker start.
- Healthcheck web memanggil `/api/health` yang **mengecek koneksi DB** (503 bila DB mati).
- Caddy menunggu web healthy sebelum menerima trafik (`depends_on: condition: service_healthy`).

### Konfigurasi hemat RAM (VPS 2 core / 4 GB)

Stack idle butuh ~1–1.3 GB; puncak terbesar datang dari **ffmpeg saat transcode video**
(bisa 0.5–1.5 GB per proses). Default di `.env.example` & compose sudah dioptimalkan:

| Variabel | Default | Keterangan |
|---|---|---|
| `WORKER_BATCH_SIZE` | `1` | hanya 1 video diproses per siklus |
| `WORKER_POLL_INTERVAL_MS` | `15000` | jeda 15 detik antar batch |
| `WORKER_MAX_VIDEO_BYTES` | `104857600` (100 MB) | video **lebih besar hanya dibuat poster** (tanpa transcode) — status `LIMITED` |
| `WORKER_ENABLE_TRANSCODE` | `true` | set `false` untuk skip transcode total (paling hemat RAM) |

Kalau sering publish video sekaligus, turunkan concurrency BullMQ `publishWorker`/
`syncWorker` di `apps/web/src/lib/queue-worker.ts` (default sudah `1` untuk keduanya).

## 4. Migrasi Database

**Otomatis** via service `migrate` saat `docker compose up`. Bila perlu manual (dari host):

```bash
pnpm db:migrate
```

Atau bila migrasi belum dijalankan dan DB kosong:

```bash
pnpm db:push
```

> Migrasi bersifat idempoten via Drizzle journal. Verifikasi jumlah tabel = 82.
> **Penting**: jangan apply squash `0000_adorable_madame_web.sql` ke DB yang sudah migrate
> dengan versi file lama (konflik CREATE TABLE). Postgres Docker baru (kosong) aman.

## 5. Scheduler (opsional tapi disarankan)

Dengan Redis + BullMQ aktif, publish terjadwal dikerjakan worker tanpa cron. Namun tetap
sediakan cron sebagai **safety-net** dan untuk sinkronisasi berkala:

| Endpoint | Header | Fungsi |
|----------|--------|--------|
| `POST /api/cron/publish` | `Authorization: Bearer <CRON_SECRET>` | Publish post SCHEDULED jatuh tempo (fallback bila Redis mati) |
| `POST /api/cron/billing` | `Authorization: Bearer <CRON_SECRET>` | Turunkan org ke FREE bila `currentPeriodEnd` lewat |
| `POST /api/analytics/sync` | `Authorization: Bearer <CRON_SECRET>` + `x-organization-id: <orgId>` | Sinkronkan metrik analytics org |
| `POST /api/inbox/sync` | `Authorization: Bearer <CRON_SECRET>` + `x-organization-id: <orgId>` | Sinkronkan komentar org |

Contoh crontab (per menit untuk publish, per jam untuk sync & billing):

```cron
* * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://domain/api/cron/publish
0 * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://domain/api/cron/billing
0 * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" -H "x-organization-id: <orgId>" https://domain/api/analytics/sync
0 * * * *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" -H "x-organization-id: <orgId>" https://domain/api/inbox/sync
```

> Semua endpoint cron **fail-closed**: bila `CRON_SECRET` tidak dikonfigurasi, permintaan ditolak 401.

## 6. Job Queue (BullMQ) Detail

- Paket: `packages/queue` — queue `publish-post` dan `sync`.
- Enqueue terjadi otomatis saat post dibuat/dijadwalkan (`lib/posts-service.ts`).
- Worker berjalan di dalam proses web (guard `QUEUE_WORKER_ENABLED !== "false"`).
- Nonaktifkan queue bila tak butuh: set `QUEUE_WORKER_ENABLED=false` dan kosongkan `REDIS_URL`.

### Monitoring BullMQ (opsional)

Dengan BullMQ v5, Bull Board dapat dijalankan terpisah:

```bash
pnpm dlx bull-board@latest
```

## 6b. Pembayaran SumoPod Pay

Pembayaran memakai **SumoPod Pay** (QRIS/VA/e-wallet) — bukan Stripe.

| Item | Detail |
|------|--------|
| Konfigurasi | Isi `sumopod_*` di tabel `global_integration_settings` (via admin panel atau SQL): `sumopod_api_key`, `sumopod_webhook_secret`, `sumopod_webhook_token`, `sumopod_configured=true` |
| Checkout | `POST /api/billing` (auth) → buat payment SumoPod → return `checkoutUrl` → redirect user |
| Webhook | `POST /api/billing/webhook` — verifikasi Svix signature (`svix-id/timestamp/signature`) atau `X-Webhook-Token`, lalu proses `payment.completed/failed/expired` |
| Aktivasi plan | Saat `payment.completed` dengan `metadata.planId` → org tier naik + `subscriptionStatus=active` + `currentPeriodEnd` +1 bulan |
| Set di dashboard SumoPod | Webhook URL → `https://domain-anda.com/api/billing/webhook`; sukses/cancel return → `/dashboard/billing?status=success|cancelled` |

> **Penting**: webhook butuh **raw body**. Jangan parse/ubah whitespace sebelum verifikasi signature.
> Konfigurasi (api key, webhook secret/token) diambil dari `global_integration_settings` di DB — isi via
> admin panel atau SQL. Tidak ada env SumoPod.

## 6c. Webhook Platform Sosial Media

| Platform | Route | Verifikasi | Event → Wire |
|----------|-------|------------|--------------|
| **Instagram** (Meta) | `POST /api/webhooks/instagram` | GET `hub.challenge` + `X-Hub-Signature-256` | `comments` → inbox + auto-reply |
| **Facebook Page** (Meta) | `POST /api/webhooks/facebook` | GET `hub.challenge` + `X-Hub-Signature-256` | `comments`/`mentions` → inbox |
| **Threads** (Meta) | `POST /api/webhooks/threads` | GET `hub.challenge` + `X-Hub-Signature-256` | `threads_replies` → inbox |
| **TikTok** | `POST /api/webhooks/tiktok` | GET `challenge_code` + `X-TikTok-Signature` (t=,s=, freshness 5m) | `post.publish.complete/fail` → status post |
| **YouTube** | `POST /api/webhooks/youtube` | GET `hub.challenge` (PubSubHubbub) | feed video baru → aktivitas org |

Secret webhook (App Secret, verify token, client secret) DIUTAMAKAN diambil dari
DB `global_platform_credential` — isi via **Admin Panel → Platform Credentials**
(`/admin/platforms`), dienkripsi (`ENCRYPTION_KEY`). Env (`META_APP_SECRET`,
`WEBHOOK_VERIFY_TOKEN`, `*_CLIENT_SECRET`) hanya fallback untuk dev/single-instance.
Kredensial yang sama dipakai untuk OAuth connect akun.

Setup:
1. Isi kredensial platform di **Admin Panel → Platform Credentials** (atau set env fallback).
2. Daftarkan 3 callback URL Meta di **App Dashboard → Webhooks** (object Instagram, Page, Threads — masing-masing URL sendiri).
3. Daftarkan callback TikTok di developer portal (Content Posting API → Webhook).
4. Subscribe YouTube hub dengan topic `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`.

> **Penting**: Instagram/Facebook/Threads adalah objek webhook Meta yang **terpisah** — jangan gabungkan.
> Signature butuh raw body (jangan parse ulang). Idempotency atomik ditangani `processed_webhook_event`.
> Pinterest/LinkedIn/Google Business tidak punya webhook publik → tetap polling berkala.

## 7. Backup

- **Postgres** (Docker): `pg_dump` harian ke volume/penyimpanan terpisah, mis. cron di host:
  ```bash
  docker exec <postgres-container> pg_dump -U sahabat -Fc sahabat > /backups/db-$(date +%F).dump
  ```
  atau tambah service `backup` di compose (image postgres, `pg_dump` + retensi). Simpan di luar VPS bila memungkinkan.
- **R2**: media tersimpan di bucket R2 — aktifkan Lifecycle/versioning sesuai kebutuhan.
- **Redis**: AOF aktif (`--appendonly yes`). Data queue tidak kritis (job idempoten vs DB).

## 8. Skala

- **Multi-instance web**: aman. BullMQ mendistribusikan job ke worker; hanya satu worker
  memproses satu job (lock Redis). Tambah instance = tambah kapasitas worker publish.
- **R2/media**: tidak stateful di app.
- **Session**: tersimpan di DB (better-auth) — aman di multi-instance.

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| Container web restart-loop | Cek `docker compose logs web`; biasanya env hilang (NEXT_PUBLIC_APP_URL / DATABASE_URL tidak di-ARG build) |
| `/api/health` 503 | DB tidak bisa dijangkau; cek `DATABASE_URL` dan status Postgres |
| Post terjadwal tidak terbit | Pastikan `REDIS_URL` benar dan log `[queue-worker]` muncul; cek fallback cron `/api/cron/publish` |
| Publish gagal `TOKEN_EXPIRED` | Refresh token akun di dashboard Connections |
| `ENCRYPTION_KEY` invalid | Generate ulang base64 32 byte, set sekali, simpan aman |
