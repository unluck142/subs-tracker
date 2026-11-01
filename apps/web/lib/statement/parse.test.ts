import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../types';
import { analyzeStatement, matchService, nextChargeAfter, normalizeMerchant, parseTransactions } from './parse';

function service(id: number, name: string, merchantPatterns: string[], extra: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id,
    slug: name.toLowerCase(),
    name,
    category: 'VIDEO',
    color: '#000',
    periodUnit: 'MONTH',
    periodCount: 1,
    suggestedPriceKopecks: null,
    isPopular: false,
    hasCancelGuide: false,
    merchantPatterns,
    ...extra,
  };
}

const CATALOG = [
  service(1, 'Яндекс Плюс', ['YANDEX PLUS', 'PLUS YANDEX', 'ЯНДЕКС ПЛЮС']),
  service(2, 'Okko', ['OKKO']),
  service(3, 'Мобильная связь', ['MTS', 'МТС']),
  service(4, 'МТС Premium', ['MTS PREMIUM', 'МТС PREMIUM']),
];

const TODAY = '2026-11-02';

describe('normalizeMerchant', () => {
  it('убирает служебные слова, города, номера и знаки', () => {
    expect(normalizeMerchant('Оплата в YANDEX*5815*PLUS Moscow RUS')).toBe('YANDEX PLUS');
    expect(normalizeMerchant('PLUS.YANDEX.RU g. Moskva')).toBe('PLUS YANDEX RU');
    expect(normalizeMerchant('Ёлка 123456')).toBe('ЕЛКА');
  });
});

describe('matchService', () => {
  it('берёт самое длинное совпадение', () => {
    expect(matchService('MTS PREMIUM', CATALOG)?.name).toBe('МТС Premium');
    expect(matchService('MTS', CATALOG)?.name).toBe('Мобильная связь');
  });
  it('совпадение только по целым словам', () => {
    expect(matchService('OKKOLAND', CATALOG)).toBeNull();
  });
});

describe('Сбербанк: операция в две строки, списания без знака', () => {
  const lines = [
    'Выписка по счёту дебетовой карты',
    'ДАТА ОПЕРАЦИИ (МСК) КАТЕГОРИЯ СУММА В ВАЛЮТЕ СЧЁТА ОСТАТОК СРЕДСТВ',
    'Дата обработки и код авторизации Описание операции',
    '03.08.2026 13:45 Прочие операции 299,00 12 345,67',
    '04.08.2026 123456 YANDEX*5815*PLUS Moscow RUS',
    '05.08.2026 10:00 Перевод с карты +50 000,00 62 345,67',
    '05.08.2026 654321 SBOL перевод 2202****1234 И. ИВАНОВ',
    '10.08.2026 19:30 Рестораны и кафе 1 450,00 60 895,67',
    '10.08.2026 111111 KOFEYNYA Moscow RUS',
    '20.08.2026 08:00 Отдых и развлечения 1 990,00 58 905,67',
    '20.08.2026 222222 FITSTUDIO PRO Moscow RUS',
    'Продолжение на следующей странице',
    '03.09.2026 13:40 Прочие операции 299,00 58 606,67',
    '04.09.2026 333333 YANDEX*5815*PLUS Moscow RUS',
    '20.09.2026 08:00 Отдых и развлечения 1 990,00 56 616,67',
    '20.09.2026 444444 FITSTUDIO PRO Moscow RUS',
    '25.09.2026 21:00 Рестораны и кафе 870,00 55 746,67',
    '25.09.2026 555555 KOFEYNYA Moscow RUS',
    '03.10.2026 13:41 Прочие операции 299,00 55 447,67',
    '04.10.2026 666666 YANDEX*5815*PLUS Moscow RUS',
    '20.10.2026 08:00 Отдых и развлечения 1 990,00 53 457,67',
    '20.10.2026 777777 FITSTUDIO PRO Moscow RUS',
  ];

  it('разбирает операции, суммы и знак', () => {
    const txs = parseTransactions(lines);
    expect(txs).toHaveLength(9);
    expect(txs[0]).toMatchObject({ date: '2026-08-03', amountKopecks: 29900, isExpense: true });
    expect(txs[0].key).toContain('YANDEX PLUS');
    // Поступление и перевод — не списание
    expect(txs[1]).toMatchObject({ amountKopecks: 5_000_000, isExpense: false });
    expect(txs[2].amountKopecks).toBe(145000);
  });

  it('находит Яндекс Плюс и регулярный спортзал, но не кофейню', () => {
    const { candidates, from, to } = analyzeStatement(lines, CATALOG, [], TODAY);
    expect(from).toBe('2026-08-03');
    expect(to).toBe('2026-10-20');
    expect(candidates.map((c) => c.name).sort()).toEqual(['FITSTUDIO PRO', 'Яндекс Плюс']);

    const plus = candidates.find((c) => c.service?.id === 1)!;
    expect(plus).toMatchObject({
      priceKopecks: 29900,
      periodUnit: 'MONTH',
      periodCount: 1,
      occurrences: 3,
      recurring: true,
      stale: false,
      preselected: true,
      lastChargeDate: '2026-10-03',
      nextChargeDate: '2026-11-03',
    });

    const gym = candidates.find((c) => c.name === 'FITSTUDIO PRO')!;
    expect(gym).toMatchObject({ priceKopecks: 199000, recurring: true, nextChargeDate: '2026-11-20' });
  });

  it('помечает уже добавленные подписки', () => {
    const { candidates } = analyzeStatement(lines, CATALOG, [{ serviceId: 1, name: 'Яндекс Плюс' }], TODAY);
    const plus = candidates.find((c) => c.service?.id === 1)!;
    expect(plus.alreadyAdded).toBe(true);
    expect(plus.preselected).toBe(false);
  });
});

