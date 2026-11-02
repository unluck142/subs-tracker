import type { Metadata } from 'next';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { CATEGORY_LABELS } from '@/lib/format';
import { getGuides, SITE_URL } from '@/lib/guides';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Как отменить подписку: инструкции для популярных сервисов — Не спишут',
  description:
    'Пошаговые инструкции, как отключить автопродление Яндекс Плюс, Okko, Иви, Кинопоиска, СберПрайм, Ozon Premium и других подписок.',
  alternates: { canonical: `${SITE_URL}/otmena` },
};

export default async function GuidesIndex() {
  const guides = await getGuides();
  const groups = new Map<Category, typeof guides>();
  for (const g of guides) groups.set(g.category, [...(groups.get(g.category) ?? []), g]);

  return (
    <main className="article">
      <p className="hint">
        <Link href="/">← Не спишут</Link>
      </p>
      <h1>Как отменить подписку</h1>
      <p>Пошаговые инструкции: где найти отмену и что делать, если подписка оформлена через App Store, Google Play или банк.</p>
      {guides.length === 0 && <p className="hint">Инструкции временно недоступны, загляни чуть позже.</p>}
      {[...groups.entries()].map(([category, list]) => (
        <section key={category}>
          <h2>{CATEGORY_LABELS[category]}</h2>
          <div className="list">
            {list.map((g) => (
              <Link key={g.slug} href={`/otmena/${g.slug}`} className="row">
                <Avatar name={g.name} slug={g.slug} />
                <div className="row-main">
                  <div className="row-title">Как отменить {g.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
