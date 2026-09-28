#!/usr/bin/env bash
#
# Sinkronisasi backup Postgres produksi ke object storage OFFSITE (Cloudflare R2
# atau S3-compatible lain) via restic — enkripsi + dedup + snapshot.
#
# Mengapa: backup-postgres.sh menyimpan dump di host yang SAMA dengan DB.
# Host hilang / disk rusak / ransomware = backup ikut lenyap. Offsite copy
# adalah satu-satunya perlindungan terhadap kehilangan total host.
#
# Cara pakai (dijalankan SETELAH backup-postgres.sh di cron, lihat
# deploy/backup-postgres.md):
#   ./deploy/backup-postgres-offsite.sh --init     # sekali: buat repo restic
#   ./deploy/backup-postgres-offsite.sh            # sync BACKUP_DIR → offsite
#   ./deploy/backup-postgres-offsite.sh --verify   # cek integritas repo offsite
#
# Exit code non-zero bila gagal — pasangkan dengan monitoring (cron mail /
# healthchecks.io) supaya sinkronisasi yang diam-diam gagal ketahuan.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/sahabatkreator}"
DUMP_PREFIX="sahabatkreator"
# Retensi offsite (lebih pendek dari lokal 30 hari — dedup restic membuat
# snapshot murah, tapi bucket R2 tetap punya batas).
RESTIC_KEEP_DAILY="${RESTIC_KEEP_DAILY:-30}"
RESTIC_KEEP_WEEKLY="${RESTIC_KEEP_WEEKLY:-12}"
RESTIC_KEEP_MONTHLY="${RESTIC_KEEP_MONTHLY:-12}"
# Backup harian harus ada sebelum sync — tolak diam-diam mensinkronkan
# folder kosong (memberi kesan proses sehat).
MAX_BACKUP_AGE_H="${MAX_BACKUP_AGE_H:-26}"

log() { echo "[backup-offsite $(date '+%Y-%m-%dT%H:%M:%S%z')] $*"; }
fail() { log "GAGAL: $*"; exit 1; }

# --- Pre-flight --------------------------------------------------------------
[[ -x "$(command -v restic)" ]] || fail "restic tidak terinstall (apt install restic / brew install restic)"
[[ -n "${RESTIC_REPOSITORY:-}" ]] || fail "RESTIC_REPOSITORY belum diset (mis. s3:s3.region.r2.cloudflarestorage.com/sahabatkreator-backup)"
[[ -n "${RESTIC_PASSWORD:-}" || -n "${RESTIC_PASSWORD_FILE:-}" ]] \
  || fail "RESTIC_PASSWORD / RESTIC_PASSWORD_FILE belum diset (enkripsi repo — tanpa ini data offsite terbuka)"
# restic S3 backend pakai AWS_* env (R2 token punya access key/secret format sama)
if [[ "${RESTIC_REPOSITORY}" == s3:* ]]; then
  [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]] \
    || fail "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY belum diset (R2 API token)"
fi

# Jangan overlap dengan run sebelumnya (restic punya lock sendiri, tapi
# double-run membuang bandwidth upload).
exec 9>/var/run/backup-offsite.lock
flock -n 9 || fail "sync lain sedang berjalan"

latest_backup() {
  ls -1t "$BACKUP_DIR"/${DUMP_PREFIX}-*.dump.gz 2>/dev/null | head -1
}

# --- Mode verify -------------------------------------------------------------
if [[ "${1:-}" == "--verify" ]]; then
  log "cek repo: $RESTIC_REPOSITORY"
  # restic check memverifikasi index + pak data (bisa lama untuk repo besar;
  # alternatif ringan: `restic snapshots --latest 1`).
  restic check || fail "repo offsite korup / tidak bisa dibaca"
  log "snapshot terbaru:"
  restic snapshots --latest 1 --tag db || fail "tidak ada snapshot offsite"
  log "OK: repo offsite sehat"
  exit 0
fi

# --- Mode init ---------------------------------------------------------------
if [[ "${1:-}" == "--init" ]]; then
  log "inisialisasi repo (enkripsi client-side, password RESTIC_PASSWORD): $RESTIC_REPOSITORY"
  restic init || fail "restic init gagal (bucket ada? region benar?)"
  log "OK: repo siap. Tes: ./deploy/backup-postgres-offsite.sh --verify"
  exit 0
fi

# --- Sync --------------------------------------------------------------------
[[ -d "$BACKUP_DIR" ]] || fail "BACKUP_DIR tidak ada: $BACKUP_DIR (jalankan backup-postgres.sh dulu)"

latest=$(latest_backup)
[[ -n "$latest" ]] || fail "tidak ada backup di $BACKUP_DIR — jalankan backup-postgres.sh sebelum sync"

# Fail-closed: backup terbaru harus segar. Folder kosong ter-sync = kesalahan
# proses sehat, padahal DB tidak terbackup.
age_h=$(( ( $(date +%s) - $(stat -c%Y "$latest" 2>/dev/null || stat -f%m "$latest") ) / 3600 ))
if [[ "$age_h" -gt "$MAX_BACKUP_AGE_H" ]]; then
  fail "backup terbaru ($latest) berusia ${age_h}h > ${MAX_BACKUP_AGE_H}h — sinkronisasi ditolak, cek cron backup-postgres.sh"
fi

log "sync $BACKUP_DIR → $RESTIC_REPOSITORY (backup dasar: $latest)"

# --tag db: filter snapshot restore sesuai peran (nanti bila ditambah backup
# aset lain ke repo yang sama). --one-file-system: jangan ikut mount point.
restic backup "$BACKUP_DIR" \
  --tag db \
  --one-file-system \
  --exclude='*.tmp' \
  || fail "restic backup gagal"

# Retensi + prune: hapus snapshot di luar jadwal keep, lalu release storage.
# Urutan penting — forget dulu (mark), baru prune (sweep).
restic forget \
  --keep-daily "$RESTIC_KEEP_DAILY" \
  --keep-weekly "$RESTIC_KEEP_WEEKLY" \
  --keep-monthly "$RESTIC_KEEP_MONTHLY" \
  --tag db \
  --prune \
  || fail "restic forget/prune gagal"

log "selesai: retensi=${RESTIC_KEEP_DAILY}h/${RESTIC_KEEP_WEEKLY}m/${RESTIC_KEEP_MONTHLY}bln"
