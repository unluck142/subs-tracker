import { diffDays } from '../common/dates';

/** Позже этого часа (по местному времени) не беспокоим, если пользователь сам не выбрал время позже */
export const QUIET_HOURS_START = 22;

/**
 * Пора ли отправить напоминание о ближайшем списании.
 * Одно напоминание на одну дату списания (повторы отсекает ReminderLog).
 */
export function isReminderDue(params: {
  nextChargeDate: string;
  remindDaysBefore: number;
  today: string;
  localHour: number;
  reminderHour: number;
}): boolean {
  const daysLeft = diffDays(params.today, params.nextChargeDate);
  if (daysLeft < 0 || daysLeft > params.remindDaysBefore) return false;
  const quietStart = Math.max(QUIET_HOURS_START, params.reminderHour + 1);
  return params.localHour >= params.reminderHour && params.localHour < quietStart;
}
