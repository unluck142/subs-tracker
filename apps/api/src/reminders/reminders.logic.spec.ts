import { howToCancelText, reminderText } from '../bot/messages';
import type { SubscriptionView } from '../subscriptions/subscriptions.service';
import { isReminderDue } from './reminders.logic';

describe('когда напоминать', () => {
  const base = { nextChargeDate: '2026-10-31', remindDaysBefore: 1, today: '2026-10-30', reminderHour: 10 };

  it('напоминает за день в выбранный час', () => {
    expect(isReminderDue({ ...base, localHour: 10 })).toBe(true);
    expect(isReminderDue({ ...base, localHour: 15 })).toBe(true);
  });

  it('не будит рано утром и не пишет ночью', () => {
    expect(isReminderDue({ ...base, localHour: 7 })).toBe(false);
    expect(isReminderDue({ ...base, localHour: 23 })).toBe(false);
  });

  it('уважает позднее время, если пользователь сам его выбрал', () => {
    expect(isReminderDue({ ...base, reminderHour: 22, localHour: 22 })).toBe(true);
  });

  it('не напоминает слишком рано', () => {
    expect(isReminderDue({ ...base, nextChargeDate: '2026-11-05', localHour: 12 })).toBe(false);
  });

  it('напоминает в день списания, если так настроено', () => {
    expect(isReminderDue({ ...base, nextChargeDate: '2026-10-30', remindDaysBefore: 0, localHour: 12 })).toBe(true);
  });

  it('не напоминает о прошедшем списании', () => {
    expect(isReminderDue({ ...base, nextChargeDate: '2026-10-29', localHour: 12 })).toBe(false);
  });
});

describe('тексты бота', () => {
  const sub: SubscriptionView = {
    id: 1,
    name: 'Okko <script>',
    serviceId: 5,
    serviceSlug: 'okko',
    color: '#5B2EFF',
    category: 'VIDEO',
    priceKopecks: 29900,
    periodUnit: 'MONTH',
    periodCount: 1,
    monthlyKopecks: 29900,
    nextChargeDate: '2026-10-31',
    daysLeft: 1,
    isTrial: false,
    remindDaysBefore: 1,
    notes: null,
    status: 'ACTIVE',
    hasCancelGuide: false,
    includedIn: null,
  };

  it('пишет понятное напоминание и экранирует HTML', () => {
    const text = reminderText(sub).replace(/\s/g, ' ');
    expect(text).toContain('Завтра спишут <b>299 ₽</b>');
    expect(text).toContain('Okko &lt;script&gt;');
    expect(text).not.toContain('<script>');
  });

  it('подсказывает, если подписка уже входит в другую', () => {
    expect(reminderText({ ...sub, includedIn: 'СберПрайм' })).toContain('уже входит в «СберПрайм»');
    expect(reminderText(sub)).not.toContain('входит');
  });

  it('отдельный текст для пробного периода', () => {
    expect(reminderText({ ...sub, isTrial: true })).toContain('Пробный период');
  });

  it('инструкция по отмене всегда содержит способ через банк', () => {
    expect(howToCancelText('Okko', null)).toContain('Т-Банк');
    expect(howToCancelText('Okko', 'Профиль → Подписки → Отключить')).toContain('Профиль → Подписки');
  });
});
