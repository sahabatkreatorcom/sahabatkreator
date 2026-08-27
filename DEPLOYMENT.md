# =============================================================================
# Sahabat Kreator — Deployment Guide
# Dual-Domain: sahabatkreator.com (prod) + staging.sahabatkreator.com (staging)
# =============================================================================

## Arsitektur

```
VPS (Ubuntu)
├── toeflynk          (port 3000) — aplikasi lain
│   ├── postgres      (port 5432 internal)
│   └── redis         (port 6379 internal)
│
├── sahabat-prod      (port 3001) — production
│   ├── web           (Next.js)
│   ├── worker        (BullMQ)
│   ├── postgres      (port 5433 internal)
│   └── redis         (port 6380 internal)
│
└── sahabat-staging   (port 3002) — staging
    ├── web           (Next.js)
    ├── worker        (BullMQ)
    └── (database: Neon serverless)
```

## Port Allocation

| Service | Production | Staging | toeflynk |
|---|---|---|---|
| Web (Next.js) | 3001 | 3002 | 3000 |
| PostgreSQL | 5433 | Neon | 5432 |
| Redis | 6380 | - | 6379 |

---

## Prasyarat

- [ ] VPS Ubuntu sudah berjalan
- [ ] Docker & Docker Compose terinstall
- [ ] Nginx terinstall
- [ ] Domain `sahabatkreator.com` pointing ke VPS IP
- [ ] Cloudflare Origin Certificate untuk `*.sahabatkreator.com` + `sahabatkreator.com`
- [ ] Akun Neon (untuk staging database)
- [ ] OAuth credentials untuk semua platform (TikTok, Instagram, Facebook, dll)

---

## 1. Setup VPS

### 1.1 Install Docker & Docker Compose
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add user to docker group (agar tidak perlu sudo)
sudo usermod -aG docker $USER

# Logout dan login lagi, atau jalankan:
newgrp docker

# Verifikasi
docker --version
docker compose version
```

### 1.2 Install Nginx
```bash
sudo apt install nginx -y
sudo systemctl enable nginx
```

### 1.3 Setup Directory
```bash
# Buat directory untuk aplikasi
sudo mkdir -p /opt/sahabatkreator
sudo chown $USER:$USER /opt/sahabatkreator
```

---

## 2. Setup SSL Certificate

### 2.1 Generate Cloudflare Origin Certificate
1. Login ke Cloudflare Dashboard
2. Pilih domain `sahabatkreator.com`
3. SSL/TLS → Origin Server
4. Klik "Create Certificate"
5. Pilih:
   - Generate private key and CSR with Cloudflare
   - Hostnames: `*.sahabatkreator.com` + `sahabatkreator.com`
   - Validity: 15 years (recommended)
6. Klik "Create"
7. Copy **Origin Certificate** dan **Private Key**

### 2.2 Install Certificate di VPS
```bash
# Buat directory
sudo mkdir -p /etc/nginx/ssl/sahabatkreator

# Copy certificate (paste dari Cloudflare)
sudo nano /etc/nginx/ssl/sahabatkreator/origin.crt
# Paste Origin Certificate → Save (Ctrl+O, Ctrl+X)

# Copy private key
sudo nano /etc/nginx/ssl/sahabatkreator/origin.key
# Paste Private Key → Save (Ctrl+O, Ctrl+X)

# Set permissions
sudo chmod 600 /etc/nginx/ssl/sahabatkreator/origin.key
```

---

## 3. Setup Nginx

### 3.1 Copy Nginx Config
```bash
# Dari repo
sudo cp nginx-sahabatkreator.conf /etc/nginx/sites-available/sahabatkreator.conf

# Aktifkan
sudo ln -sf /etc/nginx/sites-available/sahabatkreator.conf /etc/nginx/sites-enabled/

# Hapus config default (opsional)
sudo rm -f /etc/nginx/sites-enabled/default

# Test & reload
sudo nginx -t
sudo systemctl reload nginx
```

### 3.2 Cloudflare SSL Mode
1. Cloudflare Dashboard → SSL/TLS → Overview
2. Set Mode: **Full** atau **Full Strict**
3. **Jangan** pakai "Flexible" (akan loop)

---

## 4. Deploy Production

### 4.1 Clone Repository
```bash
cd /opt/sahabatkreator
git clone https://github.com/sahabatkreatorcom/sahabatkreator.git .
```

### 4.2 Setup Environment
```bash
# Copy template
cp .env.prod .env

# Edit credentials
nano .env
```

**Yang wajib diisi:**
```env
# Domain
DOMAIN=sahabatkreator.com

# Database (ganti password)
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
DATABASE_URL=postgres://sahabat:YOUR_SECURE_PASSWORD@localhost:5433/sahabat

# Auth (generate random string)
BETTER_AUTH_SECRET=YOUR_RANDOM_32_CHARS_MIN
ENCRYPTION_KEY=YOUR_RANDOM_64_HEX_CHARS