describe('Т-Банк: PDF-справка, списания со знаком минус', () => {
  const lines = [
    'Справка о движении средств',
    'Дата и время операции Дата списания Сумма в валюте операции Сумма операции в валюте карты Описание операции Номер карты',
    '01.10.2026 04.10.2026 -399.00 ₽ -399.00 ₽ Оплата в OKKO Moscow RUS 1234',
    '09:12 10:00',
    '02.10.2026 02.10.2026 +100 000.00 ₽ +100 000.00 ₽ Пополнение. Зарплата ООО РОМАШКА',
    '15:00 15:00',
    '05.10.2026 05.10.2026 -1 230.50 ₽ -1 230.50 ₽ Оплата в PYATEROCHKA 1234 1234',
    '18:40 18:41',
    '12.10.2026 12.10.2026 -20.00 $ -1 850.00 ₽ Оплата в SPOTIFY AB',
    'STOCKHOLM SWE 1234',
  ];

  it('склеивает перенос строки и берёт рублёвую сумму', () => {
    const txs = parseTransactions(lines);
    expect(txs).toHaveLength(4);
    expect(txs[0]).toMatchObject({ date: '2026-10-01', amountKopecks: 39900, isExpense: true });
    expect(txs[1]).toMatchObject({ isExpense: false });
    expect(txs[2].amountKopecks).toBe(123050);
    expect(txs[3]).toMatchObject({ amountKopecks: 185000, isExpense: true });
    expect(txs[3].key).toContain('SPOTIFY');
  });

  it('по одному списанию узнаёт сервис из каталога', () => {
    const { candidates } = analyzeStatement(lines, CATALOG, [], TODAY);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: 'Okko',
      priceKopecks: 39900,
      occurrences: 1,
      recurring: false,
      preselected: true,
      // 1 ноября уже прошло (выписка кончилась раньше) — значит, следующее 1 декабря
      nextChargeDate: '2026-12-01',
    });
  });
});

