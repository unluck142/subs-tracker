import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { BOT_USERNAME, getGuide, SITE_URL, toBlocks } from '@/lib/guides';

// Инструкции правятся через db:seed — отдаём всегда свежие
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getGuide((await params).slug);
  if (!guide) return { title: 'Инструкция не найдена — Не спишут' };
  const title = `Как отменить подписку ${guide.name} — пошаговая инструкция`;
  const description = `Как отключить автопродление ${guide.name} и не платить за следующий месяц: где найти отмену, что делать, если оформляли через App Store, Google Play или банк.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/otmena/${guide.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/otmena/${guide.slug}`, type: 'article' },
  };
}

export default async function CancelGuidePage({ params }: Props) {
  const guide = await getGuide((await params).slug);
  if (!guide) notFound();
  const blocks = toBlocks(guide.cancelSteps);

  // Разметка HowTo — поисковики показывают шаги прямо в выдаче
  const steps = blocks.flatMap((b) => (b.type === 'p' ? [] : b.items));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `Как отменить подписку ${guide.name}`,
    step: steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
  };

  return (
    <main className="article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="hint">
        <Link href="/otmena">← Все инструкции</Link>
      </p>
      <div className="guide-head">
        <Avatar name={guide.name} slug={guide.slug} size="lg" />
        <h1>Как отменить подписку {guide.name}</h1>
      </div>

      {blocks.map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : b.type === 'ol' ? (
          <ol key={i}>
            {b.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        ) : (
          <ul key={i}>
            {b.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ),
      )}

      {guide.cancelUrl && (
        <p>
          Официальная справка:{' '}
          <a href={guide.cancelUrl} target="_blank" rel="noreferrer nofollow">
            {new URL(guide.cancelUrl).hostname}
          </a>
        </p>
      )}

      <p className="hint">
        Сервисы иногда переименовывают пункты меню. Если не нашёл(ла) нужный — ищи «Подписка», «Автопродление» или
        «Управление подпиской» в профиле.
      </p>

      <h2>Если не получается отменить</h2>
      <ul>
        <li>
          <b>Оплата через App Store:</b> Настройки iPhone → твоё имя → Подписки → выбери подписку → «Отменить».
        </li>
        <li>
          <b>Оплата через Google Play:</b> Google Play → профиль → «Платежи и подписки» → «Подписки».
        </li>
        <li>
          <b>Через банк:</b> в приложении банка найди раздел подписок или привязанных к карте сервисов и отвяжи карту.
          Можно также написать в поддержку сервиса.
        </li>
      </ul>

      <div className="card cta">
        <b>Чтобы деньги больше не списывались неожиданно</b>
        <p className="hint" style={{ margin: '6px 0 12px' }}>
          Бот «Не спишут» напомнит о каждом списании заранее, предупредит о конце пробного периода и покажет, сколько
          уходит на подписки в месяц.
        </p>
        <a className="btn" href={`https://t.me/${BOT_USERNAME}`}>
          Открыть бота в Telegram
        </a>
      </div>
    </main>
  );
}
