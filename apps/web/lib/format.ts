import type { Category, PeriodUnit } from './types';

const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const rubWithKopecks = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 29900 → «299 ₽», 14950 → «149,50 ₽» */
export function formatRub(kopecks: number): string {
  const k = Math.round(kopecks);
  return `${(k % 100 === 0 ? rub : rubWithKopecks).format(k / 100)} ₽`;
}

/** Для итогов (в месяц, в год): копейки только мешают — 474617 → «4 746 ₽» */
export function formatRubRounded(kopecks: number): string {
  return `${rub.format(Math.round(kopecks / 100))} ₽`;
}

export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function periodShort(unit: PeriodUnit, count: number): string {
  if (count === 1) return { WEEK: '/нед', MONTH: '/мес', YEAR: '/год' }[unit];
  const u = { WEEK: 'нед', MONTH: 'мес', YEAR: plural(count, ['год', 'года', 'лет']) }[unit];
  return ` за ${count} ${u}`;
}

export function inDays(days: number): string {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === 2) return 'послезавтра';
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}

/** '2026-10-31' → «31 окт» */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace('.', '');
}

/** Сегодняшняя дата по часам устройства в формате YYYY-MM-DD */
export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addMonthsLocal(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  VIDEO: 'Кино и сериалы',
  MUSIC: 'Музыка и книги',
  ECOSYSTEM: 'Экосистемы',
  BANK: 'Банки',
  CLOUD: 'Облако и софт',
  SHOPPING: 'Покупки',
  EDUCATION: 'Обучение',
  GAMES: 'Игры',
  CONNECTION: 'Связь',
  SPORT: 'Спорт',
  OTHER: 'Другое',
};

/** Варианты периода в форме: подпись + значения для API */
export const PERIOD_OPTIONS: { label: string; unit: PeriodUnit; count: number }[] = [
  { label: 'Неделя', unit: 'WEEK', count: 1 },
  { label: 'Месяц', unit: 'MONTH', count: 1 },
  { label: '3 мес', unit: 'MONTH', count: 3 },
  { label: 'Полгода', unit: 'MONTH', count: 6 },
  { label: 'Год', unit: 'YEAR', count: 1 },
];

export const REMIND_OPTIONS: { label: string; value: number }[] = [
  { label: 'В день списания', value: 0 },
  { label: 'За 1 день', value: 1 },
  { label: 'За 2 дня', value: 2 },
  { label: 'За 3 дня', value: 3 },
  { label: 'За неделю', value: 7 },
];

/** Цвет аватарки для своих подписок — стабильный по названию */
export function colorFromName(name: string): string {
  const palette = ['#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#e34948'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

/** Подпись для цены, которую ввёл пользователь: «149.5» → 149.5 (поддерживаем запятую) */
export function parsePrice(raw: string): number | null {
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
