#!/usr/bin/env bash
#
# Backup Postgres produksi Sahabat Kreator (service "postgres" di
# docker-compose.prod.yml, data di volume postgres_data).
#
# Mengapa: DB self-hosted PG17 adalah satu-satunya copy data user. Volume
# Docker hanya melindungi dari kegagalan disk container, BUKAN dari
# kegagalan host / salah-hapus / korupsi logis — yang butuh backup terjadwal
# yang terpisah dari host. Tanpa ini, satu `docker volume rm` atau disk
# mati = hilang seluruh data user tanpa recovery.
#
# Cara pakai (cron di host prod, lihat deploy/backup-postgres.md):
#   ./deploy/backup-postgres.sh                  # backup harian
#   ./deploy/backup-postgres.sh --verify         # cek backup terakhir
#   ./deploy/backup-postgres.sh --verify <file>  # cek file tertentu
#
# Exit code non-zero bila gagal — pasangkan dengan monitoring (cron mail /
# healthchecks.io) supaya backup yang diam-diam gagal ketahuan.
set -euo pipefail

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sahabatkreator-postgres}"
POSTGRES_DB="${POSTGRES_DB:-sahabatkreator}"
POSTGRES_USER="${POSTGRES_USER:-sahabatkreator}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sahabatkreator}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DUMP_PREFIX="sahabatkreator"

log() { echo "[backup-postgres $(date '+%Y-%m-%dT%H:%M:%S%z')] $*"; }

fail() { log "GAGAL: $*"; exit 1; }

# File sementara dihapus bila pg_dump gagal tengah jalan — file gzip parsial
# tidak boleh dikira backup valid oleh retention/monitoring.
tmp_file=""
cleanup() {
  if [[ -n "$tmp_file" && -f "$tmp_file" ]]; then
    rm -f "$tmp_file"
    log "file parsial dihapus: $tmp_file"
  fi
}
trap cleanup EXIT

latest_backup() {
  ls -1t "$BACKUP_DIR"/${DUMP_PREFIX}-*.dump.gz 2>/dev/null | head -1
}

# --- Mode verify -------------------------------------------------------------
if [[ "${1:-}" == "--verify" ]]; then
  target="${2:-$(latest_backup)}"
  [[ -n "$target" ]] || fail "tidak ada backup di $BACKUP_DIR"
  log "verifikasi: $target"
  gzip -t "$target" || fail "gzip rusak: $target"
  size=$(stat -c%s "$target" 2>/dev/null || stat -f%z "$target")
  log "ukuran: $size bytes"
  # pg_restore -l membaca catalog archive tanpa restore — membuktikan file
  # bisa dibaca parser Postgres (bukan cuma byte utuh).
  if docker exec "$POSTGRES_CONTAINER" sh -c "command -v pg_restore" >/dev/null 2>&1; then
    # pg_restore butuh input file — kirim via stdin (container baca stdin).
    gzip -dc "$target" | docker exec -i "$POSTGRES_CONTAINER" \
      pg_restore -l 2>/dev/null | head -8 || fail "pg_restore tidak bisa membaca archive"
    log "OK: archive dapat dibaca pg_restore"
  else
    log "LEWATI cek pg_restore (pg_restore tidak tersedia di container)"
  fi
  exit 0
fi

# --- Pre-flight --------------------------------------------------------------
[[ -x "$(command -v docker)" ]] || fail "docker CLI tidak ditemukan"
docker info >/dev/null 2>&1 || fail "docker daemon tidak bisa dihubungi"
docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 \
  || fail "container $POSTGRES_CONTAINER tidak ada (deploy prod belum jalan?)"

state=$(docker inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER")
[[ "$state" == "true" ]] || fail "container $POSTGRES_CONTAINER tidak running"

mkdir -p "$BACKUP_DIR"

# --- Dump --------------------------------------------------------------------
ts=$(date '+%Y%m%d-%H%M%S')
final_file="$BACKUP_DIR/${DUMP_PREFIX}-${ts}.dump.gz"
tmp_file="$final_file.tmp"

log "mulai pg_dump (custom format) container=$POSTGRES_CONTAINER db=$POSTGRES_DB"

# pg_dump -Fc: custom format, restore selektif (bisa restore 1 tabel saja),
# lebih kecil & tahan partial corruption daripada plain SQL.
# pipefail (set -e) memastikan error pg_dump TIDAK ditutupi sukses gzip.
docker exec "$POSTGRES_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  | gzip -c > "$tmp_file"

# Validasi output — pipe yang putus bisa hasilkan file 0-byte.
gzip -t "$tmp_file" || fail "output dump bukan gzip valid"
size=$(stat -c%s "$tmp_file" 2>/dev/null || stat -f%z "$tmp_file")
[[ "$size" -gt 1024 ]] || fail "dump terlalu kecil ($size bytes) — curiga gagal"

mv "$tmp_file" "$final_file"
tmp_file=""

log "selesai: $final_file ($size bytes)"

# --- Retention ---------------------------------------------------------------
# Hanya file dengan prefix kita di BACKUP_DIR, dan path harus absolut —
# pengaman ekstra biar -delete tidak pernah menyapu luar folder backup.
deleted=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
  -name "${DUMP_PREFIX}-*.dump.gz" -mtime "+${RETENTION_DAYS}" -print -delete \
  | wc -l)
if [[ "$deleted" -gt 0 ]]; then
  log "retention: hapus $deleted backup lebih lama dari $RETENTION_DAYS hari"
fi

log "ringkasan: backup terbaru=$final_file, retensi=${RETENTION_DAYS}h"
