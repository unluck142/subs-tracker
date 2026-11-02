/**
 * Проверка пользования: «Ты пользовался Okko в последний месяц?»
 * Помогает найти подписки, которые оплачиваются по привычке.
 *
 * Чтобы не надоедать:
 * - пользователю — не чаще раза в неделю и только в его час напоминаний;
 * - про одну подписку — не чаще раза в 60 дней, и не раньше чем через 30 дней после добавления;
 * - не спрашиваем про пробные (о них предупредит напоминание) и за 3 дня до списания
 *   (тогда придёт обычное напоминание с тем же вопросом).
 */
import { diffDays } from '../common/dates';
import { QUIET_HOURS_START } from './reminders.logic';

export const REVIEW_EVERY_DAYS = 7;
export const SUB_REVIEW_COOLDOWN_DAYS = 60;
export const MIN_AGE_DAYS = 30;
export const SKIP_BEFORE_CHARGE_DAYS = 3;

const DAY_MS = 86_400_000;

export interface ReviewCandidate {
  id: number;
  status: 'ACTIVE' | 'CANCELLED';
  isTrial: boolean;
  reviewMuted: boolean;
  createdAt: Date;
  lastReviewedAt: Date | null;
  usageConfirmedAt: Date | null;
  nextChargeDate: string;
  monthlyKopecks: number;
}

/** Пора ли спросить пользователя (по времени, а не по подпискам) */
export function isUserReviewDue(params: {
  reviewsEnabled: boolean;
  lastReviewAt: Date | null;
  now: Date;
  localHour: number;
  reminderHour: number;
}): boolean {
  if (!params.reviewsEnabled) return false;
  if (params.lastReviewAt && params.now.getTime() - params.lastReviewAt.getTime() < REVIEW_EVERY_DAYS * DAY_MS) {
    return false;
  }
  const quietStart = Math.max(QUIET_HOURS_START, params.reminderHour + 1);
  return params.localHour >= params.reminderHour && params.localHour < quietStart;
}

/** О какой подписке спросить: самая дорогая из тех, про которые давно не спрашивали */
export function pickForReview(subs: ReviewCandidate[], today: string, now: Date): ReviewCandidate | null {
  const olderThan = (date: Date | null, days: number) => !date || now.getTime() - date.getTime() >= days * DAY_MS;
  const eligible = subs.filter(
    (s) =>
      s.status === 'ACTIVE' &&
      !s.isTrial &&
      !s.reviewMuted &&
      olderThan(s.createdAt, MIN_AGE_DAYS) &&
      olderThan(s.lastReviewedAt, SUB_REVIEW_COOLDOWN_DAYS) &&
      olderThan(s.usageConfirmedAt, SUB_REVIEW_COOLDOWN_DAYS) &&
      diffDays(today, s.nextChargeDate) > SKIP_BEFORE_CHARGE_DAYS,
  );
  eligible.sort((a, b) => b.monthlyKopecks - a.monthlyKopecks || a.id - b.id);
  return eligible[0] ?? null;
}
