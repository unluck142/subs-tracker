import { CatalogRef, parseMessage } from './parse-message';

const ref = (id: number, name: string, patterns: string[], aliases: string[] = [], period: Partial<CatalogRef> = {}): CatalogRef => ({
  id,
  name,
  periodUnit: 'MONTH',
  periodCount: 1,
  patterns: [name, ...patterns],
  aliases,
  ...period,
});

const CATALOG: CatalogRef[] = [
  ref(1, 'Okko', ['OKKO', 'ОККО'], ['окко']),
  ref(2, 'Кинопоиск', ['KINOPOISK'], ['кп']),
  ref(3, 'Яндекс Плюс', ['YANDEX PLUS', 'ЯНДЕКС ПЛЮС'], ['плюс']),
  ref(4, 'Фитнес-клуб', ['FITNESS'], ['спортзал', 'зал']),
  ref(5, 'Мобильная связь', ['BEELINE', 'БИЛАЙН', 'МТС'], ['телефон']),
];

const TODAY = '2026-11-02';

function ok(text: string) {
  const r = parseMessage(text, CATALOG, TODAY);
  if (!r.ok) throw new Error(`Не разобрано: ${text} (${r.reason})`);
  return r.parsed;
}

describe('подписка текстом', () => {
  it('«Okko 399 15 числа»', () => {
    expect(ok('Okko 399 15 числа')).toMatchObject({
      kind: 'text',
      name: 'Okko',
      priceKopecks: 39900,
      periodUnit: 'MONTH',
      nextChargeDate: '2026-11-15',
    });
  });

  it('число уже прошло — следующий месяц', () => {
    expect(ok('кп 299р 1-го').nextChargeDate).toBe('2026-12-01');
    expect(ok('кп 299р 1-го').name).toBe('Кинопоиск');
  });

  it('31-е в коротком месяце', () => {
    expect(ok('Okko 399 31 числа').nextChargeDate).toBe('2026-11-30');
  });

  it('год, своя подписка, дата словами', () => {
    expect(ok('Netflix 999 в год 20 ноября')).toMatchObject({
      service: null,
      name: 'Netflix',
      priceKopecks: 99900,
      periodUnit: 'YEAR',
      nextChargeDate: '2026-11-20',
    });
  });

  it('синонимы каталога и копейки', () => {
    expect(ok('спортзал 2 500,50 руб в месяц 10 числа')).toMatchObject({
      name: 'Фитнес-клуб',
      priceKopecks: 250050,
      nextChargeDate: '2026-11-10',
    });
  });

  it('пробный период до даты', () => {
    expect(ok('пробный Яндекс Плюс 449 до 05.11')).toMatchObject({
      name: 'Яндекс Плюс',
      isTrial: true,
      nextChargeDate: '2026-11-05',
    });
  });

  it('полгода и квартал', () => {
    expect(ok('хостинг 1200 раз в полгода')).toMatchObject({ name: 'Хостинг', periodUnit: 'MONTH', periodCount: 6 });
    expect(ok('курсы 3000 за квартал')).toMatchObject({ periodUnit: 'MONTH', periodCount: 3 });
  });

  it('без даты — через месяц от сегодня', () => {
    expect(ok('Okko 399').nextChargeDate).toBe('2026-12-02');
  });

  it('без цены — просим цену', () => {
    expect(parseMessage('Okko', CATALOG, TODAY)).toEqual({ ok: false, reason: 'no-price', name: 'Okko' });
  });

  it('просто разговор — не подписка', () => {
    expect(parseMessage('привет', CATALOG, TODAY)).toEqual({ ok: false, reason: 'unknown' });
    expect(parseMessage('спасибо!', CATALOG, TODAY).ok).toBe(false);
  });
});

describe('СМС и пуши банков', () => {
  it('Сбер', () => {
    expect(ok('VISA1234 15:42 Покупка 399р OKKO Баланс: 12345.67р')).toMatchObject({
      kind: 'bank',
      name: 'Okko',
      priceKopecks: 39900,
      nextChargeDate: '2026-12-02',
    });
  });

  it('Т-Банк', () => {
    expect(ok('Покупка, карта *1234. 449 ₽. YANDEX*PLUS. Доступно 12 345 ₽')).toMatchObject({
      name: 'Яндекс Плюс',
      priceKopecks: 44900,
    });
  });

  it('Альфа, незнакомый продавец', () => {
    expect(ok('Покупка 150,00 RUR. Карта *6702. vpn cozy bot. Доступно 8,85 RUR')).toMatchObject({
      kind: 'bank',
      service: null,
      name: 'vpn cozy bot',
      priceKopecks: 15000,
    });
  });

  it('в СМС не цепляемся за общие синонимы', () => {
    // «зал» — синоним фитнеса, но в СМС это просто часть названия магазина
    expect(ok('Покупка 500р ЗАЛ ИГРОВЫХ АВТОМАТОВ Баланс: 100р').service).toBeNull();
  });

  it('переводы — не подписки', () => {
    expect(parseMessage('Перевод 500р Ивану И. Баланс: 100р', CATALOG, TODAY)).toEqual({ ok: false, reason: 'unknown' });
  });
});
