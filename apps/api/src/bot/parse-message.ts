/**
 * Разбор сообщения пользователя: подписка текстом («Okko 399 15 числа»)
 * или пересланное СМС/пуш банка («Покупка 399р OKKO Баланс: 1 234р»).
 */
import { addDays, addPeriod, daysInMonth, parts } from '../common/dates';
import type { PeriodUnit } from '../db/schema';

export interface CatalogRef {
  id: number;
  slug: string;
  name: string;
  periodUnit: PeriodUnit;
  periodCount: number;
  /** Точные названия: как сервис называется и как подписан в выписках банков */
  patterns: string[];
  /** Синонимы для поиска («кп», «зал») — только для текста от пользователя, в СМС банка слишком неточные */
  aliases: string[];
}

export interface ParsedMessage {
  /** bank — уведомление банка о списании, text — пользователь написал сам */
  kind: 'bank' | 'text';
  service: CatalogRef | null;
  name: string;
  priceKopecks: number;
  periodUnit: PeriodUnit;
  periodCount: number;
  nextChargeDate: string;
  isTrial: boolean;
}

export type ParseOutcome =
  | { ok: true; parsed: ParsedMessage }
  /** no-price — понятно что, но не понятно сколько; unknown — сообщение не про подписку */
  | { ok: false; reason: 'no-price' | 'unknown'; name?: string };

const MONTHS: Record<string, number> = {
  январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6, июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12,
};

/** Признаки уведомления банка */
const BANK_MARKERS = /покупк|оплат|списан|платеж|платёж|баланс|доступно|остаток|карт[аы]|\*\d{4}|visa|mir|мир\d|mastercard|счет\*?\d|счёт\*?\d/i;

/** Сумма с валютой: «399р», «1 299,00 ₽», «449 RUB» */
const MONEY_WITH_CURRENCY = /(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:₽|р\.?(?![а-яё])|руб\.?|rub|rur)/giu;
/** После этих слов в СМС идёт остаток на карте, а не сумма списания */
const BALANCE_WORDS = /(баланс|доступно|остаток|ост\.?|дост\.?)\s*:?/i;

/** Слова, которые не являются названием подписки */
const FILLER = new Set([
  'ПОКУПКА', 'ОПЛАТА', 'СПИСАНИЕ', 'СПИСАНО', 'ПЛАТЕЖ', 'ПЛАТЁЖ', 'КАРТА', 'КАРТЫ', 'УСПЕШНО', 'СЧЕТ', 'СЧЁТ',
  'VISA', 'MIR', 'МИР', 'MASTERCARD', 'MC', 'ПОДПИСКА', 'ПОДПИСКУ', 'ПОДПИСКИ', 'КАЖДЫЙ', 'КАЖДОЕ', 'КАЖДУЮ',
  'МЕСЯЦ', 'В', 'ЗА', 'ПО', 'ДО', 'С', 'НА', 'РУБ', 'Р', 'RUB', 'RUR', 'ЧИСЛА', 'ЧИСЛО', 'ГО', 'Е', 'ДОБАВЬ',
  'ДОБАВИТЬ', 'ПЛАЧУ', 'ПЛАТИТЬ', 'СТОИТ', 'ПРОБНЫЙ', 'ПРОБНАЯ', 'ПРОБНЫЕ', 'ПЕРИОД', 'ТРИАЛ', 'TRIAL', 'ЗАКАНЧИВАЕТСЯ',
  'СЛЕДУЮЩЕЕ', 'СПИСАНИЯ', 'ЕЖЕМЕСЯЧНО', 'MOSCOW', 'MOSKVA', 'RUS', 'RU',
]);

