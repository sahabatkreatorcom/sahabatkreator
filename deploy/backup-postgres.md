# Backup otomatis Postgres produksi

Backup harian DB self-hosted PG17 (`postgres_data` volume, service `postgres`
di `docker-compose.prod.yml`) + runbook restore.

## Mengapa ini perlu

Staging pakai Neon (managed, punya backup sendiri). **Produksi self-hosted
PG17 hanya punya satu copy data** di volume Docker `postgres_data`. Volume
melindungi dari restart/recreate container, tapi TIDAK dari:

- kegagalan disk host / VPS hilang,
- `docker volume rm` atau `docker compose down -v` tidak sengaja,
- korupsi logis (query salah, migrasi rusak, `drizzle-kit push --force`
  menulis schema aneh),
- ransomware / kompromi server.

Tanpa backup terjadwal yang terpisah dari host, semua skenario di atas =
hilang seluruh data user tanpa recovery.

## Setup (sekali, di host prod)

```bash
# 1. Salin script (sudah ada di repo: deploy/backup-postgres.sh)
chmod +x deploy/backup-postgres.sh

# 2. Tentukan lokasi backup — WAJIB di luar volume postgres_data.
#    Folder di host yang sama = bagus; disk/NAS lain = lebih bagus.
mkdir -p /var/backups/sahabatkreator

# 3. Tes sekali manual sebelum pasang cron:
sudo ./deploy/backup-postgres.sh
sudo ./deploy/backup-postgres.sh --verify

# 4. Pasang cron (root, supaya docker CLI bisa akses daemon):
sudo crontab -e
```

Isi crontab (backup jam 03:17 — bukan tepat 00:00 supaya tidak berbenturan
dengan job tengah malam lain; pilih jadwal bebas):
```
# Backup DB prod setiap hari + cek backup kemarin
17 3 * * * /path/ke/repo/deploy/backup-postgres.sh >> /var/log/sahabatkreator-backup.log 2>&1
30 3 * * * /path/ke/repo/deploy/backup-postgres.sh --verify >> /var/log/sahabatkreator-backup.log 2>&1
```

**Pasangkan output cron dengan monitoring** (email root, healthchecks.io,
atau Uptime Kuma hook). Cron yang gagal diam-diam adalah cara paling umum
"merasa punya backup" padahal tidak.

## Konfigurasi (env var, semua punya default)

| Var | Default | Keterangan |
|---|---|---|
| `POSTGRES_CONTAINER` | `sahabatkreator-postgres` | nama container compose |
| `POSTGRES_DB` | `sahabatkreator` | nama DB |
| `POSTGRES_USER` | `sahabatkreator` | role untuk `pg_dump` |
| `BACKUP_DIR` | `/var/backups/sahabatkreator` | WAJIB di luar volume DB |
| `RETENTION_DAYS` | `30` | hapus backup lebih lama dari ini |

## Cara pakai

```bash
./deploy/backup-postgres.sh                     # backup sekarang
./deploy/backup-postgres.sh --verify            # validasi backup terbaru
./deploy/backup-postgres.sh --verify /path/file # validasi file tertentu
```

Yang diperiksa mode `--verify`: integritas gzip, ukuran, dan `pg_restore -l`
(membaca catalog archive — membuktikan file bisa dibaca parser Postgres,
bukan cuma byte yang utuh).

## Restore

Format custom (`-Fc`) dipilih supaya bisa restore selektif (satu tabel) atau
full, dengan `pg_restore` di container yang sama.

