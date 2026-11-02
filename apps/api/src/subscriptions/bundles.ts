/**
 * Пересечения подписок: за одно и то же платят дважды.
 *
 * - bundle: сервис уже входит в другую подписку пользователя (Кинопоиск — в Яндекс Плюс)
 * - duplicate: один и тот же сервис добавлен дважды
 *
 * Состав пакетов меняется, поэтому здесь только то, что входит в базовый тариф давно и надёжно.
 * Пользователю всегда пишем «проверь свой тариф».
 */
export const BUNDLES: { bundle: string; includes: string[] }[] = [
  { bundle: 'yandex-plus', includes: ['kinopoisk'] },
  { bundle: 'sberprime', includes: ['okko', 'zvuk'] },
  { bundle: 'mts-premium', includes: ['kion'] },
];

export interface OverlapInput {
  id: number;
  name: string;
  serviceSlug: string | null;
  monthlyKopecks: number;
  status: 'ACTIVE' | 'CANCELLED';
}

export interface Overlap {
  kind: 'bundle' | 'duplicate';
  /** Подписка, которую можно отменить */
  subscriptionId: number;
  name: string;
  /** В какую подписку она уже входит (для duplicate — та же подписка) */
  coveredByName: string;
  /** Сколько в месяц сэкономит отмена */
  monthlyKopecks: number;
}

export function findOverlaps(subs: OverlapInput[]): Overlap[] {
  const active = subs.filter((s) => s.status === 'ACTIVE');
  const result: Overlap[] = [];

  for (const { bundle, includes } of BUNDLES) {
    const owner = active.find((s) => s.serviceSlug === bundle);
    if (!owner) continue;
    for (const sub of active) {
      if (sub.serviceSlug && includes.includes(sub.serviceSlug)) {
        result.push({
          kind: 'bundle',
          subscriptionId: sub.id,
          name: sub.name,
          coveredByName: owner.name,
          monthlyKopecks: sub.monthlyKopecks,
        });
      }
    }
  }

  // Дубли: один сервис каталога дважды. Оставляем первую добавленную, остальные — кандидаты на отмену
  const bySlug = new Map<string, OverlapInput[]>();
  for (const s of active) {
    if (s.serviceSlug) bySlug.set(s.serviceSlug, [...(bySlug.get(s.serviceSlug) ?? []), s]);
  }
  for (const group of bySlug.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = [...group].sort((a, b) => a.id - b.id);
    for (const dup of rest) {
      if (result.some((r) => r.subscriptionId === dup.id)) continue;
      result.push({
        kind: 'duplicate',
        subscriptionId: dup.id,
        name: dup.name,
        coveredByName: first.name,
        monthlyKopecks: dup.monthlyKopecks,
      });
    }
  }
  return result;
}

/** Для нового сервиса: входит ли он в то, что уже есть, или включает то, что уже есть */
export function overlapHint(
  slug: string | null,
  active: { name: string; serviceSlug: string | null }[],
): { coveredBy: string } | { covers: string[] } | null {
  if (!slug) return null;
  for (const { bundle, includes } of BUNDLES) {
    if (includes.includes(slug)) {
      const owner = active.find((s) => s.serviceSlug === bundle);
      if (owner) return { coveredBy: owner.name };
    }
    if (bundle === slug) {
      const covered = active.filter((s) => s.serviceSlug && includes.includes(s.serviceSlug)).map((s) => s.name);
      if (covered.length > 0) return { covers: covered };
    }
  }
  return null;
}
