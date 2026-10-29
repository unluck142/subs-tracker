/**
 * Проверка подписи initData мини-приложения Telegram.
 * Алгоритм из документации: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Без этой проверки любой мог бы прислать чужой user.id и читать чужие подписки.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface InitDataResult {
  user: TelegramUser;
  authDate: Date;
}

export class InitDataError extends Error {}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    // Сортировка по кодам символов, а не localeCompare — так требует Telegram
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function sign(checkString: string, botToken: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(checkString).digest('hex');
}

/**
 * @param maxAgeSeconds сколько живут данные авторизации (по умолчанию сутки)
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60,
  now: Date = new Date(),
): InitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataError('Нет подписи initData');
  // Buffer.from(..., 'hex') молча отбрасывает мусор в конце строки, поэтому проверяем формат явно
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new InitDataError('Неверная подпись initData');

  const expected = sign(dataCheckString(params), botToken);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InitDataError('Неверная подпись initData');
  }

  const authDateSec = Number(params.get('auth_date'));
  if (!authDateSec) throw new InitDataError('Нет auth_date');
  const authDate = new Date(authDateSec * 1000);
  if (now.getTime() - authDate.getTime() > maxAgeSeconds * 1000) {
    throw new InitDataError('Данные авторизации устарели — переоткрой приложение');
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new InitDataError('Нет данных пользователя');
  const user = JSON.parse(userRaw) as TelegramUser;
  if (!user?.id) throw new InitDataError('Некорректный пользователь');

  return { user, authDate };
}

/** Собрать подписанную строку initData — для тестов и локальной отладки */
export function buildInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const params = new URLSearchParams(fields);
  params.set('hash', sign(dataCheckString(params), botToken));
  return params.toString();
}
