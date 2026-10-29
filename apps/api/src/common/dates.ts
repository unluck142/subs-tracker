/**
 * Работа с «датами без времени» в формате 'YYYY-MM-DD'.
 *
 * Все расчёты ведём в UTC над датами-строками, а «сегодня» определяем
 * по часовому поясу конкретного пользователя. Так нет сюрпризов,
 * когда сервер в Москве, а пользователь в Новосибирске.
 */
import type { PeriodUnit } from '../db/schema';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const { y, m, d } = parts(value);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Сегодняшняя дата в часовом поясе пользователя */
export function todayInTz(tz: string, now: Date = new Date()): string {
  // en-CA форматирует дату как YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Текущий час (0–23) в часовом поясе пользователя */
export function hourInTz(tz: string, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
}

export function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUtc(date: string): number {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Сколько дней от a до b (b - a) */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addMonths(date: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Дата следующего списания после указанной */
export function addPeriod(date: string, unit: PeriodUnit, count: number, anchorDay?: number): string {
  switch (unit) {
    case 'WEEK':
      return addDays(date, 7 * count);
    case 'MONTH':
      return addMonths(date, count, anchorDay);
    case 'YEAR':
      return addMonths(date, 12 * count, anchorDay);
  }
}

export interface Rollable {
  nextChargeDate: string;
  periodUnit: PeriodUnit;
  periodCount: number;
  anchorDay: number;
  isTrial: boolean;
}

/**
 * Если дата списания уже прошла — считаем, что подписка продлилась,
 * и переносим дату на следующий период. Пробный период после первого
 * списания становится обычной платной подпиской.
 */
export function rollForward(
  sub: Rollable,
  today: string,
): { nextChargeDate: string; isTrial: boolean; changed: boolean } {
  let next = sub.nextChargeDate;
  let guard = 0;
  while (next < today && guard < 1000) {
    next = addPeriod(next, sub.periodUnit, sub.periodCount, sub.anchorDay);
    guard++;
  }
  const changed = next !== sub.nextChargeDate;
  return { nextChargeDate: next, isTrial: changed ? false : sub.isTrial, changed };
}
