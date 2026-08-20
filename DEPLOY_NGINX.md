# Panduan Deploy Sahabat Kreator ke VPS (nginx)

Panduan ini menjelaskan cara deploy Sahabat Kreator di VPS yang sudah menjalankan nginx (bukan Caddy). Cocok untuk server yang sudah ada aplikasi lain (contoh: toeflynk) dan ingin berbagi nginx + Cloudflare SSL.

---

## Prasyarat

- VPS Ubuntu dengan `docker`, `docker compose v2`, `nginx` terinstall
- Domain `sahabatkreator.com` (atau subdomain) sudah diarahkan A record ke IP VPS
- Cloudflare account dengan SSL mode = **Flexible** (Cloudflare terminate SSL, koneksi ke origin = HTTP)
- **TIDAK perlu** Cloudflare Origin Certificate — nginx hanya serve HTTP
- Port 80 terbuka di firewall (Cloudflare sudah handle HTTPS)

---

## Langkah 1 — Clone & Persiapan

```bash
ssh ubuntu@<IP_VPS>
cd /opt
git clone https://github.com/<user>/<repo>.git sahabatkreator
cd sahabatkreator
```

## Langkah 2 — Salin & Isi Environment

```bash
cp .env.example .env
nano .env
```

Isi field wajib:

```env
DOMAIN=sahabatkreator.com
DATABASE_URL=postgres://sahabat:<PASSWORD>@postgres:5432/sahabat
BETTER_AUTH_SECRET=<random-32-char>
BETTER_AUTH_URL=https://sahabatkreator.com
CORS_ORIGIN=https://sahabatkreator.com
NEXT_PUBLIC_APP_URL=https://sahabatkreator.com
ENCRYPTION_KEY=<base64-32byte>
RESEND_API_KEY=...
RESEND_FROM_EMAIL=noreply@sahabatkreator.com
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
OPENROUTER_API_KEY=...
```

Generate key:
```bash
openssl rand -base64 32
```

## Langkah 3 — Konfigurasi nginx

Salin config nginx ke server:

```bash
sudo cp nginx-sahabatkreator.conf /etc/nginx/sites-available/sahabatkreator
sudo ln -sf /etc/nginx/sites-available/sahabatkreator /etc/nginx/sites-enabled/
```

Test & reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

> **Catatan:** Config ini menggunakan mode **HTTP** (tanpa SSL). Cloudflare Flexible SSL akan menangani HTTPS di sisi Cloudflare, lalu forward ke origin (nginx) via HTTP.

Symlink ke sites-enabled & test:
```bash
sudo ln -sf /etc/nginx/sites-available/sahabatkreator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Langkah 5 — Deploy

Tidak perlu edit `docker-compose.yml` — sudah tersedia override. Cukup jalankan:

```bash
cd /opt/sahabatkreator
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml ps
```

Verifikasi container web berjalan & expose port:
```bash
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml ps web
# Harus ada baris: "127.0.0.1:3000->3000/tcp"
```

Cek logs:
```bash
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml logs -f web worker
```

Verifikasi endpoint:
```bash
curl -s https://sahabatkreator.com/api/health
# Harusnya: {"ok":true,"db":"healthy","ts":"..."}
```

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Port 80/443 sudah dipakai | Pakai domain/host berbeda atau matikan service lain |
| `docker compose up` fail migrate | Cek `DATABASE_URL` & kredensial postgres |
| Web unhealthy | Cek `docker compose logs web` — mungkin DB belum ready |
| Nginx 502 | Cek `sudo nginx -t` dan `docker compose ps web` |
| SSL error di browser | Pastikan Cloudflare SSL mode = Full/Full strict |
| SEB report timeout | Naikkan `proxy_read_timeout` di nginx conf |

## Maintenance

```bash
cd /opt/sahabatkreator
git pull
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml down
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build
```

---

**Catatan:** Setelah deploy, akses `/admin/platforms` untuk mengisi kredensial OAuth platform (Meta, TikTok, YouTube, dll) dan `/admin/settings` untuk pengaturan lainnya.
