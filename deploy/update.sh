#!/usr/bin/env bash
# Установка зависимостей, миграции, сборка и (пере)запуск. Выполняется на сервере
# от пользователя nespishut; обычно его вызывает deploy.ps1 после загрузки кода.
set -euo pipefail
APP_DIR=/opt/nespishut

cd "$APP_DIR/apps/api"
npm ci --no-audit --no-fund
npm run db:migrate
npm run db:seed
npm run build

cd "$APP_DIR/apps/web"
npm ci --no-audit --no-fund
npm run build

pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.js" --update-env
pm2 save
echo "✅ Обновлено: $(date '+%F %T')"
