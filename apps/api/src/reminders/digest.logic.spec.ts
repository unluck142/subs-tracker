import { chargesInMonth, isDigestDue, isTrialLastCallDue, type ChargeSource } from './digest.logic';

const sub = (name: string, nextChargeDate: string, extra: Partial<ChargeSource> = {}): ChargeSource => ({
  name,
  nextChargeDate,
  periodUnit: 'MONTH',
  periodCount: 1,
  amountKopecks: 29900,
  isTrial: false,
  ...extra,
});

describe('сводка 1-го числа: списания в месяце', () => {
  it('месячные, недельные, годовые — по датам', () => {
    const charges = chargesInMonth(
      [
        sub('Okko', '2026-11-12'),
        sub('Спортзал', '2026-11-03', { periodUnit: 'WEEK', amountKopecks: 50000 }),
        sub('Годовая', '2027-03-01', { periodUnit: 'YEAR' }),
        sub('Плюс', '2026-11-04', { isTrial: true }),
      ],
      '2026-11',
    );
    expect(charges.map((c) => `${c.date} ${c.name}`)).toEqual([
      '2026-11-03 Спортзал',
      '2026-11-04 Плюс',
      '2026-11-10 Спортзал',
      '2026-11-12 Okko',
      '2026-11-17 Спортзал',
      '2026-11-24 Спортзал',
    ]);
    expect(charges.find((c) => c.name === 'Плюс')?.isTrial).toBe(true);
  });

  it('31-е в коротком месяце не теряется', () => {
    expect(chargesInMonth([sub('X', '2027-02-28')], '2027-02')).toHaveLength(1);
  });
});

describe('когда слать сводку', () => {
  const base = { digestEnabled: true, lastDigestMonth: '2026-10', today: '2026-11-01', localHour: 10, reminderHour: 10 };
  it('1-го числа в час напоминаний, один раз за месяц', () => {
    expect(isDigestDue(base)).toBe(true);
    expect(isDigestDue({ ...base, lastDigestMonth: '2026-11' })).toBe(false);
    expect(isDigestDue({ ...base, today: '2026-11-02' })).toBe(false);
    expect(isDigestDue({ ...base, localHour: 7 })).toBe(false);
    expect(isDigestDue({ ...base, digestEnabled: false })).toBe(false);
  });
});

describe('последнее напоминание о пробном периоде', () => {
  it('накануне, если основное было раньше', () => {
    const base = { isTrial: true, remindDaysBefore: 7, nextChargeDate: '2026-11-10', today: '2026-11-09' };
    expect(isTrialLastCallDue(base)).toBe(true);
    expect(isTrialLastCallDue({ ...base, remindDaysBefore: 1 })).toBe(false); // основное и так накануне
    expect(isTrialLastCallDue({ ...base, isTrial: false })).toBe(false);
    expect(isTrialLastCallDue({ ...base, today: '2026-11-08' })).toBe(false);
  });
});