export function normalize(text: string): string {
  return text
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Сервис каталога, чьё название встречается в тексте целыми словами (самое длинное совпадение).
 * Синонимы проверяем, только если точных совпадений нет.
 */
export function findService(text: string, catalog: CatalogRef[], opts: { aliases: boolean }): CatalogRef | null {
  return bestMatch(text, catalog, 'patterns') ?? (opts.aliases ? bestMatch(text, catalog, 'aliases') : null);
}

function bestMatch(text: string, catalog: CatalogRef[], field: 'patterns' | 'aliases'): CatalogRef | null {
  const haystack = ` ${normalize(text)} `;
  let best: { ref: CatalogRef; length: number } | null = null;
  for (const ref of catalog) {
    for (const pattern of ref[field]) {
      const p = normalize(pattern);
      if (p.length >= 2 && haystack.includes(` ${p} `) && (!best || p.length > best.length)) {
        best = { ref, length: p.length };
      }
    }
  }
  return best?.ref ?? null;
}

function toKopecks(rubles: string, kopecks: string | undefined): number {
  return Number(rubles.replace(/[   ]/g, '')) * 100 + Number((kopecks ?? '0').padEnd(2, '0'));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Ближайшая дата с этим числом месяца, не раньше сегодня */
function nextDayOfMonth(day: number, today: string): string {
  const { y, m, d } = parts(today);
  const make = (yy: number, mm: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, daysInMonth(yy, mm))).padStart(2, '0')}`;
  if (day >= d) return make(y, m);
  return m === 12 ? make(y + 1, 1) : make(y, m + 1);
}

/** Дата без года: ближайшая в будущем (или сегодня) */
function nextDate(day: number, month: number, today: string): string | null {
  const { y } = parts(today);
  for (const yy of [y, y + 1]) {
    if (day < 1 || day > daysInMonth(yy, month)) return null;
    const iso = `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso >= today) return iso;
  }
  return null;
}

function detectPeriod(text: string): { unit: PeriodUnit; count: number } | null {
  const t = text.toLowerCase();
  if (/полгода|6\s*мес|раз в полгода/.test(t)) return { unit: 'MONTH', count: 6 };
  if (/квартал|3\s*мес/.test(t)) return { unit: 'MONTH', count: 3 };
  if (/(в|за|\/)\s*год|ежегодн|годов|раз в год/.test(t)) return { unit: 'YEAR', count: 1 };
  if (/(в|за|\/)\s*недел|еженедел|раз в недел/.test(t)) return { unit: 'WEEK', count: 1 };
  if (/(в|за|\/)\s*мес|ежемесячн|каждый месяц/.test(t)) return { unit: 'MONTH', count: 1 };
  return null;
}

export function parseMessage(raw: string, catalog: CatalogRef[], today: string): ParseOutcome {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || text.length > 600) return { ok: false, reason: 'unknown' };
  // Перевод, возврат, пополнение — не подписка, даже если похоже на СМС банка
  if (/перевод|возврат|пополнен|зачислен|снятие/i.test(text)) return { ok: false, reason: 'unknown' };

  const isBank = BANK_MARKERS.test(text) && MONEY_WITH_CURRENCY.test(text);
  MONEY_WITH_CURRENCY.lastIndex = 0;
  const service = findService(text, catalog, { aliases: !isBank });
  return isBank ? parseBank(text, service, today) : parseText(text, service, today);
}

function parseBank(text: string, service: CatalogRef | null, today: string): ParseOutcome {
  // Всё после «Баланс:»/«Доступно» — остаток на карте
  const balanceAt = text.search(BALANCE_WORDS);
  const main = balanceAt >= 0 ? text.slice(0, balanceAt) : text;
  const money = [...main.matchAll(MONEY_WITH_CURRENCY)];
  if (money.length === 0) return { ok: false, reason: 'no-price', name: service?.name };
  const priceKopecks = toKopecks(money[0][1], money[0][2]);

  let name = service?.name ?? null;
  if (!name) {
    const rest = main
      .replace(MONEY_WITH_CURRENCY, ' ')
      .replace(/\d{1,2}[.:]\d{2}(?:[.:]\d{2,4})?/g, ' ') // время и даты
      .replace(/[*]\d{4}|\b(?:VISA|MIR|MC|ECMC|СЧЁТ|СЧЕТ)\d{4}\b/gi, ' ');
    const words = rest
      .split(/[\s,.;:!]+/)
      .filter((w) => w && /\p{L}/u.test(w) && !FILLER.has(normalize(w)));
    name = words.join(' ').slice(0, 40).trim() || null;
  }
  if (!name) return { ok: false, reason: 'unknown' };

  const unit = service?.periodUnit ?? 'MONTH';
  const count = service?.periodCount ?? 1;
  return {
    ok: true,
    parsed: {
      kind: 'bank',
      service,
      name,
      priceKopecks,
      periodUnit: unit,
      periodCount: count,
      // Списание случилось сегодня — следующее через период
      nextChargeDate: addPeriod(today, unit, count, parts(today).d),
      isTrial: false,
    },
  };
}

