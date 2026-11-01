/**
 * Достаём строки текста из файла выписки — прямо в браузере, без сервера.
 *
 * PDF читаем через pdf.js: он отдаёт кусочки текста с координатами,
 * из них собираем строки таблицы (кусочки на одной высоте — одна строка).
 */

export class StatementReadError extends Error {}

/** Сколько страниц читаем максимум — выписка за год редко бывает длиннее */
const MAX_PAGES = 200;

export async function readStatementFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
  const lines = isPdf ? await pdfToLines(await file.arrayBuffer()) : textToLines(await file.arrayBuffer());
  if (lines.length === 0) {
    throw new StatementReadError(
      isPdf
        ? 'В PDF нет текста — похоже, это скан или фото. Скачай выписку в приложении банка заново в формате PDF.'
        : 'Файл пустой или в непонятном формате. Подойдёт PDF-выписка из приложения банка.',
    );
  }
  return lines;
}

interface Piece {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function pdfToLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Воркер лежит в public/ (копируется скриптом scripts/copy-pdf-worker.mjs)
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if ((e as Error)?.name === 'PasswordException') {
      throw new StatementReadError('PDF защищён паролем. Скачай выписку без пароля или открой и сохрани её заново.');
    }
    throw new StatementReadError('Не получилось открыть PDF. Проверь, что это выписка из приложения банка.');
  }

  const lines: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        pieces.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || Math.abs(item.transform[3]) || 10,
        });
      }
      lines.push(...piecesToLines(pieces));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return lines;
}

/** Кусочки текста с координатами → строки (сверху вниз, слева направо) */
export function piecesToLines(pieces: Piece[]): string[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Piece[][] = [];
  for (const piece of sorted) {
    const row = rows[rows.length - 1];
    // В одной строке таблицы кусочки стоят почти на одной высоте
    if (row && Math.abs(row[0].y - piece.y) <= Math.max(2, Math.min(row[0].height, piece.height) * 0.5)) {
      row.push(piece);
    } else {
      rows.push([piece]);
    }
  }
  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x);
      let line = '';
      let end = -Infinity;
      for (const p of row) {
        // Между ячейками — пробел, а куски одного слова склеиваем
        const gap = p.x - end;
        line += line && gap > p.height * 0.15 ? ` ${p.str}` : p.str;
        end = p.x + p.width;
      }
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

/** CSV/TXT: банки отдают и UTF-8, и Windows-1251 (Т-Банк) */
export function textToLines(data: ArrayBuffer): string[] {
  let text = new TextDecoder('utf-8').decode(data);
  if (text.includes('�')) text = new TextDecoder('windows-1251').decode(data);
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => {
      // Ячейки CSV разделяем двумя пробелами, кавычки убираем
      const sep = (line.match(/;/g)?.length ?? 0) >= 3 ? ';' : line.includes('\t') ? '\t' : null;
      return sep ? line.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')).join('  ') : line;
    })
    .filter((line) => line.trim());
}
