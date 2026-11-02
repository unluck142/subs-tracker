/**
 * Сводка 1-го числа («В ноябре спишут 2 688 ₽») и последнее напоминание о пробном периоде.
 */
import { addPeriod, daysInMonth, diffDays, parts } from '../common/dates';
import type { PeriodUnit } from '../db/schema';
import { QUIET_HOURS_START } from './reminders.logic';

export interface ChargeSource {
  name: string;
  nextChargeDate: string;
  periodUnit: PeriodUnit;
  periodCount: number;
  /** Сколько платит сам пользователь за одно списание (у общей подписки — его доля) */
  amountKopecks: number;
  isTrial: boolean;
}

export interface MonthCharge {
  date: string;
  name: string;
  amountKopecks: number;
  isTrial: boolean;
}

/** Все списания подписок в месяце (у недельной — несколько), по датам */
export function chargesInMonth(subs: ChargeSource[], month: string): MonthCharge[] {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
  const result: MonthCharge[] = [];
  for (const sub of subs) {
    const anchor = parts(sub.nextChargeDate).d;
    let date = sub.nextChargeDate;
    for (let guard = 0; date <= last && guard < 60; guard++) {
      if (date >= first) {
        result.push({ date, name: sub.name, amountKopecks: sub.amountKopecks, isTrial: sub.isTrial && guard === 0 });
      }
      date = addPeriod(date, sub.periodUnit, sub.periodCount, anchor);
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ru'));
}

/** Пора ли отправить сводку: 1-е число по местному времени, час напоминаний, в этом месяце ещё не было */
export function isDigestDue(params: {
  digestEnabled: boolean;
  lastDigestMonth: string | null;
  today: string;
  localHour: number;
  reminderHour: number;
}): boolean {
  if (!params.digestEnabled) return false;
  if (parts(params.today).d !== 1) return false;
  if (params.lastDigestMonth === params.today.slice(0, 7)) return false;
  const quietStart = Math.max(QUIET_HOURS_START, params.reminderHour + 1);
  return params.localHour >= params.reminderHour && params.localHour < quietStart;
}

/**
 * Последнее напоминание о пробном периоде — накануне.
 * Нужно, только если основное пришло раньше (напоминание «за 2+ дня»): за неделю легко забыть.
 */
export function isTrialLastCallDue(params: {
  isTrial: boolean;
  remindDaysBefore: number;
  nextChargeDate: string;
  today: string;
}): boolean {
  return params.isTrial && params.remindDaysBefore >= 2 && diffDays(params.today, params.nextChargeDate) === 1;
}