function parseText(text: string, service: CatalogRef | null, today: string): ParseOutcome {
  let rest = ` ${text} `;
  let date: string | null = null;

  // «20.11», «20.11.2026»
  const dm = rest.match(/(?<!\d)(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/);
  if (dm) {
    const [d, m] = [Number(dm[1]), Number(dm[2])];
    if (dm[3]) {
      const y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)) {
        date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    } else if (m >= 1 && m <= 12) {
      date = nextDate(d, m, today);
    }
    if (date) rest = rest.replace(dm[0], ' ');
  }
  // «20 ноября»
  if (!date) {
    const word = rest.match(/(?<!\d)(\d{1,2})\s+(январ|феврал|март|апрел|ма|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*/i);
    if (word) {
      date = nextDate(Number(word[1]), MONTHS[word[2].toLowerCase()], today);
      if (date) rest = rest.replace(word[0], ' ');
    }
  }
  // «15 числа», «15-го», «каждое 15-е»
  if (!date) {
    const day = rest.match(/(?<!\d)(\d{1,2})\s*(?:-?го|-?е|числа|число)(?![а-яё])/i);
    if (day && Number(day[1]) >= 1 && Number(day[1]) <= 31) {
      date = nextDayOfMonth(Number(day[1]), today);
      rest = rest.replace(day[0], ' ');
    }
  }
  if (/завтра/i.test(rest)) {
    date = date ?? addDays(today, 1);
    rest = rest.replace(/завтра/i, ' ');
  } else if (/сегодня/i.test(rest)) {
    date = date ?? today;
    rest = rest.replace(/сегодня/i, ' ');
  }

  const period = detectPeriod(rest);
  rest = rest.replace(/полгода|квартал|ежемесячно|ежегодно|еженедельно|(в|за|\/)\s*(год|недел[а-я]*|мес[а-я]*)|раз в [а-я]+|каждый месяц|\d\s*мес[а-я]*/gi, ' ');
  const isTrial = /пробн|триал|trial/i.test(text);

  // Цена: число с валютой, а если валюты нет — первое оставшееся число
  let priceKopecks: number | null = null;
  const withCurrency = [...rest.matchAll(MONEY_WITH_CURRENCY)];
  if (withCurrency.length > 0) {
    priceKopecks = toKopecks(withCurrency[0][1], withCurrency[0][2]);
    rest = rest.replace(withCurrency[0][0], ' ');
  } else {
    const plain = rest.match(/(?<![\d.,])(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?![\d.,]*\d)/);
    if (plain) {
      priceKopecks = toKopecks(plain[1], plain[2]);
      rest = rest.replace(plain[0], ' ');
    }
  }

  const words = rest
    .split(/[\s,.;:!?—-]+/)
    .filter((w) => w && /\p{L}/u.test(w) && !FILLER.has(normalize(w)));
  const customName = capitalize(words.join(' ').slice(0, 40).trim());
  const name = service?.name ?? (customName || null);

  if (!name) return { ok: false, reason: 'unknown' };
  if (priceKopecks === null || priceKopecks <= 0) {
    // Цену переспрашиваем, только если узнали сервис, — иначе это просто разговор («привет»)
    return service ? { ok: false, reason: 'no-price', name } : { ok: false, reason: 'unknown' };
  }

  const unit = period?.unit ?? service?.periodUnit ?? 'MONTH';
  const count = period?.count ?? service?.periodCount ?? 1;
  return {
    ok: true,
    parsed: {
      kind: 'text',
      service,
      name,
      priceKopecks,
      periodUnit: unit,
      periodCount: count,
      // Дату не назвали — считаем, что списание через период от сегодня; пользователь поправит
      nextChargeDate: date ?? addPeriod(today, unit, count, parts(today).d),
      isTrial,
    },
  };
}
