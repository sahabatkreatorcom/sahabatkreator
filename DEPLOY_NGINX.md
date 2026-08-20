# Panduan Deploy Sahabat Kreator ke VPS (nginx)

Panduan ini menjelaskan cara deploy Sahabat Kreator di VPS yang sudah menjalankan nginx (bukan Caddy). Cocok untuk server yang sudah ada aplikasi lain (contoh: toeflynk) dan ingin berbagi nginx + Cloudflare SSL.

---

## Prasyarat

- VPS Ubuntu dengan `docker`, `docker compose v2`, `nginx` terinstall
- Domain `sahabatkreator.com` (atau subdomain) sudah diarahkan A record ke IP VPS
- Cloudflare account dengan SSL mode = **Full** atau **Full (strict)**
- Sertifikat origin Cloudflare (`origin.crt` + `origin.key`) tersedia di `/etc/nginx/ssl/sahabatkreator/`
  > Cara generate: Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate → download bundle

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

## Langkah 3 — Buat Sertifikat Nginx

```bash
sudo mkdir -p /etc/nginx/ssl/sahabatkreator
sudo tee /etc/nginx/ssl/sahabatkreator/origin.crt > /dev/null <<'EOF'
<tempel isi origin.crt dari Cloudflare>
EOF
sudo tee /etc/nginx/ssl/sahabatkreator/origin.key > /dev/null <<'EOF'
<tempel isi origin.key dari Cloudflare>
EOF
sudo chmod 600 /etc/nginx/ssl/sahabatkreator/*
```

## Langkah 4 — Konfigurasi nginx

Buat file `/etc/nginx/sites-available/sahabatkreator`:

```nginx
upstream sahabatkreator {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name sahabatkreator.com www.sahabatkreator.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sahabatkreator.com www.sahabatkreator.com;

    # Cloudflare Origin Certificate
    ssl_certificate     /etc/nginx/ssl/sahabatkreator/origin.crt;
    ssl_certificate_key /etc/nginx/ssl/sahabatkreator/origin.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Trust Cloudflare IPs
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    real_ip_header CF-Connecting-IP;

    # Timeout cukup panjang untuk SEB report generation (maxDuration 300s)
    proxy_read_timeout 320s;
    proxy_send_timeout 320s;

    location / {
        proxy_pass http://sahabatkreator;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

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
