'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { haptic } from '@/lib/telegram';
import type { Me } from '@/lib/types';

// Часовые пояса России + текущий пояс устройства (добавляется автоматически)
const RUSSIAN_TIMEZONES: { tz: string; label: string }[] = [
  { tz: 'Europe/Kaliningrad', label: 'Калининград (МСК−1)' },
  { tz: 'Europe/Moscow', label: 'Москва (МСК)' },
  { tz: 'Europe/Samara', label: 'Самара (МСК+1)' },
  { tz: 'Asia/Yekaterinburg', label: 'Екатеринбург (МСК+2)' },
  { tz: 'Asia/Omsk', label: 'Омск (МСК+3)' },
  { tz: 'Asia/Novosibirsk', label: 'Новосибирск (МСК+4)' },
  { tz: 'Asia/Krasnoyarsk', label: 'Красноярск (МСК+4)' },
  { tz: 'Asia/Irkutsk', label: 'Иркутск (МСК+5)' },
  { tz: 'Asia/Yakutsk', label: 'Якутск (МСК+6)' },
  { tz: 'Asia/Vladivostok', label: 'Владивосток (МСК+7)' },
  { tz: 'Asia/Magadan', label: 'Магадан (МСК+8)' },
  { tz: 'Asia/Kamchatka', label: 'Камчатка (МСК+9)' },
];

export const TZ_MANUAL_KEY = 'subs:tz-manual';

export default function Settings({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const [error, setError] = useState<string | null>(null);
  const options = RUSSIAN_TIMEZONES.some((o) => o.tz === me.timezone)
    ? RUSSIAN_TIMEZONES
    : [{ tz: me.timezone, label: me.timezone }, ...RUSSIAN_TIMEZONES];

  async function update(patch: Partial<Pick<Me, 'timezone' | 'reminderHour' | 'reviewsEnabled'>>) {
    setError(null);
    try {
      const updated = await api.updateMe(patch);
      haptic('success');
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="section-title" style={{ marginTop: 4 }}>
        Напоминания
      </div>
      <div className="list">
        <label className="field">
          <span className="field-label">Во сколько присылать</span>
          <select value={me.reminderHour} onChange={(e) => update({ reminderHour: Number(e.target.value) })}>
            {Array.from({ length: 16 }, (_, i) => i + 7).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Часовой пояс</span>
          <select
            value={me.timezone}
            onChange={(e) => {
              try {
                localStorage.setItem(TZ_MANUAL_KEY, '1');
              } catch {
                /* localStorage может быть недоступен — не страшно */
              }
              void update({ timezone: e.target.value });
            }}
          >
            {options.map((o) => (
              <option key={o.tz} value={o.tz}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field switch-row">
          <div>
            <div>Спрашивать, пользуюсь ли подписками</div>
            <div className="hint">Раз в неделю про одну подписку — помогает найти лишние</div>
          </div>
          <span className="switch">
            <input
              type="checkbox"
              checked={me.reviewsEnabled}
              onChange={(e) => void update({ reviewsEnabled: e.target.checked })}
            />
            <span />
          </span>
        </label>
      </div>
      <p className="hint" style={{ margin: '10px 16px' }}>
        Напоминания приходят в этот чат от бота. Если бот молчит — проверь, что не заблокировал его, и напиши ему /start.
      </p>
    </>
  );
}
