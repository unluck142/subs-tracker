'use client';

import { useState } from 'react';
import Avatar from '@/components/Avatar';
import { api } from '@/lib/api';
import {
  addMonthsLocal,
  CATEGORY_LABELS,
  formatRub,
  parsePrice,
  PERIOD_OPTIONS,
  REMIND_OPTIONS,
  todayLocal,
} from '@/lib/format';
import { confirmAction, haptic } from '@/lib/telegram';
import type { CatalogItem, Subscription, SubscriptionInput } from '@/lib/types';

type Props =
  | { mode: 'create'; service: CatalogItem | null; initialName?: string; onDone: () => void }
  | { mode: 'edit'; sub: Subscription; onDone: () => void };

function initialState(props: Props) {
  if (props.mode === 'edit') {
    const s = props.sub;
    return {
      name: s.name,
      price: String(s.priceKopecks / 100).replace('.', ','),
      periodUnit: s.periodUnit,
      periodCount: s.periodCount,
      nextChargeDate: s.nextChargeDate,
      isTrial: s.isTrial,
      remindDaysBefore: s.remindDaysBefore,
      notes: s.notes ?? '',
    };
  }
  const svc = props.service;
  return {
    name: svc?.name ?? props.initialName ?? '',
    price: svc?.suggestedPriceKopecks ? String(svc.suggestedPriceKopecks / 100) : '',
    periodUnit: svc?.periodUnit ?? 'MONTH',
    periodCount: svc?.periodCount ?? 1,
    // По умолчанию — через месяц от сегодня, пользователь поправит
    nextChargeDate: addMonthsLocal(todayLocal(), 1),
    isTrial: false,
    remindDaysBefore: 1,
    notes: '',
  };
}

export default function SubscriptionForm(props: Props) {
  const [form, setForm] = useState(() => initialState(props));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = props.mode === 'create' ? !props.service : props.sub.serviceId === null;
  const service = props.mode === 'create' ? props.service : null;
  const sub = props.mode === 'edit' ? props.sub : null;
  const color = service?.color ?? sub?.color ?? null;
  const category = service?.category ?? sub?.category;

  const price = parsePrice(form.price);
  const canSave = price !== null && form.name.trim().length > 0 && !!form.nextChargeDate && !saving;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      haptic('success');
      props.onDone();
    } catch (e) {
      haptic('error');
      setError((e as Error).message);
      setSaving(false);
    }
  }

  function save() {
    if (!canSave || price === null) return;
    const input: SubscriptionInput = {
      price,
      periodUnit: form.periodUnit,
      periodCount: form.periodCount,
      nextChargeDate: form.nextChargeDate,
      isTrial: form.isTrial,
      remindDaysBefore: form.remindDaysBefore,
      notes: form.notes.trim(),
    };
    if (isCustom) input.customName = form.name.trim();
    void run(() => {
      if (props.mode === 'edit') return api.update(props.sub.id, input);
      if (service) input.serviceId = service.id;
      return api.create(input);
    });
  }

  async function cancelSub() {
    if (!sub) return;
    const ok = await confirmAction(`Отметить «${sub.name}» как отменённую? Напоминания прекратятся.`);
    if (ok) void run(() => api.cancel(sub.id));
  }

  async function removeSub() {
    if (!sub) return;
    const ok = await confirmAction(`Удалить «${sub.name}» совсем? Это нельзя отменить.`);
    if (ok) void run(() => api.remove(sub.id));
  }

  const periodKey = `${form.periodUnit}:${form.periodCount}`;

  return (
    <>
      <div className="card">
        <div className="form-head">
          <Avatar name={form.name || '?'} color={color} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {isCustom ? (
              <input
                type="text"
                className="form-head-title"
                style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', padding: 0 }}
                placeholder="Название"
                value={form.name}
                maxLength={60}
                onChange={(e) => set('name', e.target.value)}
                autoFocus={props.mode === 'create' && !form.name}
              />
            ) : (
              <div className="form-head-title">{form.name}</div>
            )}
            <div className="hint">{category ? CATEGORY_LABELS[category] : 'Своя подписка'}</div>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="list">
        <label className="field">
          <span className="field-label">Цена</span>
          <div className="price-input">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={form.price}
              // Ширина по содержимому, чтобы «₽» стоял сразу после числа
              style={{ width: `${Math.max(form.price.length, 1) + 0.6}ch` }}
              onChange={(e) => set('price', e.target.value)}
              autoFocus={props.mode === 'create' && !isCustom && !form.price}
            />
            <span>₽</span>
          </div>
          {props.mode === 'create' && service?.suggestedPriceKopecks && (
            <div className="suggest">Обычно платят {formatRub(service.suggestedPriceKopecks)} — проверь свою цену</div>
          )}
          {form.price && price === null && <div className="suggest" style={{ color: 'var(--danger)' }}>Введи число, например 299 или 149,50</div>}
        </label>

        <div className="field">
          <span className="field-label">Как часто списывают</span>
          <div className="segmented" role="radiogroup">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.label}
                type="button"
                role="radio"
                aria-checked={periodKey === `${p.unit}:${p.count}`}
                className={periodKey === `${p.unit}:${p.count}` ? 'active' : ''}
                onClick={() => {
                  haptic('select');
                  setForm((f) => ({ ...f, periodUnit: p.unit, periodCount: p.count }));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">{form.isTrial ? 'Когда закончится пробный период' : 'Следующее списание'}</span>
          <input type="date" value={form.nextChargeDate} onChange={(e) => set('nextChargeDate', e.target.value)} />
        </label>

        <label className="field switch-row">
          <div>
            <div>Пробный период</div>
            <div className="hint">Напомню, пока ещё можно отменить бесплатно</div>
          </div>
          <span className="switch">
            <input type="checkbox" checked={form.isTrial} onChange={(e) => set('isTrial', e.target.checked)} />
            <span />
          </span>
        </label>

        <label className="field">
          <span className="field-label">Напомнить</span>
          <select value={form.remindDaysBefore} onChange={(e) => set('remindDaysBefore', Number(e.target.value))}>
            {REMIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Заметка</span>
          <textarea
            placeholder="Например: семейная, оплачивает брат"
            value={form.notes}
            maxLength={300}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>
      </div>

      {sub && (
        <div className="list" style={{ marginTop: 16 }}>
          {sub.status === 'ACTIVE' ? (
            <button className="btn-plain" onClick={cancelSub} disabled={saving}>
              Я отменил эту подписку
            </button>
          ) : (
            <button className="btn-plain" onClick={() => run(() => api.restore(sub.id))} disabled={saving}>
              Вернуть подписку
            </button>
          )}
          <button className="btn-plain danger" onClick={removeSub} disabled={saving}>
            Удалить
          </button>
        </div>
      )}

      <div className="bottom-bar">
        <button className="btn" onClick={save} disabled={!canSave}>
          {saving ? 'Сохраняю…' : props.mode === 'edit' ? 'Сохранить' : 'Добавить подписку'}
        </button>
      </div>
    </>
  );
}
