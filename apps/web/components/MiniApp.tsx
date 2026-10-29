'use client';

import { useCallback, useEffect, useState } from 'react';
import Home from '@/components/Home';
import ServicePicker from '@/components/ServicePicker';
import Settings, { TZ_MANUAL_KEY } from '@/components/Settings';
import SubscriptionForm from '@/components/SubscriptionForm';
import { api, ApiError } from '@/lib/api';
import { colorScheme, webApp } from '@/lib/telegram';
import type { CatalogItem, Me, Stats, Subscription } from '@/lib/types';

type View =
  | { name: 'home' }
  | { name: 'picker' }
  | { name: 'create'; service: CatalogItem | null; initialName?: string }
  | { name: 'edit'; sub: Subscription }
  | { name: 'settings' };

const TITLES: Record<View['name'], string> = {
  home: 'Подписки',
  picker: 'Новая подписка',
  create: 'Новая подписка',
  edit: 'Подписка',
  settings: 'Настройки',
};

/** Если пользователь не выбирал пояс вручную — берём его из устройства */
async function syncTimezone(me: Me): Promise<Me> {
  try {
    if (localStorage.getItem(TZ_MANUAL_KEY) === '1') return me;
  } catch {
    /* localStorage недоступен — просто синхронизируем */
  }
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!deviceTz || deviceTz === me.timezone) return me;
  try {
    return await api.updateMe({ timezone: deviceTz });
  } catch {
    return me;
  }
}

export default function MiniApp() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [me, setMe] = useState<Me | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withCancelled: boolean) => {
    try {
      const [list, st] = await Promise.all([api.list(withCancelled), api.stats()]);
      setSubs(list);
      setStats(st);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Открой приложение через бота в Telegram'
          : (e as Error).message,
      );
    }
  }, []);

  // Старт: сообщаем Telegram, что готовы, подхватываем тему, грузим данные
  useEffect(() => {
    const app = webApp();
    app?.ready();
    app?.expand();

    const applyTheme = () => {
      document.documentElement.dataset.theme = colorScheme();
    };
    applyTheme();
    app?.onEvent('themeChanged', applyTheme);

    void (async () => {
      try {
        const user = await api.me();
        setMe(await syncTimezone(user));
      } catch (e) {
        setError(
          e instanceof ApiError && e.status === 401
            ? 'Открой приложение через бота в Telegram'
            : (e as Error).message,
        );
        return;
      }
      await load(false);
    })();

    return () => app?.offEvent('themeChanged', applyTheme);
  }, [load]);

  const goHome = useCallback(() => {
    setView({ name: 'home' });
    window.scrollTo(0, 0);
  }, []);

  // Системная кнопка «Назад» Telegram на всех экранах, кроме главного
  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back) return;
    if (view.name === 'home') {
      back.hide();
      return;
    }
    const handler = () => (view.name === 'create' ? setView({ name: 'picker' }) : goHome());
    back.show();
    back.onClick(handler);
    return () => back.offClick(handler);
  }, [view, goHome]);

  const afterChange = useCallback(async () => {
    await load(showCancelled);
    goHome();
  }, [load, showCancelled, goHome]);

  const inTelegram = Boolean(webApp());

  if (error && !stats) {
    return (
      <main className="app">
        <div className="card empty">
          <div className="empty-emoji">🔒</div>
          <h2>Не получилось загрузить</h2>
          <p className="hint">{error}</p>
        </div>
      </main>
    );
  }

  if (!me || !stats) {
    return <div className="loader">Загружаю подписки…</div>;
  }

  return (
    <main className="app">
      <div className="topbar">
        {view.name !== 'home' && !inTelegram && (
          <button
            className="icon-btn"
            aria-label="Назад"
            onClick={() => (view.name === 'create' ? setView({ name: 'picker' }) : goHome())}
          >
            ‹
          </button>
        )}
        <h1>{TITLES[view.name]}</h1>
        {view.name === 'home' && (
          <button className="icon-btn" aria-label="Настройки" onClick={() => setView({ name: 'settings' })}>
            ⚙︎
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {view.name === 'home' && (
        <>
          <Home
            subs={subs}
            stats={stats}
            showCancelled={showCancelled}
            onToggleCancelled={() => {
              const next = !showCancelled;
              setShowCancelled(next);
              void load(next);
            }}
            onOpen={(sub) => setView({ name: 'edit', sub })}
            onAdd={() => setView({ name: 'picker' })}
          />
          {(stats.activeCount > 0 || subs.length > 0) && (
            <div className="bottom-bar">
              <button className="btn" onClick={() => setView({ name: 'picker' })}>
                + Добавить подписку
              </button>
            </div>
          )}
        </>
      )}

      {view.name === 'picker' && (
        <ServicePicker
          onPick={(service) => setView({ name: 'create', service })}
          onCustom={(name) => setView({ name: 'create', service: null, initialName: name })}
        />
      )}

      {view.name === 'create' && (
        <SubscriptionForm
          key={`create-${view.service?.id ?? 'custom'}`}
          mode="create"
          service={view.service}
          initialName={view.initialName}
          onDone={afterChange}
        />
      )}

      {view.name === 'edit' && (
        <SubscriptionForm key={`edit-${view.sub.id}`} mode="edit" sub={view.sub} onDone={afterChange} />
      )}

      {view.name === 'settings' && <Settings me={me} onSaved={setMe} />}
    </main>
  );
}