# OAuth (dari platform masing-masing)
# Isi TikTok, Instagram, Facebook, YouTube, dll
```

**Generate secrets:**
```bash
# BETTER_AUTH_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY
openssl rand -hex 32
```

### 4.3 Build & Deploy
```bash
# Build dan start semua service
docker compose -f docker-compose.prod.yml up -d --build

# seed
docker compose -f docker-compose.prod.yml run --rm migrate-prod pnpm --filter @sahabat-kreator/db db:seed

# Cek status
docker compose -f docker-compose.prod.yml ps

# Lihat logs
docker compose -f docker-compose.prod.yml logs -f web-prod
```

### 4.4 Verifikasi
```bash
# Cek apakah web berjalan
curl -I http://localhost:3001

# Cek dari luar
curl -I https://sahabatkreator.com
```

---

## 5. Deploy Staging

### 5.1 Setup Nginx untuk Staging
```bash
# Copy config staging
sudo cp nginx-sahabat-staging.conf /etc/nginx/sites-available/sahabat-staging.conf

# Aktifkan
sudo ln -sf /etc/nginx/sites-available/sahabat-staging.conf /etc/nginx/sites-enabled/

# Test & reload
sudo nginx -t
sudo systemctl reload nginx
```

### 5.2 Setup DNS
```
# Cloudflare Dashboard → DNS → Add Record:
# Type: A
# Name: staging
# Content: VPS_IP
# Proxy: Proxied (orange cloud)
```

### 5.3 Setup Environment
```bash
cd /opt/sahabatstaging

# Copy template
cp .env.example .env

# Edit credentials
nano .env
```

**Yang wajib diisi:**
```env
# Domain
DOMAIN=staging.sahabatkreator.com
BETTER_AUTH_URL=https://staging.sahabatkreator.com
CORS_ORIGIN=https://staging.sahabatkreator.com
NEXT_PUBLIC_APP_URL=https://staging.sahabatkreator.com

# Database (Neon)
DATABASE_URL=postgresql://neondb_owner:YOUR_NEON_PASSWORD@ep-xxx.neon.tech/neondb?sslmode=require

# Auth
BETTER_AUTH_SECRET=YOUR_RANDOM_32_CHARS_MIN
ENCRYPTION_KEY=YOUR_RANDOM_64_HEX_CHARS
```

### 5.4 Build & Deploy
```bash
# Build dan start semua service
docker compose -f docker-compose.staging.yml up -d --build

# Cek status
docker compose -f docker-compose.staging.yml ps

# Lihat logs
docker compose -f docker-compose.staging.yml logs -f web-staging
```

### 5.5 Verifikasi
```bash
# Cek dari luar
curl -I https://staging.sahabatkreator.com

# Cek health endpoint
curl -s https://staging.sahabatkreator.com/api/health
```

---

## 6. Setup OAuth Callbacks

### 6.1 Daftar Callback URL di Setiap Platform

| Platform | Production | Staging |
|---|---|---|
| TikTok | `https://sahabatkreator.com/api/accounts/callback/tiktok` | `https://staging.sahabatkreator.com/api/accounts/callback/tiktok` |
| Instagram | `https://sahabatkreator.com/api/accounts/callback/instagram` | `https://staging.sahabatkreator.com/api/accounts/callback/instagram` |
| Facebook | `https://sahabatkreator.com/api/accounts/callback/facebook` | `https://staging.sahabatkreator.com/api/accounts/callback/facebook` |
| YouTube | `https://sahabatkreator.com/api/accounts/callback/youtube` | `https://staging.sahabatkreator.com/api/accounts/callback/youtube` |
| Threads | `https://sahabatkreator.com/api/accounts/callback/threads` | `https://staging.sahabatkreator.com/api/accounts/callback/threads` |
| Pinterest | `https://sahabatkreator.com/api/accounts/callback/pinterest` | `https://staging.sahabatkreator.com/api/accounts/callback/pinterest` |
| LinkedIn | `https://sahabatkreator.com/api/accounts/callback/linkedin` | `https://staging.sahabatkreator.com/api/accounts/callback/linkedin` |

### 6.2 Webhook URLs

| Platform | Production | Staging |
|---|---|---|
| Meta (IG/FB) | `https://sahabatkreator.com/api/webhooks/meta` | `https://staging.sahabatkreator.com/api/webhooks/meta` |
| TikTok | `https://sahabatkreator.com/api/webhooks/tiktok` | `https://staging.sahabatkreator.com/api/webhooks/tiktok` |
| YouTube | `https://sahabatkreator.com/api/webhooks/youtube` | `https://staging.sahabatkreator.com/api/webhooks/youtube` |
| Threads | `https://sahabatkreator.com/api/webhooks/threads` | `https://staging.sahabatkreator.com/api/webhooks/threads` |

---

## 7. Perintah Umum

