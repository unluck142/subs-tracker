'use client';

import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { api } from '@/lib/api';
import { formatRub, periodShort, plural, shortDate, todayLocal } from '@/lib/format';
import { readStatementFile, StatementReadError } from '@/lib/statement/extract';
import { analyzeStatement, type Candidate, type ParseResult } from '@/lib/statement/parse';
import { haptic } from '@/lib/telegram';
import type { CatalogItem, Subscription } from '@/lib/types';

const BANK_GUIDES: { bank: string; steps: string }[] = [
  { bank: 'Сбербанк', steps: 'СберБанк Онлайн → карта → «Выписки и справки» → «Выписка по счёту» → период → PDF' },
  { bank: 'Т-Банк', steps: 'Приложение Т-Банка → карта → «Выписка» или «Справка о движении средств» → период → PDF' },
  { bank: 'Альфа-Банк', steps: 'Альфа-Онлайн → счёт карты → «Выписка» → период → PDF' },
  { bank: 'ВТБ', steps: 'ВТБ Онлайн → карта → «Выписка» → период → PDF' },
  { bank: 'Другой банк', steps: 'Ищи у карты «Выписку» или «Справку о движении средств». Нужен PDF с текстом, не фото.' },
];

type Phase = 'pick' | 'reading' | 'result' | 'saving';

