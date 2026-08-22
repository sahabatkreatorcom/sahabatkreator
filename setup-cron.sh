#!/bin/bash
# Sahabat Kreator — Setup cron jobs via systemd timer (lebih reliable dari crontab)
# Jalankan sebagai root di VPS:
#   curl -fsSL https://raw.githubusercontent.com/... | bash
#
# Atau manual:
#   cp systemd/sahabat-kreator-billing.timer /etc/systemd/system/
#   cp systemd/sahabat-kreator-refresh-tokens.timer /etc/systemd/system/
#   systemctl daemon-reload
#   systemctl enable --now sahabat-kreator-billing.timer
#   systemctl enable --now sahabat-kreator-refresh-tokens.timer

set -e

LOG_DIR="/var/log"
LOG_FILE="$LOG_DIR/sahabat-kreator-cron.log"
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

# Buat unit systemd untuk billing
cat > /etc/systemd/system/sahabat-kreator-billing.timer << 'EOF'
[Unit]
Description=Sahabat Kreator Billing Cron

[Timer]
OnCalendar=*:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/sahabat-kreator-billing.service << 'EOF'
[Unit]
Description=Sahabat Kreator Billing Service

[Service]
Type=oneshot
EnvironmentFile=/opt/sahabat-kreator/.env
ExecStart=/usr/bin/curl -fsS -X POST http://localhost/api/cron/billing -H "Authorization: Bearer $CRON_SECRET"
StandardOutput=append:$LOG_DIR/sahabat-kreator-cron.log
StandardError=append:$LOG_DIR/sahabat-kreator-cron.log
EOF

# Buat unit systemd untuk token refresh
cat > /etc/systemd/system/sahabat-kreator-refresh-tokens.timer << 'EOF'
[Unit]
Description=Sahabat Kreator Token Refresh Cron

[Timer]
OnCalendar=*:02:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/sahabat-kreator-refresh-tokens.service << 'EOF'
[Unit]
Description=Sahabat Kreator Token Refresh Service

[Service]
Type=oneshot
EnvironmentFile=/opt/sahabat-kreator/.env
ExecStart=/usr/bin/curl -fsS -X POST http://localhost/api/cron/refresh-tokens -H "Authorization: Bearer $CRON_SECRET"
StandardOutput=append:$LOG_DIR/sahabat-kreator-cron.log
StandardError=append:$LOG_DIR/sahabat-kreator-cron.log
EOF

# Reload dan enable timers
systemctl daemon-reload
systemctl enable --now sahabat-kreator-billing.timer
systemctl enable --now sahabat-kreator-refresh-tokens.timer

echo "✅ Cron jobs setup selesai."
echo "   Log: $LOG_FILE"
echo "   Cek status: systemctl status sahabat-kreator-billing.timer sahabat-kreator-refresh-tokens.timer"
