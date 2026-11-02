'use client';

import { useCallback, useEffect, useState } from 'react';
import Avatar from '@/components/Avatar';
import { api } from '@/lib/api';
import { formatRub, periodShort, plural, shortDate } from '@/lib/format';
import { confirmAction, haptic, shareLink } from '@/lib/telegram';
import type { MembersInfo, Subscription } from '@/lib/types';

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME;

function useMembers(subId: number) {
  const [info, setInfo] = useState<MembersInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setInfo(await api.members(subId));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { info, setInfo, error, setError, reload };
}

/** Владелец: пригласить участников, видеть, кто перевёл, отмечать вручную, исключать */
export function SharingSection({ sub, onChanged }: { sub: Subscription; onChanged: () => void }) {
  const { info, setInfo, error, setError, reload } = useMembers(sub.id);
  const [notice, setNotice] = useState<string | null>(null);

  async function invite() {
    setError(null);
    setNotice(null);
    try {
      const { token } = await api.invite(sub.id);
      const link = `https://t.me/${BOT_USERNAME}?start=join_${token}`;
      const result = await shareLink(
        link,
        `Давай делить «${sub.name}» вместе: бот «Не спишут» посчитает доли и напомнит, когда скинуться.`,
      );
      if (result === 'copied') setNotice(`Ссылка скопирована: ${link}`);
      if (result === 'failed') setNotice(`Отправь эту ссылку: ${link}`);
      haptic('success');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function togglePaid(memberId: number, paid: boolean) {
    haptic('select');
    try {
      setInfo(await api.setPaid(sub.id, memberId, paid));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(memberId: number, name: string) {
    if (!(await confirmAction(`Исключить ${name} из общей подписки?`))) return;
    try {
      await api.removeMember(sub.id, memberId);
      await reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!info) return null;
  const members = info.members;

  return (
    <>
      <div className="section-title">Общая подписка</div>
      {error && <div className="error">{error}</div>}
      {members.length === 0 ? (
        <div className="card">
          <div style={{ fontWeight: 600 }}>👥 Делишь подписку с семьёй или друзьями?</div>
          <p className="hint" style={{ margin: '6px 0 12px' }}>
            Пригласи их — я посчитаю доли и перед каждым списанием напомню каждому скинуться. Тебе придёт уведомление,
            когда переведут.
          </p>
          <button className="btn" onClick={() => void invite()}>
            Пригласить участников
          </button>
          {notice && <p className="hint" style={{ marginTop: 10, wordBreak: 'break-all' }}>{notice}</p>}
        </div>
      ) : (
        <>
          <div className="list">
            <div className="row static">
              <Avatar name={info.owner} />
              <div className="row-main">
                <div className="row-title">Ты</div>
                <div className="row-sub">платишь сервису</div>
              </div>
              <div className="row-price">{formatRub(info.shareKopecks)}</div>
            </div>
            {members.map((m) => (
              <div className="row static" key={m.memberId}>
                <Avatar name={m.name} />
                <div className="row-main">
                  <div className="row-title">{m.name}</div>
                  <button className={`paid-toggle${m.paid ? ' on' : ''}`} onClick={() => void togglePaid(m.memberId, !m.paid)}>
                    {m.paid ? '✅ перевод получен' : '⏳ перевода ещё нет — отметить'}
                  </button>
                </div>
                <div className="row-price">{formatRub(info.shareKopecks)}</div>
                <button className="icon-btn" aria-label={`Исключить ${m.name}`} onClick={() => void remove(m.memberId, m.name)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '8px 16px 0', fontSize: 14 }}>
            Статусы — за списание {shortDate(sub.nextChargeDate)}. Перед ним я напомню тем, от кого ещё нет перевода.
          </p>
          <button className="toggle-link" onClick={() => void invite()}>
            + Пригласить ещё
          </button>
          {notice && <p className="hint" style={{ padding: '0 16px', wordBreak: 'break-all' }}>{notice}</p>}
        </>
      )}
    </>
  );
}

/** Участник чужой общей подписки: доля, кому переводить, «Я перевёл», выйти */
export function MemberSubscription({ sub, onDone }: { sub: Subscription; onDone: () => void }) {
  const { info, setInfo, error, setError } = useMembers(sub.id);
  const s = sub.sharing!;
  const me = info?.members.find((m) => m.isMe);
  const paid = me ? me.paid : s.paid;

  async function markPaid(value: boolean) {
    if (!me) return;
    haptic(value ? 'success' : 'select');
    try {
      setInfo(await api.setPaid(sub.id, me.memberId, value));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function leave() {
    if (!me || !(await confirmAction(`Выйти из общей подписки «${sub.name}»? ${s.ownerName ?? 'Владелец'} получит уведомление.`))) return;
    try {
      await api.removeMember(sub.id, me.memberId);
      haptic('success');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const people = s.membersCount + 1;
  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <div className="form-head">
          <Avatar name={sub.name} color={sub.color} slug={sub.serviceSlug} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="form-head-title">{sub.name}</div>
            <div className="hint">
              Общая подписка · платит {s.ownerName}
              {s.ownerUsername ? ` (@${s.ownerUsername})` : ''}
            </div>
          </div>
        </div>
        <div className="summary-facts" style={{ marginTop: 16 }}>
          <div className="fact">
            <div className="fact-value">{formatRub(s.shareKopecks)}</div>
            <div className="fact-label">твоя доля{periodShort(sub.periodUnit, sub.periodCount)}</div>
          </div>
          <div className="fact">
            <div className="fact-value">{shortDate(sub.nextChargeDate)}</div>
            <div className="fact-label">следующее списание</div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          {formatRub(sub.priceKopecks)}
          {periodShort(sub.periodUnit, sub.periodCount)} на {people} {plural(people, ['человека', 'человек', 'человек'])}.
          Перед списанием я напомню перевести долю.
        </p>
      </div>

      <div className="list">
        <button className="btn-plain" onClick={() => void markPaid(!paid)} disabled={!me}>
          {paid ? '✅ Перевод за это списание отмечен (отменить)' : '💸 Отметить, что долю перевёл(а)'}
        </button>
        <button className="btn-plain danger" onClick={() => void leave()} disabled={!me}>
          Выйти из общей подписки
        </button>
      </div>
    </>
  );
}
