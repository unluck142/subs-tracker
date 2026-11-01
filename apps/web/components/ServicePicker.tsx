'use client';

import { useEffect, useState } from 'react';
import Avatar from '@/components/Avatar';
import { api } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/format';
import type { CatalogItem, Category } from '@/lib/types';

export default function ServicePicker({
  onPick,
  onCustom,
  onImport,
}: {
  onPick: (service: CatalogItem) => void;
  onCustom: (name: string) => void;
  onImport: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .catalog(query.trim())
        .then((data) => !cancelled && setItems(data))
        .catch((e: Error) => !cancelled && setError(e.message));
    }, query ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const popular = items?.filter((i) => i.isPopular) ?? [];
  const searching = query.trim().length > 0;

  // Без поиска — все сервисы, сгруппированные по категориям
  const groups = new Map<Category, CatalogItem[]>();
  if (!searching) {
    for (const item of items ?? []) {
      if (item.isPopular) continue;
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
  }

  return (
    <>
      <input
        className="search"
        placeholder="Поиск: Кинопоиск, Okko, Т-Банк…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
      />
      {error && <div className="error">{error}</div>}

      {searching ? (
        <div className="list">
          {items?.map((item) => (
            <button key={item.id} className="row" onClick={() => onPick(item)}>
              <Avatar name={item.name} color={item.color} />
              <div className="row-main">
                <div className="row-title">{item.name}</div>
                <div className="row-sub">{CATEGORY_LABELS[item.category]}</div>
              </div>
            </button>
          ))}
          <button className="row" onClick={() => onCustom(query.trim())}>
            <Avatar name="+" color="var(--accent)" />
            <div className="row-main">
              <div className="row-title" style={{ color: 'var(--link)' }}>
                Добавить «{query.trim()}»
              </div>
              <div className="row-sub">Своя подписка, которой нет в списке</div>
            </div>
          </button>
        </div>
      ) : (
        <>
          {popular.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 4 }}>
                Популярные
              </div>
              <div className="chips">
                {popular.map((item) => (
                  <button key={item.id} className="chip" onClick={() => onPick(item)}>
                    <Avatar name={item.name} color={item.color} />
                    {item.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="list" style={{ marginTop: 16 }}>
            <button className="row" onClick={onImport}>
              <Avatar name="🏦" color="var(--accent)" />
              <div className="row-main">
                <div className="row-title" style={{ color: 'var(--link)' }}>
                  Найти в выписке банка
                </div>
                <div className="row-sub">Загрузи выписку — найду все подписки сам</div>
              </div>
            </button>
            <button className="row" onClick={() => onCustom('')}>
              <Avatar name="+" color="var(--accent)" />
              <div className="row-main">
                <div className="row-title" style={{ color: 'var(--link)' }}>
                  Своя подписка
                </div>
                <div className="row-sub">Спортзал, хостинг, курсы — что угодно</div>
              </div>
            </button>
          </div>

          {[...groups.entries()].map(([category, list]) => (
            <div key={category}>
              <div className="section-title">{CATEGORY_LABELS[category]}</div>
              <div className="list">
                {list.map((item) => (
                  <button key={item.id} className="row" onClick={() => onPick(item)}>
                    <Avatar name={item.name} color={item.color} />
                    <div className="row-main">
                      <div className="row-title">{item.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
