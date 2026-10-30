// Процессы на сервере под управлением pm2. Запускает их deploy/update.sh
module.exports = {
  apps: [
    {
      name: 'subs-api',
      cwd: '/opt/nespishut/apps/api',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'subs-web',
      cwd: '/opt/nespishut/apps/web',
      script: 'node_modules/next/dist/bin/next',
      // Только localhost: снаружи сайт открывается через nginx
      args: 'start -p 3000 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
    },
  ],
};
