#!/usr/bin/env bash
# Однократная подготовка ЧИСТОГО сервера Ubuntu 24.04 под «Не спишут».
# Не запускай на сервере, где уже работают другие сайты: скрипт включает файрвол и заменяет сайт nginx по умолчанию.
# Запуск от root:  bash setup-server.sh
set -euo pipefail

DOMAIN=nespishut.ru
APP_DIR=/opt/nespishut
APP_USER=nespishut
DB_NAME=subs
DB_USER=subs

echo "==> Пакеты"
apt-get update
apt-get install -y curl git nginx postgresql certbot python3-certbot-nginx ufw

echo "==> Node.js 24 и pm2"
if ! command -v node >/dev/null || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> Swap 1 ГБ (сборке Next.js нужна память)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Пользователь приложения (не root)"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/apps/api" "$APP_DIR/apps/web" /var/backups/nespishut
chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/backups/nespishut

echo "==> База данных и .env"
ENV_FILE="$APP_DIR/apps/api/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS=$(openssl rand -hex 24)
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
PORT=4000
BOT_TOKEN=
WEBAPP_URL=https://$DOMAIN/app
# Telegram ID владельцев бота через запятую: команда /stats и сообщения об ошибках
ADMIN_TELEGRAM_IDS=
EOF
  cat > "$APP_DIR/apps/web/.env.local" <<'WEBENV'
NEXT_PUBLIC_BOT_USERNAME=nespishut_bot
# Для /privacy (152-ФЗ): оператор персональных данных и контакт для обращений
NEXT_PUBLIC_OPERATOR_NAME=
NEXT_PUBLIC_SUPPORT_CONTACT=
WEBENV
  chown "$APP_USER:$APP_USER" "$ENV_FILE" "$APP_DIR/apps/web/.env.local"
  chmod 600 "$ENV_FILE"
fi

echo "==> nginx"
cp "$(dirname "$0")/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Файрвол: наружу только SSH, 80 и 443"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Автозапуск pm2 и ежедневный бэкап базы (03:30)"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"
echo "30 3 * * * $APP_USER bash $APP_DIR/deploy/backup.sh" > /etc/cron.d/nespishut-backup

cat <<EOF

Готово. Дальше:
  1. Впиши токен бота:   nano $ENV_FILE   (строка BOT_TOKEN=)
  2. Собери и запусти:   с Windows — .\\deploy\\deploy.ps1 root@<IP сервера>
  3. HTTPS (когда DNS $DOMAIN уже указывает на этот сервер):
       certbot --nginx -d $DOMAIN -d www.$DOMAIN
EOF
