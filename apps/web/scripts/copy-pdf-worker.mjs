// Воркер pdf.js должен лежать в public/, чтобы браузер мог его загрузить.
// Копируем из node_modules при установке, перед dev и перед сборкой — так версия всегда совпадает с библиотекой.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.resolve(import.meta.dirname, '../public/pdf.worker.min.mjs');
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(path.join(pkgDir, 'legacy/build/pdf.worker.min.mjs'), target);
