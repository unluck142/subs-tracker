import { formatRub, inDaysLabel, monthlyKopecks, periodLabel, plural } from './money';

describe('деньги и тексты', () => {
  it('пересчитывает цену в месяц', () => {
    expect(monthlyKopecks(29900, 'MONTH', 1)).toBe(29900);
    expect(monthlyKopecks(119900, 'YEAR', 1)).toBeCloseTo(9991.67, 1);
    expect(monthlyKopecks(60000, 'MONTH', 3)).toBe(20000);
    expect(monthlyKopecks(10000, 'WEEK', 1)).toBeCloseTo(43333.33, 1);
  });

  it('форматирует рубли', () => {
    expect(formatRub(29900).replace(/\s/g, ' ')).toBe('299 ₽');
    expect(formatRub(14950).replace(/\s/g, ' ')).toBe('149,50 ₽');
    expect(formatRub(1234500).replace(/\s/g, ' ')).toBe('12 345 ₽');
  });

  it('склоняет слова', () => {
    const days: [string, string, string] = ['день', 'дня', 'дней'];
    expect(plural(1, days)).toBe('день');
    expect(plural(3, days)).toBe('дня');
    expect(plural(5, days)).toBe('дней');
    expect(plural(11, days)).toBe('дней');
    expect(plural(21, days)).toBe('день');
    expect(plural(112, days)).toBe('дней');
  });

  it('подписывает период и срок', () => {
    expect(periodLabel('MONTH', 1)).toBe('в месяц');
    expect(periodLabel('MONTH', 3)).toBe('раз в 3 месяца');
    expect(periodLabel('YEAR', 1)).toBe('в год');
    expect(inDaysLabel(0)).toBe('сегодня');
    expect(inDaysLabel(1)).toBe('завтра');
    expect(inDaysLabel(5)).toBe('через 5 дней');
  });
});