```bash
# 0. HENTIKAN dulu app yang menulis ke DB (server + worker):
docker compose -f docker-compose.prod.yml stop app worker

# 1. Buat DB target (JANGAN restore ke DB yang masih dipakai langsung —
#    buat DB recovery dulu, verifikasi, baru pindahkan):
docker exec sahabatkreator-postgres psql -U sahabatkreator -d postgres \
  -c "CREATE DATABASE sahabatkreator_restore;"

# 2. Restore file backup ke DB recovery:
gunzip -c /var/backups/sahabatkreator/sahabatkreator-20260101-031700.dump.gz \
  | docker exec -i sahabatkreator-postgres \
    pg_restore -U sahabatkreator -d sahabatkreator_restore --no-owner --clean --if-exists

# 3. Verifikasi (hitung tabel / row penting):
docker exec sahabatkreator-postgres psql -U sahabatkreator -d sahabatkreator_restore \
  -c "\dt"

# 4. Setelah yakin, pindahkan dengan rename (maintenance window):
docker exec sahabatkreator-postgres psql -U sahabatkreator -d postgres <<'SQL'
ALTER DATABASE sahabatkreator RENAME TO sahabatkreator_old;
ALTER DATABASE sahabatkreator_restore RENAME TO sahabatkreator;
SQL

# 5. Jalankan lagi service + cek log:
docker compose -f docker-compose.prod.yml up -d app worker
```

Untuk restore 1 tabel saja:
```bash
gunzip -c <file>.dump.gz | docker exec -i sahabatkreator-postgres \
  pg_restore -U sahabatkreator -d sahabatkreator -t social_account --data-only
```

## Test prosedur (wajib per kuartal)

Backup yang belum pernah di-restore = hipotesis. Lakukan di server staging
atau container lokal:

```bash
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=x postgres:17-alpine
gunzip -c <backup-terbaru>.dump.gz \
  | docker exec -i pg-restore-test pg_restore -U postgres -d postgres --no-owner
docker exec -it pg-restore-test psql -U postgres -d postgres -c "\dt"
docker rm -f pg-restore-test
```

## Offsite copy (Cloudflare R2 via restic) — WAJIB