### Lihat Status
```bash
# Production
docker compose -f docker-compose.prod.yml ps

# Staging
docker compose -f docker-compose.staging.yml ps
```

### Lihat Logs
```bash
# Production - web
docker compose -f docker-compose.prod.yml logs -f web-prod

# Production - worker
docker compose -f docker-compose.prod.yml logs -f worker-prod

# Staging - web
docker compose -f docker-compose.staging.yml logs -f web-staging
```

### Restart Services
```bash
# Restart production
docker compose -f docker-compose.prod.yml restart

# Restart staging
docker compose -f docker-compose.staging.yml restart
```

### Update & Redeploy
```bash
# Pull latest code
git pull

# Rebuild dan restart production
docker compose -f docker-compose.prod.yml up -d --build

# Rebuild dan restart staging
docker compose -f docker-compose.staging.yml up -d --build
```

### Stop Services
```bash
# Stop production
docker compose -f docker-compose.prod.yml down

# Stop staging
docker compose -f docker-compose.staging.yml down
```

### Database Migration
```bash
# Migration jalan otomatis saat deploy
# Tapi kalau perlu jalankan manual:
docker compose -f docker-compose.prod.yml exec migrate-prod pnpm --filter @sahabat-kreator/db db:migrate
```

---

## 8. Troubleshooting

### 8.1 Nginx 502 Bad Gateway
```bash
# Cek apakah container berjalan
docker compose -f docker-compose.prod.yml ps

# Cek port
ss -tlnp | grep 3001

# Cek nginx config
sudo nginx -t
```

### 8.2 Database Connection Failed
```bash
# Cek postgres container
docker compose -f docker-compose.prod.yml logs postgres-prod

# Test connection
docker compose -f docker-compose.prod.yml exec postgres-prod psql -U sahabat -d sahabat
```

### 8.3 Container Tidak Start
```bash
# Lihat logs
docker compose -f docker-compose.prod.yml logs web-prod

# Cek apakah build berhasil
docker compose -f docker-compose.prod.yml build web-prod
```

### 8.4 SSL Certificate Error
```bash
# Cek certificate
sudo openssl x509 -in /etc/nginx/ssl/sahabatkreator/origin.crt -text -noout

# Cek nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 8.5 Staging Mengakses Data Production
Ini terjadi kalau:
1. Database URL staging sama dengan production → cek `.env.staging`
2. Redis URL staging sama dengan production → cek `.env.staging`

---

## 9. Security Checklist

- [ ] `.env` tidak di-commit ke git (sudah ada di `.gitignore`)
- [ ] `BETTER_AUTH_SECRET` minimal 32 karakter
- [ ] `ENCRYPTION_KEY` 64 hex characters
- [ ] PostgreSQL tidak exposed ke publik (hanya localhost)
- [ ] Redis tidak exposed ke publik (hanya localhost)
- [ ] Nginx SSL mode: Full atau Full Strict
- [ ] Cloudflare WAF enabled (opsional)
- [ ] Firewall aktif (ufw)

---

## 10. Backup

### Database Backup (Production)
```bash
# Manual backup
docker compose -f docker-compose.prod.yml exec postgres-prod pg_dump -U sahabat sahabat > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20240101.sql | docker compose -f docker-compose.prod.yml exec -T postgres-prod psql -U sahabat -d sahabat
```

### Automated Backup (Cron)
```bash
# Edit crontab
crontab -e

# Tambah baris ini (backup harian jam 2 AM)
0 2 * * * cd /opt/sahabatkreator && docker compose -f docker-compose.prod.yml exec -T postgres-prod pg_dump -U sahabat sahabat | gzip > /backups/sahabat_$(date +\%Y\%m\%d).sql.gz
```

---

---

## Quick Reference — Nginx Setup

### Production (sahabatkreator.com)
```bash
# Copy config
sudo cp nginx-sahabatkreator.conf /etc/nginx/sites-available/sahabatkreator.conf
sudo ln -sf /etc/nginx/sites-available/sahabatkreator.conf /etc/nginx/sites-enabled/

# Test & reload
sudo nginx -t && sudo systemctl reload nginx
```

### Staging (staging.sahabatkreator.com)
```bash
# Copy config
sudo cp nginx-sahabat-staging.conf /etc/nginx/sites-available/sahabat-staging.conf
sudo ln -sf /etc/nginx/sites-available/sahabat-staging.conf /etc/nginx/sites-enabled/

# Test & reload
sudo nginx -t && sudo systemctl reload nginx
```

### List all sites
```bash
ls -la /etc/nginx/sites-enabled/
```

### Test nginx config
```bash
sudo nginx -t
```

### Reload nginx
```bash
sudo systemctl reload nginx
```

---

## Referensi

- Docker Compose: https://docs.docker.com/compose/
- Nginx: https://nginx.org/en/docs/
- Cloudflare SSL: https://developers.cloudflare.com/ssl/
- Drizzle ORM: https://orm.drizzle.team/
