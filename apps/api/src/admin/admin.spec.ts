import { adminAlertText } from '../bot/messages';
import { loadConfig } from '../config';
import { adminKeyboard, growthText, overviewText, recentText, servicesText } from './admin-texts';

const NOW = new Date('2026-11-03T05:00:00Z');
const TZ = 'Asia/Novosibirsk';

describe('админ-панель', () => {
  it('обзор: рост к прошлой неделе и сумма в месяц', () => {
    const text = overviewText(
      {
        users: 120, new24h: 5, new7d: 30, newPrev7d: 20, active24h: 40, active7d: 90,
        activeSubs: 400, newSubs24h: 12, monthlyTotalKopecks: 15400000, reminders24h: 33,
      },
      NOW,
      TZ,
    );
    expect(text).toContain('на 12:00'); // время по часовому поясу админа
    expect(text).toContain('+30 за неделю (неделей раньше +20) ↑');
    expect(text).toContain('154 000 ₽'); // тысячи отделены неразрывным пробелом
  });

  it('рост по дням — таблица с полосками', () => {
    const text = growthText(
      [
        { day: '01.11', users: 0, subs: 0 },
        { day: '02.11', users: 4, subs: 8 },
      ],
      NOW,
      TZ,
    );
    expect(text).toContain('+4 пользователей, +8 подписок');
    expect(text).toContain('02.11   4 ████████   8 ████████');
    expect(text).toContain('01.11   0 ·');
  });

  it('экранирует имена пользователей и названия', () => {
    expect(servicesText({ top: [], custom: [{ name: '<b>Зал</b>', count: 2 }], cancelled: [] }, NOW, TZ)).toContain(
      '&lt;b&gt;Зал&lt;/b&gt;',
    );
    const recent = recentText(
      [{ name: 'Петя <script>', username: 'petya', createdAt: NOW, lastSeenAt: null, subs: 2, blocked: true }],
      NOW,
      TZ,
    );
    expect(recent).toContain('Петя &lt;script&gt;');
    expect(recent).toContain('🚫');
  });

  it('кнопки разделов отмечают текущий', () => {
    const buttons = adminKeyboard('money').inline_keyboard.flat().map((b) => b.text);
    expect(buttons).toContain('• 💰 Деньги');
    expect(buttons).toContain('🔄 Обновить');
    expect(buttons).toHaveLength(9);
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