describe('Т-Банк: CSV-выгрузка', () => {
  const lines = [
    '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание"',
    '"15.07.2026 10:00:01";"15.07.2026";"*1234";"OK";"-990,00";"RUB";"-990,00";"RUB";"";"Связь";"4814";"MTS"',
    '"15.08.2026 10:00:02";"15.08.2026";"*1234";"OK";"-990,00";"RUB";"-990,00";"RUB";"";"Связь";"4814";"MTS"',
    '"15.09.2026 10:00:03";"15.09.2026";"*1234";"FAILED";"-990,00";"RUB";"-990,00";"RUB";"";"Связь";"4814";"MTS"',
    '"16.09.2026 10:00:03";"16.09.2026";"*1234";"OK";"-990,00";"RUB";"-990,00";"RUB";"";"Связь";"4814";"MTS"',
    '"20.09.2026 12:00:00";"20.09.2026";"*1234";"OK";"-5 000,00";"RUB";"-5 000,00";"RUB";"";"Переводы";"";"Перевод Ивану"',
  ].map((l) => l.split(';').map((c) => c.replace(/^"|"$/g, '')).join('  '));

  it('пропускает неуспешные операции и переводы', () => {
    const txs = parseTransactions(lines);
    expect(txs).toHaveLength(5);
    expect(txs.filter((t) => t.isExpense)).toHaveLength(3);
  });

  it('находит связь раз в месяц', () => {
    const { candidates } = analyzeStatement(lines, CATALOG, [], TODAY);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: 'Мобильная связь',
      priceKopecks: 99000,
      occurrences: 3,
      recurring: true,
      nextChargeDate: '2026-11-16',
    });
  });
});

describe('ложные срабатывания', () => {
  it('магазин с разными суммами — не подписка, даже если две покупки совпали', () => {
    const lines = [
      '01.09.2026 10:00 -450,00 PYATEROCHKA',
      '01.10.2026 10:00 -450,00 PYATEROCHKA',
      '05.09.2026 10:00 -1 230,00 PYATEROCHKA',
      '12.09.2026 10:00 -310,00 PYATEROCHKA',
      '19.09.2026 10:00 -2 800,00 PYATEROCHKA',
    ];
    expect(analyzeStatement(lines, CATALOG, [], TODAY).candidates).toEqual([]);
  });

  it('незнакомый продавец с двумя разными суммами — не подписка', () => {
    const lines = ['01.09.2026 10:00 -450,00 SOME SHOP', '01.10.2026 10:00 -480,00 SOME SHOP'];
    expect(analyzeStatement(lines, CATALOG, [], TODAY).candidates).toEqual([]);
  });

  it('ежедневные поездки — не подписка', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `${String(i + 1).padStart(2, '0')}.10.2026 08:00 -64,00 METRO`);
    expect(analyzeStatement(lines, CATALOG, [], TODAY).candidates).toEqual([]);
  });

  it('давно не списывавшаяся подписка помечается и не отмечается галочкой', () => {
    const lines = [
      '01.06.2026 10:00 -399,00 OKKO',
      '01.07.2026 10:00 -399,00 OKKO',
      '15.10.2026 10:00 -100,00 KOFE',
    ];
    const [okko] = analyzeStatement(lines, CATALOG, [], TODAY).candidates;
    expect(okko).toMatchObject({ name: 'Okko', stale: true, preselected: false });
  });
});

describe('nextChargeAfter', () => {
  it('шагает по месяцам, сохраняя число', () => {
    expect(nextChargeAfter('2026-01-31', 'MONTH', 1, '2026-02-10')).toBe('2026-02-28');
    expect(nextChargeAfter('2026-01-31', 'MONTH', 1, '2026-03-01')).toBe('2026-03-31');
    expect(nextChargeAfter('2026-10-20', 'WEEK', 1, '2026-11-02')).toBe('2026-11-03');
    expect(nextChargeAfter('2025-11-10', 'YEAR', 1, '2026-11-02')).toBe('2026-11-10');
  });
});
