#!/usr/bin/env bash
# Ежедневный дамп базы (cron из setup-server.sh). Хранит 14 последних дней.
# Бэкапы лежат на том же сервере — периодически скачивай их себе.
set -euo pipefail
BACKUP_DIR=/var/backups/nespishut

DATABASE_URL=$(grep '^DATABASE_URL=' /opt/nespishut/apps/api/.env | cut -d= -f2-)
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/subs-$(date +%F).sql.gz"
find "$BACKUP_DIR" -name 'subs-*.sql.gz' -mtime +14 -delete