export default function ImportStatement({
  existing,
  onDone,
  onManual,
}: {
  existing: Subscription[];
  onDone: () => void;
  onManual: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const catalog = useRef<Promise<CatalogItem[]> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Каталог нужен, чтобы узнавать сервисы по названию в выписке — грузим заранее
  useEffect(() => {
    catalog.current = api.catalog();
    catalog.current.catch(() => undefined);
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPhase('reading');
    try {
      const [lines, items] = await Promise.all([readStatementFile(file), catalog.current ?? api.catalog()]);
      const active = existing.filter((s) => s.status === 'ACTIVE');
      const result = analyzeStatement(lines, items, active, todayLocal());
      if (result.transactions.length === 0) {
        throw new StatementReadError(
          'Не нашёл в файле ни одной операции. Это точно выписка по карте? Попробуй скачать её в PDF заново.',
        );
      }
      setSelected(new Set(result.candidates.filter((c) => c.preselected).map((c) => c.key)));
      setResult(result);
      setPhase('result');
      haptic(result.candidates.length > 0 ? 'success' : 'warning');
    } catch (e) {
      haptic('error');
      setError(e instanceof StatementReadError ? e.message : 'Не получилось прочитать файл. Попробуй ещё раз.');
      setPhase('pick');
    } finally {
      // Чтобы можно было выбрать тот же файл повторно
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function toggle(c: Candidate) {
    if (c.alreadyAdded) return;
    haptic('select');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.key)) next.delete(c.key);
      else next.add(c.key);
      return next;
    });
  }

  async function addSelected(parsed: ParseResult) {
    const chosen = parsed.candidates.filter((c) => selected.has(c.key));
    setError(null);
    let done = 0;
    setProgress({ done, total: chosen.length });
    setPhase('saving');
    try {
      for (const c of chosen) {
        await api.create({
          ...(c.service ? { serviceId: c.service.id } : { customName: c.name }),
          price: c.priceKopecks / 100,
          periodUnit: c.periodUnit,
          periodCount: c.periodCount,
          nextChargeDate: c.nextChargeDate,
          isTrial: false,
          remindDaysBefore: 1,
        });
        done += 1;
        setProgress({ done, total: chosen.length });
      }
      haptic('success');
      onDone();
    } catch (e) {
      haptic('error');
      // Часть могла добавиться — их галочки снимаем, чтобы не создать дубли при повторе
      const added = new Set(chosen.slice(0, done).map((c) => c.key));
      setSelected((prev) => new Set([...prev].filter((k) => !added.has(k))));
      setError(`Добавлено ${done} из ${chosen.length}. ${(e as Error).message}`);
      setResult(markAdded(parsed, added));
      setPhase('result');
    }
  }

  const filePicker = (
    <input
      ref={fileInput}
      type="file"
      accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
      hidden
      onChange={(e) => void onFile(e.target.files?.[0])}
    />
  );

  if (phase === 'reading') {
    return <div className="loader">Читаю выписку…</div>;
  }

  if (phase === 'saving') {
    return (
      <div className="loader">
        Добавляю подписки: {progress.done} из {progress.total}…
      </div>
    );
  }

  if (phase === 'result' && result) {
    const count = selected.size;
    return (
      <>
        {filePicker}
        {error && <div className="error">{error}</div>}
        <div className="card">
          <div className="summary-label">
            {result.from && result.to
              ? `Выписка с ${shortDate(result.from)} по ${shortDate(result.to)}`
              : 'Выписка прочитана'}
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            Операций: {result.transactions.length} ·{' '}
            {result.candidates.length > 0
              ? `похожих на подписки: ${result.candidates.length}`
              : 'регулярных списаний нет'}
          </div>
        </div>

        {result.candidates.length === 0 ? (
          <div className="card empty">
            <div className="empty-emoji">🤔</div>
            <h2>Подписок не нашёл</h2>
            <p className="hint">
              Подписки видно по повторяющимся списаниям, поэтому лучше брать выписку за 3–6 месяцев. Если подписки
              оплачиваются с другой карты — загрузи выписку по ней.
            </p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => fileInput.current?.click()}>
              Выбрать другой файл
            </button>
            <button className="btn-plain" onClick={onManual}>
              Добавить вручную
            </button>
          </div>
        ) : (
          <>
            <div className="section-title">Отметь свои подписки</div>
            <div className="list with-check">
              {result.candidates.map((c) => (
                <CandidateRow key={c.key} candidate={c} checked={selected.has(c.key)} onToggle={() => toggle(c)} />
              ))}
            </div>
            <p className="hint" style={{ padding: '8px 16px 0', fontSize: 14 }}>
              Цену, период и дату можно будет поправить в карточке подписки.
            </p>
            <button className="toggle-link" onClick={() => fileInput.current?.click()}>
              Загрузить другую выписку
            </button>
            <div className="bottom-bar">
              {result.candidates.every((c) => c.alreadyAdded) ? (
                <button className="btn" onClick={onDone}>
                  Все уже в списке — готово
                </button>
              ) : (
                <button className="btn" disabled={count === 0} onClick={() => void addSelected(result)}>
                  {count === 0
                    ? 'Отметь подписки'
                    : `Добавить ${count} ${plural(count, ['подписку', 'подписки', 'подписок'])}`}
                </button>
              )}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      {filePicker}
      {error && <div className="error">{error}</div>}
      <div className="card empty">
        <div className="empty-emoji">🏦</div>
        <h2>Найду подписки в выписке</h2>
        <p className="hint">
          Загрузи выписку по карте за последние 3–6 месяцев: я найду регулярные списания и предложу добавить их в
          два касания.
        </p>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => fileInput.current?.click()}>
          Выбрать файл выписки
        </button>
        <p className="hint" style={{ marginTop: 12, fontSize: 14 }}>
          🔒 Файл читается прямо на твоём устройстве и никуда не отправляется. Подходит PDF, а ещё CSV из Т-Банка.
        </p>
      </div>

      <div className="section-title">Как скачать выписку</div>
      <div className="list">
        {BANK_GUIDES.map((g) => (
          <details key={g.bank} className="guide">
            <summary>{g.bank}</summary>
            <p>{g.steps}</p>
          </details>
        ))}
      </div>
      <p className="hint" style={{ padding: '8px 16px 0', fontSize: 14 }}>
        Названия пунктов в приложениях банков иногда меняются. Сохрани PDF в «Файлы» (кнопка «Поделиться») и выбери его
        здесь.
      </p>
    </>
  );
}

function CandidateRow({ candidate: c, checked, onToggle }: { candidate: Candidate; checked: boolean; onToggle: () => void }) {
  let details: string;
  if (c.alreadyAdded) details = 'уже есть в твоём списке';
  else if (c.stale) details = `последнее списание ${shortDate(c.lastChargeDate)} — возможно, уже отменена`;
  else if (c.recurring) {
    details = `${c.occurrences} ${plural(c.occurrences, ['списание', 'списания', 'списаний'])} · следующее ${shortDate(c.nextChargeDate)}`;
  } else details = `списание ${shortDate(c.lastChargeDate)} · следующее ≈ ${shortDate(c.nextChargeDate)}`;

  return (
    <button
      className={`row${c.alreadyAdded ? ' muted' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={c.alreadyAdded}
      onClick={onToggle}
    >
      <span className={`check${checked ? ' on' : ''}`} aria-hidden>
        {checked ? '✓' : ''}
      </span>
      <Avatar name={c.name} color={c.service?.color} />
      <div className="row-main">
        <div className="row-title">{c.name}</div>
        <div className="row-sub">{details}</div>
      </div>
      <div className="row-price">
        {formatRub(c.priceKopecks)}
        <small>{periodShort(c.periodUnit, c.periodCount)}</small>
      </div>
    </button>
  );
}

function markAdded(result: ParseResult, added: Set<string>): ParseResult {
  return {
    ...result,
    candidates: result.candidates.map((c) => (added.has(c.key) ? { ...c, alreadyAdded: true } : c)),
  };
}
