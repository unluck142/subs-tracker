import { buildInitData, InitDataError, validateInitData } from './init-data';

const TOKEN = '123456:TEST-token';
const user = JSON.stringify({ id: 42, first_name: 'Женя', username: 'evg' });

describe('initData Telegram', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const authDate = String(Math.floor(now.getTime() / 1000) - 60);

  it('принимает корректно подписанные данные', () => {
    const initData = buildInitData({ user, auth_date: authDate, query_id: 'AAA' }, TOKEN);
    const result = validateInitData(initData, TOKEN, 86400, now);
    expect(result.user.id).toBe(42);
    expect(result.user.first_name).toBe('Женя');
  });

  it('отклоняет подделку user.id', () => {
    const initData = buildInitData({ user, auth_date: authDate }, TOKEN);
    const forged = initData.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(forged).not.toBe(initData);
    expect(() => validateInitData(forged, TOKEN, 86400, now)).toThrow(InitDataError);
  });

  it('отклоняет подпись с мусором в конце', () => {
    const initData = buildInitData({ user, auth_date: authDate }, TOKEN);
    expect(() => validateInitData(`${initData}x`, TOKEN, 86400, now)).toThrow('Неверная подпись');
  });

  it('отклоняет данные, подписанные другим ботом', () => {
    const initData = buildInitData({ user, auth_date: authDate }, 'другой:токен');
    expect(() => validateInitData(initData, TOKEN, 86400, now)).toThrow('Неверная подпись');
  });

  it('отклоняет устаревшие данные', () => {
    const old = String(Math.floor(now.getTime() / 1000) - 2 * 86400);
    const initData = buildInitData({ user, auth_date: old }, TOKEN);
    expect(() => validateInitData(initData, TOKEN, 86400, now)).toThrow('устарели');
  });

  it('отклоняет данные без подписи', () => {
    expect(() => validateInitData(`user=${encodeURIComponent(user)}`, TOKEN, 86400, now)).toThrow('Нет подписи');
  });

  it('совпадает с эталонным алгоритмом из документации Telegram', () => {
    // Независимая реализация «по учебнику», чтобы проверить сортировку и формат строки
    const { createHmac } = require('node:crypto');
    const fields = { auth_date: authDate, user, query_id: 'AAHdF6IQAAAAAN0XohDhrOrc', chat_type: 'private' };
    const check = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k as keyof typeof fields]}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const hash = createHmac('sha256', secret).update(check).digest('hex');
    const initData = new URLSearchParams({ ...fields, hash }).toString();
    expect(validateInitData(initData, TOKEN, 86400, now).user.id).toBe(42);
  });
});
