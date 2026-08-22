#!/bin/bash
# Sahabat Kreator — Setup cron jobs via systemd timer (lebih reliable dari crontab)
# Jalankan sebagai root di VPS:
#   bash setup-cron.sh
#
# Atau manual:
#   cp systemd/*.timer /etc/systemd/system/
#   cp systemd/*.service /etc/systemd/system/
#   systemctl daemon-reload
#   systemctl enable --now sahabat-kreator-*.timer

set -e

LOG_DIR="/var/log"
LOG_FILE="$LOG_DIR/sahabat-kreator-cron.log"
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

# Helper: buat unit systemd untuk endpoint
create_timer() {
    local name=$1
    local schedule=$2
    local url=$3
    local extra_headers=${4:-}

    cat > "/etc/systemd/system/sahabat-kreator-${name}.timer" << EOF
[Unit]
Description=Sahabat Kreator ${name} Cron

[Timer]
OnCalendar=${schedule}
Persistent=true

[Install]
WantedBy=timers.target
EOF

    cat > "/etc/systemd/system/sahabat-kreator-${name}.service" << EOF
[Unit]
Description=Sahabat Kreator ${name} Service

[Service]
Type=oneshot
EnvironmentFile=/opt/sahabat-kreator/.env
ExecStart=/usr/bin/curl -fsS -X POST ${url} -H "Authorization: Bearer \$CRON_SECRET" ${extra_headers}
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}
EOF
}

# Billing — tiap jam
create_timer "billing" "*:00" "http://localhost/api/cron/billing"

# Token refresh — tiap hari jam 02:00
create_timer "refresh-tokens" "*:02:00" "http://localhost/api/cron/refresh-tokens"

# Analytics sync — tiap 6 jam
create_timer "analytics-sync" "0 */6:*" "http://localhost/api/analytics/sync" "-H 'x-organization-id: ALL'"

# Inbox sync — tiap 30 menit
create_timer "inbox-sync" "*/30:*:*" "http://localhost/api/inbox/sync" "-H 'x-organization-id: ALL'"

# Reload dan enable semua timers
systemctl daemon-reload
systemctl enable --now sahabat-kreator-billing.timer
systemctl enable --now sahabat-kreator-refresh-tokens.timer
systemctl enable --now sahabat-kreator-analytics-sync.timer
systemctl enable --now sahabat-kreator-inbox-sync.timer

echo "✅ Cron jobs setup selesai."
echo "   Log: $LOG_FILE"
echo ""
echo "   Cek status:"
systemctl list-timers --all | grep sahabat-kreator || true
echo ""
echo "   Lihat log:"
tail -20 "$LOG_FILE" || true
