import type { PeriodUnit } from '../db/schema';

/** Сколько подписка стоит в пересчёте на месяц (в копейках, без округления) */
export function monthlyKopecks(priceKopecks: number, unit: PeriodUnit, count: number): number {
  switch (unit) {
    case 'WEEK':
      return (priceKopecks * 52) / 12 / count;
    case 'MONTH':
      return priceKopecks / count;
    case 'YEAR':
      return priceKopecks / 12 / count;
  }
}

const rubFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const rubWithKopecks = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 29900 → «299 ₽», 14950 → «149,50 ₽» */
export function formatRub(kopecks: number): string {
  const k = Math.round(kopecks);
  return `${(k % 100 === 0 ? rubFormatter : rubWithKopecks).format(k / 100)} ₽`;
}

/** Русское склонение: plural(3, ['день', 'дня', 'дней']) → 'дня' */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/** «в месяц», «раз в 3 месяца», «в год» */
export function periodLabel(unit: PeriodUnit, count: number): string {
  if (count === 1) {
    return { WEEK: 'в неделю', MONTH: 'в месяц', YEAR: 'в год' }[unit];
  }
  const forms: Record<PeriodUnit, [string, string, string]> = {
    WEEK: ['неделю', 'недели', 'недель'],
    MONTH: ['месяц', 'месяца', 'месяцев'],
    YEAR: ['год', 'года', 'лет'],
  };
  return `раз в ${count} ${plural(count, forms[unit])}`;
}

/** «сегодня», «завтра», «через 3 дня» */
export function inDaysLabel(days: number): string {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === 2) return 'послезавтра';
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}