Backup di host yang sama hancur bersama host. `deploy/backup-postgres-offsite.sh`
mensinkronkan `BACKUP_DIR` ke object storage lewat [restic](https://restic.net):
**enkripsi client-side** (repo tidak bisa dibaca siapa pun yang punya akses
bucket tanpa `RESTIC_PASSWORD`), **dedup** (upload harian murah), **snapshot**
(restore ke titik waktu tertentu).

Repo sudah punya cred R2 (`packages/render` + `apps/server/src/lib/r2.ts`) —
buat bucket terpisah untuk backup (mis. `sahabatkreator-backup`), lalu R2 API
token dengan permission Object Read & Write ke bucket itu.

### Setup (sekali, di host prod)

```bash
# 1. Install restic
apt install -y restic        # Debian/Ubuntu

# 2. Env — simpan di /etc/sahabatkreator/backup.env (chmod 600, root-only)
cat > /etc/sahabatkreator/backup.env <<'EOF'
export RESTIC_REPOSITORY="s3:<accountid>.r2.cloudflarestorage.com/sahabatkreator-backup"
export RESTIC_PASSWORD="<password acak kuat>"
export AWS_ACCESS_KEY_ID="<R2 access key>"
export AWS_SECRET_ACCESS_KEY="<R2 secret>"
export BACKUP_DIR="/var/backups/sahabatkreator"
EOF
chmod 600 /etc/sahabatkreator/backup.env

# 3. Init repo (sekali saja)
set -a && . /etc/sahabatkreator/backup.env && set +a
./deploy/backup-postgres-offsite.sh --init

# 4. Tes sync manual
./deploy/backup-postgres-offsite.sh
./deploy/backup-postgres-offsite.sh --verify
```

### Cron — jalan SETELAH backup lokal

```
# Backup lokal dulu, baru offsite (offsite menolak sync bila backup basah —
# fail-closed, bukan diam-diam mensinkronkan folder kosong)
17 3 * * * /path/ke/repo/deploy/backup-postgres.sh >> /var/log/sahabatkreator-backup.log 2>&1
40 3 * * * . /etc/sahabatkreator/backup.env && /path/ke/repo/deploy/backup-postgres-offsite.sh >> /var/log/sahabatkreator-backup.log 2>&1
# Cek kesehatan repo offsite tiap minggu (restic check bisa lama di repo besar)
15 4 * * 0 . /etc/sahabatkreator/backup.env && /path/ke/repo/deploy/backup-postgres-offsite.sh --verify >> /var/log/sahabatkreator-backup.log 2>&1
```

### Konfigurasi offsite (env var)

| Var | Default | Keterangan |
|---|---|---|
| `RESTIC_REPOSITORY` | — | WAJIB. `s3:<endpoint>/<bucket>` (R2 atau S3-compatible) |
| `RESTIC_PASSWORD` / `_FILE` | — | WAJIB. Kunci enkripsi repo — **hilang = data tidak bisa di-restore** |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | WAJIB untuk backend `s3:*` (R2 API token) |
| `BACKUP_DIR` | `/var/backups/sahabatkreator` | harus sama dengan backup-postgres.sh |
| `RESTIC_KEEP_DAILY` | `30` | simpan N snapshot harian |
| `RESTIC_KEEP_WEEKLY` | `12` | simpan N snapshot mingguan |
| `RESTIC_KEEP_MONTHLY` | `12` | simpan N snapshot bulanan |
| `MAX_BACKUP_AGE_H` | `26` | tolak sync bila backup terbaru lebih tua dari ini (jam) |

### Restore dari offsite

```bash
. /etc/sahabatkreator/backup.env

# Lihat snapshot yang tersedia
restic snapshots --tag db

# Restore dump tertentu ke folder sementara (jangan langsung ke BACKUP_DIR)
restic restore <snapshot-id> --target /tmp/restore --include "/var/backups/sahabatkreator/*.dump.gz"

# Lalu jalankan langkah restore di section di atas, mulai dari gunzip -c
gunzip -c /tmp/restore/var/backups/sahabatkreator/sahabatkreator-<ts>.dump.gz \
  | docker exec -i sahabatkreator-postgres \
    pg_restore -U sahabatkreator -d sahabatkreator_restore --no-owner --clean --if-exists
```

## PITR (Point-in-Time Recovery) — opsional, RPO < 5 menit

`pg_dump` harian berarti worst-case kehilangan sampai 24 jam data (`MAX_BACKUP_AGE_H`
di offsite menjaga ini tidak lebih lama dari itu). Untuk RPO ketat, aktifkan
WAL archiving — WAL di-archive tiap segmen, dikirim offsite oleh restic, dan
`pg_restore` + WAL replay bisa menyembuhkan ke menit-per-menit.

Dengan PG17 di Docker, tambahkan volume + command override di
`docker-compose.prod.yml` (deploy ulang diperlukan — lakukan saat maintenance):

```yaml
  postgres:
    command: >
      postgres
      -c archive_mode=on
      -c archive_timeout=300
      -c archive_command='test ! -f /archive/%f && cp %p /archive/%f'
    volumes:
      - postgres_data:/var/lib/postgresql
      - pg_wal_archive:/archive
```

```yaml
volumes:
  postgres_data:
  pg_wal_archive:   # di-host: /var/lib/docker/volumes/sahabatkreator_pg_wal_archive
```

Lalu arahkan cron offsite ke **dua** path:

```bash
restic backup /var/backups/sahabatkreator --tag db --one-file-system
# WAL archive (banyak file kecil — restic dedup per-file efisien di sini)
restic backup /var/lib/docker/volumes/sahabatkreator_pg_wal_archive/_data --tag wal --one-file-system
```

Pemulihan: restore dump full (`--verify` dulu), lalu `restore --target <timestamp>`
untuk WAL + jalankan `pg_waldump`/recovery — detailnya di
[pgBackRest docs](https://pgbackrest.org/) bila mau tool dengan retention &
restore terkelola; native `archive_command` di atas cukup untuk skala ini.

**Peringatan**: WAL archiving yang gagal (disk `/archive` penuh / command error)
memblokir commit Postgres — pasangkan alert pada pengisian volume `/archive`,
dan uji sekali di staging sebelum prod.

