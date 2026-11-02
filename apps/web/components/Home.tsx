import Avatar from '@/components/Avatar';
import { CATEGORY_LABELS, formatRub, formatRubRounded, inDays, periodShort, plural, shortDate } from '@/lib/format';
import type { Category, Stats, Subscription } from '@/lib/types';

/** Сколько категорий показывать в графике, остальные сворачиваем в «Остальное» */
const MAX_BARS = 5;

function CategoryBars({ byCategory }: { byCategory: Stats['byCategory'] }) {
  // Один столбик — это не сравнение, график не нужен
  if (byCategory.length < 2) return null;

  const rows: { key: string; label: string; value: number; count: number }[] = byCategory
    .slice(0, MAX_BARS)
    .map((c) => ({ key: c.category, label: CATEGORY_LABELS[c.category as Category], value: c.monthlyKopecks, count: c.count }));
  const rest = byCategory.slice(MAX_BARS);
  if (rest.length > 0) {
    rows.push({
      key: 'rest',
      label: 'Остальное',
      value: rest.reduce((s, c) => s + c.monthlyKopecks, 0),
      count: rest.reduce((s, c) => s + c.count, 0),
    });
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="card">
      <div className="summary-label" style={{ marginBottom: 12 }}>
        Траты в месяц по категориям
      </div>
      <div className="bars" role="table" aria-label="Траты в месяц по категориям">
        {rows.map((r) => (
          <div
            className="bar-row"
            key={r.key}
            role="row"
            title={`${r.label}: ${formatRubRounded(r.value)} в месяц, ${r.count} ${plural(r.count, ['подписка', 'подписки', 'подписок'])}`}
          >
            <span className="bar-label" role="cell">
              {r.label}
            </span>
            <span className="bar-value" role="cell">
              {formatRubRounded(r.value)}
            </span>
            <div className="bar-track" aria-hidden>
              <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Где пользователь платит за одно и то же дважды */
function Overlaps({ stats, subs, onOpen }: { stats: Stats; subs: Subscription[]; onOpen: (sub: Subscription) => void }) {
  if (stats.overlaps.length === 0) return null;
  const total = stats.overlaps.reduce((sum, o) => sum + o.monthlyKopecks, 0);
  return (
    <div className="card tip">
      <div className="tip-title">💡 Можно сэкономить {formatRubRounded(total)} в месяц</div>
      {stats.overlaps.map((o) => {
        const sub = subs.find((s) => s.id === o.subscriptionId);
        return (
          <button key={o.subscriptionId} className="tip-row" onClick={() => sub && onOpen(sub)} disabled={!sub}>
            <span>
              {o.kind === 'bundle' ? (
                <>
                  «{o.name}» уже входит в «{o.coveredByName}»
                </>
              ) : (
                <>«{o.name}» добавлена дважды</>
              )}
            </span>
            <span className="tip-price">{formatRubRounded(o.monthlyKopecks)} ›</span>
          </button>
        );
      })}
      <div className="tip-note">Состав тарифов иногда меняется — проверь свой, прежде чем отменять.</div>
    </div>
  );
}

function SubRow({ sub, onOpen }: { sub: Subscription; onOpen: () => void }) {
  const cancelled = sub.status === 'CANCELLED';
  const soon = !cancelled && sub.daysLeft <= 2;
  return (
    <button className={`row${cancelled ? ' cancelled' : ''}`} onClick={onOpen}>
      <Avatar name={sub.name} color={sub.color} slug={sub.serviceSlug} />
      <div className="row-main">
        <div className="row-title">
          {sub.name}
          {sub.isTrial && !cancelled && <span className="badge">пробный</span>}
          {sub.sharing && !cancelled && <span className="badge">👥 {sub.sharing.membersCount + 1}</span>}
        </div>
        <div className={`row-sub${soon ? ' soon' : ''}`}>
          {cancelled ? 'отменена' : `${inDays(sub.daysLeft)} · ${shortDate(sub.nextChargeDate)}`}
          {sub.role === 'member' && sub.sharing && !sub.sharing.paid && ' · скинуться'}
        </div>
      </div>
      <div className="row-price">
        {/* У общей подписки показываем свою долю — её и учитываем в итогах */}
        {formatRub(sub.sharing?.shareKopecks ?? sub.priceKopecks)}
        <small>{sub.sharing ? `из ${formatRub(sub.priceKopecks)}` : periodShort(sub.periodUnit, sub.periodCount)}</small>
      </div>
    </button>
  );
}

/** На главной нечего показать — вместо сводки приглашение добавить первую подписку */
export function isHomeEmpty(stats: Stats, subs: Subscription[]): boolean {
  return stats.activeCount === 0 && stats.savedMonthlyKopecks === 0 && subs.length === 0;
}

export default function Home({
  subs,
  stats,
  showCancelled,
  onToggleCancelled,
  onOpen,
  onAdd,
  onImport,
}: {
  subs: Subscription[];
  stats: Stats;
  showCancelled: boolean;
  onToggleCancelled: () => void;
  onOpen: (sub: Subscription) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  const active = subs.filter((s) => s.status === 'ACTIVE');
  const cancelled = subs.filter((s) => s.status === 'CANCELLED');

  // Пустой экран — только когда совсем ничего нет. Если всё отменил, показываем экономию.
  if (isHomeEmpty(stats, subs)) {
    return (
      <div className="card empty">
        <div className="empty-emoji">🧾</div>
        <h2>Подписок пока нет</h2>
        <p className="hint">
          Добавь всё, за что регулярно списываются деньги: кино, музыку, связь, банки, облако. Я напомню перед каждым
          списанием.
        </p>
        <button className="btn" style={{ marginTop: 12 }} onClick={onAdd}>
          Добавить первую подписку
        </button>
        <button className="btn-plain" style={{ marginTop: 4 }} onClick={onImport}>
          🏦 Найти подписки в выписке банка
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="summary-label">
          {stats.activeCount > 0
            ? `В месяц на ${stats.activeCount} ${plural(stats.activeCount, ['подписку', 'подписки', 'подписок'])}`
            : 'Активных подписок нет'}
        </div>
        <div className="hero">{formatRubRounded(stats.monthlyKopecks)}</div>
        <div className="summary-facts">
          <div className="fact">
            <div className="fact-value">{formatRubRounded(stats.yearlyKopecks)}</div>
            <div className="fact-label">в год</div>
          </div>
          <div className="fact">
            <div className="fact-value">{formatRubRounded(stats.next7DaysKopecks)}</div>
            <div className="fact-label">спишут за 7 дней</div>
          </div>
        </div>
        {stats.savedMonthlyKopecks > 0 && (
          <div className="saved">
            🎉 Отменённые подписки экономят тебе <b>{formatRubRounded(stats.savedMonthlyKopecks)}</b> в месяц
          </div>
        )}
      </div>

      <Overlaps stats={stats} subs={subs} onOpen={onOpen} />

      <CategoryBars byCategory={stats.byCategory} />

      {active.length > 0 && (
        <>
          <div className="section-title">Ближайшие списания</div>
          <div className="list">
            {active.map((s) => (
              <SubRow key={s.id} sub={s} onOpen={() => onOpen(s)} />
            ))}
          </div>
        </>
      )}

      {showCancelled && cancelled.length > 0 && (
        <>
          <div className="section-title">Отменённые</div>
          <div className="list">
            {cancelled.map((s) => (
              <SubRow key={s.id} sub={s} onOpen={() => onOpen(s)} />
            ))}
          </div>
        </>
      )}

      {(stats.savedMonthlyKopecks > 0 || showCancelled) && (
        <button className="toggle-link" onClick={onToggleCancelled}>
          {showCancelled ? 'Скрыть отменённые' : 'Показать отменённые'}
        </button>
      )}
    </>
  );
}
