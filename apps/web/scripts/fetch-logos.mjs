// Скачать логотипы сервисов каталога в public/logos/<slug>.png и обновить список lib/logos.ts.
// Запускается вручную, когда в каталоге появился новый сервис: node scripts/fetch-logos.mjs
// Логотипы хранятся у нас, а не грузятся с чужих сайтов: так быстрее и сторонние сервисы
// не узнают, какие подписки у пользователя.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// slug сервиса из каталога (apps/api/src/db/catalog.data.ts) → сайт, с которого берём иконку.
// У «Мобильной связи», «Интернета», «Фитнеса» нет одного бренда — у них остаётся буква.
const DOMAINS = {
  'yandex-plus': 'plus.yandex.ru',
  sberprime: 'sberprime.sber.ru',
  'mts-premium': 'premium.mts.ru',
  kinopoisk: 'kinopoisk.ru',
  okko: 'okko.tv',
  ivi: 'ivi.ru',
  wink: 'wink.ru',
  start: 'start.ru',
  premier: 'premier.one',
  kion: 'kion.ru',
  amediateka: 'amediateka.ru',
  'vk-music': 'vk.com',
  zvuk: 'zvuk.com',
  litres: 'litres.ru',
  'yandex-books': 'books.yandex.ru',
  'tbank-pro': 'tbank.ru',
  'alfa-smart': 'alfabank.ru',
  'telegram-premium': 'telegram.org',
  'yandex-360': '360.yandex.ru',
  'cloud-mail': 'cloud.mail.ru',
  icloud: 'icloud.com',
  chatgpt: 'chatgpt.com',
  'ozon-premium': 'ozon.ru',
  'x5-paket': 'x5.ru',
  skyeng: 'skyeng.ru',
  duolingo: 'duolingo.com',
  'ps-plus': 'playstation.com',
  'xbox-game-pass': 'xbox.com',
  boosty: 'boosty.to',
};

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'public/logos');
mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
for (const [slug, domain] of Object.entries(DOMAINS)) {
  if (only.length && !only.includes(slug)) continue;
  const res = await fetch(`https://favicon.yandex.net/favicon/v2/${domain}?size=120`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Если иконки нет, сервис отдаёт крошечную заглушку — такую не сохраняем
  if (!res.ok || buf.length < 400 || !buf.subarray(1, 4).equals(Buffer.from('PNG'))) {
    console.log(`⚠️  ${slug}: иконку не нашёл (${domain})`);
    continue;
  }
  writeFileSync(path.join(outDir, `${slug}.png`), buf);
  console.log(`✅ ${slug} ← ${domain} (${buf.length} байт)`);
}

const slugs = readdirSync(outDir)
  .filter((f) => f.endsWith('.png'))
  .map((f) => f.slice(0, -4))
  .sort();
writeFileSync(
  path.join(root, 'lib/logos.ts'),
  `// Сгенерировано scripts/fetch-logos.mjs — не править руками.\n` +
    `/** Сервисы каталога, для которых есть логотип в public/logos/<slug>.png */\n` +
    `export const LOGOS = new Set<string>(${JSON.stringify(slugs, null, 2).replace(/"/g, "'")});\n`,
);
console.log(`Логотипов: ${slugs.length}`);
