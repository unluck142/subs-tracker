/** Настройки из переменных окружения (.env) */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  /** Токен бота от @BotFather. Без него API работает, а бот и напоминания — нет. */
  botToken: string | null;
  /** Публичный HTTPS-адрес мини-приложения, например https://ваш-домен.рф/app */
  webAppUrl: string | null;
  /**
   * SOCKS5-прокси для запросов к Telegram, например socks5://127.0.0.1:10808 (прокси Happ/v2rayN).
   * Нужен, если Telegram с этого компьютера доступен только через VPN.
   */
  telegramProxy: string | null;
  /** Telegram ID владельцев бота: им доступна /stats и приходят сообщения об ошибках */
  adminTelegramIds: number[];
  /** Сколько секунд действительна авторизация из мини-приложения */
  initDataMaxAge: number;
  /**
   * Только для локальной разработки: открываешь мини-приложение в обычном браузере,
   * и API считает тебя пользователем с этим Telegram ID. В production игнорируется.
   */
  devTelegramId: number | null;
  isProduction: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  if (!env.DATABASE_URL) {
    throw new Error('Не задан DATABASE_URL в .env');
  }
  const devId = Number(env.DEV_TELEGRAM_ID);
  return {
    port: Number(env.PORT) || 4000,
    databaseUrl: env.DATABASE_URL,
    botToken: env.BOT_TOKEN?.trim() || null,
    webAppUrl: env.WEBAPP_URL?.trim() || null,
    telegramProxy: env.TELEGRAM_PROXY?.trim() || null,
    adminTelegramIds: (env.ADMIN_TELEGRAM_IDS ?? '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isSafeInteger(id) && id > 0),
    initDataMaxAge: Number(env.INIT_DATA_MAX_AGE) || 24 * 60 * 60,
    devTelegramId: !isProduction && devId > 0 ? devId : null,
    isProduction,
  };
}

export const CONFIG = Symbol('CONFIG');
