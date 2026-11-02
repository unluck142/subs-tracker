import { findOverlaps, overlapHint, type OverlapInput } from './bundles';

const sub = (id: number, name: string, serviceSlug: string | null, monthlyKopecks = 29900, status: OverlapInput['status'] = 'ACTIVE'): OverlapInput => ({
  id,
  name,
  serviceSlug,
  monthlyKopecks,
  status,
});

describe('пересечения подписок', () => {
  it('Кинопоиск входит в Яндекс Плюс', () => {
    const overlaps = findOverlaps([sub(1, 'Яндекс Плюс', 'yandex-plus', 44900), sub(2, 'Кинопоиск', 'kinopoisk')]);
    expect(overlaps).toEqual([
      { kind: 'bundle', subscriptionId: 2, name: 'Кинопоиск', coveredByName: 'Яндекс Плюс', monthlyKopecks: 29900 },
    ]);
  });

  it('СберПрайм покрывает и Okko, и Звук', () => {
    const overlaps = findOverlaps([sub(1, 'Okko', 'okko'), sub(2, 'Звук', 'zvuk'), sub(3, 'СберПрайм', 'sberprime')]);
    expect(overlaps.map((o) => o.name).sort()).toEqual(['Okko', 'Звук']);
  });

  it('отменённый пакет ничего не покрывает', () => {
    expect(findOverlaps([sub(1, 'Яндекс Плюс', 'yandex-plus', 44900, 'CANCELLED'), sub(2, 'Кинопоиск', 'kinopoisk')])).toEqual([]);
  });

  it('один сервис дважды — дубль', () => {
    const overlaps = findOverlaps([sub(5, 'Okko', 'okko'), sub(3, 'Okko', 'okko'), sub(7, 'Своя', null), sub(8, 'Своя', null)]);
    expect(overlaps).toEqual([
      { kind: 'duplicate', subscriptionId: 5, name: 'Okko', coveredByName: 'Okko', monthlyKopecks: 29900 },
    ]);
  });

  it('подсказка при добавлении нового сервиса', () => {
    const active = [{ name: 'Яндекс Плюс', serviceSlug: 'yandex-plus' }, { name: 'Okko', serviceSlug: 'okko' }];
    expect(overlapHint('kinopoisk', active)).toEqual({ coveredBy: 'Яндекс Плюс' });
    expect(overlapHint('sberprime', active)).toEqual({ covers: ['Okko'] });
    expect(overlapHint('ivi', active)).toBeNull();
    expect(overlapHint(null, active)).toBeNull();
  });
});
