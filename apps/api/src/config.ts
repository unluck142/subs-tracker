/** Настройки из переменных окружения (.env) */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  /** Токен бота от @BotFather. Без него API работает, а бот и напоминания — нет. */
  botToken: string | null;
  /** Публичный HTTPS-адрес мини-приложения, например https://ваш-домен.рф/app */
  webAppUrl: string | null;
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
    initDataMaxAge: Number(env.INIT_DATA_MAX_AGE) || 24 * 60 * 60,
    devTelegramId: !isProduction && devId > 0 ? devId : null,
    isProduction,
  };
}

export const CONFIG = Symbol('CONFIG');
