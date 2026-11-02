import { adminAlertText, adminStatsText } from '../bot/messages';
import { loadConfig } from '../config';

describe('для владельца бота', () => {
  it('статистика', () => {
    const text = adminStatsText({
      users: { total: 120, new24h: 5, new7d: 30, withSubscriptions: 80, blockedBot: 3 },
      subscriptions: { active: 400, added7d: 60, cancelled: 25, shared: 7, members: 12 },
      avgMonthlyKopecks: 154000,
      savedMonthlyKopecks: 999900,
      topServices: [{ name: 'Яндекс Плюс', count: 50 }],
    });
    expect(text).toContain('Пользователей: <b>120</b> (+5 за сутки, +30 за неделю)');
    expect(text).toContain('1. Яндекс Плюс — 50');
    expect(text).toContain('1 540 ₽'); // тысячи отделены неразрывным пробелом
  });

  it('ошибка экранируется и обрезается', () => {
    const text = adminAlertText('API', `<b>${'x'.repeat(2000)}`);
    expect(text).toContain('&lt;b&gt;');
    expect(text.length).toBeLessThan(1000);
  });

  it('список админов из .env', () => {
    const base = { DATABASE_URL: 'postgres://x' };
    expect(loadConfig({ ...base, ADMIN_TELEGRAM_IDS: '123, 456,abc,' }).adminTelegramIds).toEqual([123, 456]);
    expect(loadConfig(base).adminTelegramIds).toEqual([]);
  });
});
