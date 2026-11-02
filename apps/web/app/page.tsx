/**
 * Публичная главная страница. Сейчас — простая заглушка со ссылкой на бота.
 * Позже здесь и в /otmena/[slug] будут SEO-страницы «Как отключить подписку X».
 */
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME;

export default function LandingPage() {
  return (
    <main className="landing">
      <h1>Не спишут</h1>
      <p style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>Все подписки под контролем</p>
      <p className="hint" style={{ fontSize: 17 }}>
        Telegram-бот, который напоминает о списаниях за день-два, предупреждает о конце пробных периодов и
        показывает, сколько уходит на подписки в месяц.
      </p>
      {BOT_USERNAME ? (
        <a className="btn" href={`https://t.me/${BOT_USERNAME}`}>
          Открыть в Telegram
        </a>
      ) : (
        <p className="hint">Укажи NEXT_PUBLIC_BOT_USERNAME в .env, чтобы здесь появилась кнопка.</p>
      )}
      <p style={{ marginTop: 28 }}>
        <a href="/otmena" style={{ color: 'var(--link)' }}>
          Как отменить подписку: инструкции для популярных сервисов →
        </a>
      </p>
      <p className="hint" style={{ fontSize: 14 }}>
        <a href="/privacy" style={{ color: 'inherit' }}>
          Политика конфиденциальности
        </a>
      </p>
    </main>
  );
}
