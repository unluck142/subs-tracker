import { addPeriod, diffDays, hourInTz, isDateString, rollForward, todayInTz } from './dates';

describe('даты', () => {
  it('проверяет формат даты', () => {
    expect(isDateString('2026-02-28')).toBe(true);
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('28.02.2026')).toBe(false);
  });

  it('определяет «сегодня» по часовому поясу пользователя', () => {
    // 30 октября 20:30 UTC = 31 октября 03:30 в Новосибирске (UTC+7), а в Москве ещё 30-е
    const now = new Date('2026-10-30T20:30:00Z');
    expect(todayInTz('Asia/Novosibirsk', now)).toBe('2026-10-31');
    expect(todayInTz('Europe/Moscow', now)).toBe('2026-10-30');
    expect(hourInTz('Asia/Novosibirsk', now)).toBe(3);
    expect(hourInTz('Europe/Moscow', now)).toBe(23);
  });

  it('добавляет месяцы без «съезжания» 31-го числа', () => {
    expect(addPeriod('2026-01-31', 'MONTH', 1, 31)).toBe('2026-02-28');
    // Благодаря anchorDay после февраля снова 31-е, а не 28-е
    expect(addPeriod('2026-02-28', 'MONTH', 1, 31)).toBe('2026-03-31');
    expect(addPeriod('2028-01-31', 'MONTH', 1, 31)).toBe('2028-02-29'); // високосный
    expect(addPeriod('2026-11-15', 'MONTH', 3, 15)).toBe('2027-02-15');
  });

  it('добавляет недели и годы', () => {
    expect(addPeriod('2026-12-28', 'WEEK', 1)).toBe('2027-01-04');
    expect(addPeriod('2028-02-29', 'YEAR', 1, 29)).toBe('2029-02-28');
  });

  it('считает разницу в днях', () => {
    expect(diffDays('2026-10-30', '2026-11-02')).toBe(3);
    expect(diffDays('2026-10-30', '2026-10-30')).toBe(0);
    expect(diffDays('2026-10-30', '2026-10-29')).toBe(-1);
    // Переход на летнее время не влияет: считаем в UTC
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
  });

  describe('rollForward', () => {
    const base = { periodUnit: 'MONTH' as const, periodCount: 1, anchorDay: 15, isTrial: false };

    it('не трогает будущую дату', () => {
      expect(rollForward({ ...base, nextChargeDate: '2026-11-15' }, '2026-10-30')).toEqual({
        nextChargeDate: '2026-11-15',
        isTrial: false,
        changed: false,
      });
    });

    it('сегодняшнюю дату списания тоже не трогает', () => {
      expect(rollForward({ ...base, nextChargeDate: '2026-10-30' }, '2026-10-30').changed).toBe(false);
    });

    it('переносит прошедшую дату на ближайший будущий период', () => {
      expect(rollForward({ ...base, nextChargeDate: '2026-08-15' }, '2026-10-30').nextChargeDate).toBe('2026-11-15');
    });

    it('после окончания пробного периода подписка становится обычной', () => {
      const r = rollForward({ ...base, isTrial: true, nextChargeDate: '2026-10-15' }, '2026-10-30');
      expect(r).toEqual({ nextChargeDate: '2026-11-15', isTrial: false, changed: true });
    });
  });
});
