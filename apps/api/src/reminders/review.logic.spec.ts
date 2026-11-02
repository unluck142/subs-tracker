import { isUserReviewDue, pickForReview, type ReviewCandidate } from './review.logic';

const NOW = new Date('2026-11-02T10:00:00Z');
const TODAY = '2026-11-02';
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const sub = (id: number, extra: Partial<ReviewCandidate> = {}): ReviewCandidate => ({
  id,
  status: 'ACTIVE',
  isTrial: false,
  reviewMuted: false,
  createdAt: daysAgo(90),
  lastReviewedAt: null,
  usageConfirmedAt: null,
  nextChargeDate: '2026-11-20',
  monthlyKopecks: 29900,
  ...extra,
});

describe('проверка пользования: кого спросить', () => {
  it('самую дорогую подходящую', () => {
    const picked = pickForReview([sub(1), sub(2, { monthlyKopecks: 99900 }), sub(3, { monthlyKopecks: 19900 })], TODAY, NOW);
    expect(picked?.id).toBe(2);
  });

  it('не спрашивает про свежие, пробные, отключённые и отменённые', () => {
    expect(
      pickForReview(
        [
          sub(1, { createdAt: daysAgo(10) }),
          sub(2, { isTrial: true }),
          sub(3, { reviewMuted: true }),
          sub(4, { status: 'CANCELLED' }),
        ],
        TODAY,
        NOW,
      ),
    ).toBeNull();
  });

  it('не повторяется раньше чем через 60 дней', () => {
    expect(pickForReview([sub(1, { lastReviewedAt: daysAgo(30) })], TODAY, NOW)).toBeNull();
    expect(pickForReview([sub(1, { usageConfirmedAt: daysAgo(59) })], TODAY, NOW)).toBeNull();
    expect(pickForReview([sub(1, { lastReviewedAt: daysAgo(61) })], TODAY, NOW)?.id).toBe(1);
  });

  it('молчит за 3 дня до списания — там придёт напоминание', () => {
    expect(pickForReview([sub(1, { nextChargeDate: '2026-11-05' })], TODAY, NOW)).toBeNull();
    expect(pickForReview([sub(1, { nextChargeDate: '2026-11-06' })], TODAY, NOW)?.id).toBe(1);
  });
});

describe('проверка пользования: когда спрашивать', () => {
  const base = { reviewsEnabled: true, lastReviewAt: null, now: NOW, localHour: 12, reminderHour: 10 };

  it('в час напоминаний, раз в неделю', () => {
    expect(isUserReviewDue(base)).toBe(true);
    expect(isUserReviewDue({ ...base, localHour: 8 })).toBe(false);
    expect(isUserReviewDue({ ...base, localHour: 23 })).toBe(false);
    expect(isUserReviewDue({ ...base, lastReviewAt: daysAgo(3) })).toBe(false);
    expect(isUserReviewDue({ ...base, lastReviewAt: daysAgo(7) })).toBe(true);
  });

  it('выключено в настройках', () => {
    expect(isUserReviewDue({ ...base, reviewsEnabled: false })).toBe(false);
  });
});
