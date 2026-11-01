/**
 * Поиск подписок в выписке банка.
 *
 * Работает только на устройстве пользователя: выписка не уходит на сервер.
 * На вход — строки текста (из PDF или CSV), на выходе — кандидаты в подписки.
 *
 * Как это устроено:
 * 1. Строки режем на операции: операция начинается со строки, где первым идёт дата.
 *    У Сбера операция занимает две строки (вторая — дата обработки и описание),
 *    у Т-Банка описание может переноситься — поэтому склеиваем продолжения.
 * 2. Из операции берём дату, сумму (первая сумма в операции) и описание.
 * 3. Группируем списания по продавцу и ищем регулярные: одинаковая сумма
 *    раз в неделю / месяц / квартал / полгода / год.
 * 4. Если продавец есть в каталоге (Яндекс Плюс, Okko…), хватает одного списания:
 *    в выписке за месяц каждая подписка встречается ровно один раз.
 */
import type { CatalogItem, PeriodUnit } from '../types';

export interface Transaction {
  /** YYYY-MM-DD */
  date: string;
  /** Сумма операции в копейках, всегда положительная */
  amountKopecks: number;
  isExpense: boolean;
  /** Описание как в выписке (без дат и сумм) */
  description: string;
  /** Нормализованный продавец — по нему группируем операции */
  key: string;
}

export interface Candidate {
  key: string;
  name: string;
  service: CatalogItem | null;
  priceKopecks: number;
  periodUnit: PeriodUnit;
  periodCount: number;
  /** Сколько похожих списаний нашлось */
  occurrences: number;
  lastChargeDate: string;
  nextChargeDate: string;
  /** Регулярность подтверждена несколькими списаниями (а не одним по каталогу) */
  recurring: boolean;
  /** Давно не списывалась — похоже, уже отменена */
  stale: boolean;
  /** Такая подписка уже есть у пользователя */
  alreadyAdded: boolean;
  /** Отметить галочкой по умолчанию */
  preselected: boolean;
}

export interface ParseResult {
  transactions: Transaction[];
  candidates: Candidate[];
  /** Период выписки — чтобы показать пользователю, что мы прочитали */
  from: string | null;
  to: string | null;
}

// ─── Регулярные выражения ────────────────────────────────────────────────────

const DATE_SRC = String.raw`(\d{2})\.(\d{2})\.(\d{4}|\d{2})(?!\d)`;
const ISO_DATE_SRC = String.raw`(\d{4})-(\d{2})-(\d{2})(?!\d)`;
const TIME_SRC = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;

const LINE_STARTS_WITH_DATE = new RegExp(String.raw`^\s*(?:${DATE_SRC}|${ISO_DATE_SRC})`);
const LINE_STARTS_WITH_DATE_TIME = new RegExp(String.raw`^\s*(?:${DATE_SRC}|${ISO_DATE_SRC})[\sT,]+${TIME_SRC}`);
const ANY_DATE = new RegExp(String.raw`(?<!\d)(?:${DATE_SRC}|${ISO_DATE_SRC})`, 'g');
const ANY_TIME = new RegExp(String.raw`(?<![\d:])${TIME_SRC}(?![\d:])`, 'g');

/**
 * Сумма: «299,00», «-1 299.00 ₽», «+5 000,00», «−299,00 RUB».
 * Обязательно две цифры после запятой — так не путаем суммы с кодами и номерами.
 */
const MONEY = /([+\-−–]\s?)?(\d{1,3}(?:[   ]\d{3})+|\d+)[.,](\d{2})(?!\d)\s*(₽|руб\.?|RUB|RUR|\$|USD|€|EUR)?/giu;

/** Маски карт: «*1234», «2200 **** 1234», «220070******1234» */
const CARD_MASK = /\d{0,6}[\s]?\*{2,}[\s]?\d{4}|\*\d{4}/g;

/** Строки-«шум»: шапки таблиц, колонтитулы, реквизиты банка */
const NOISE_LINE =
  /ДАТА ОПЕРАЦИИ|ДАТА ОБРАБОТКИ|КОД АВТОРИЗАЦИИ|ОСТАТОК|СТРАНИЦА|ПРОДОЛЖЕНИЕ|СУММА В ВАЛЮТЕ|ОПИСАНИЕ ОПЕРАЦИИ|ВЫПИСКА|ИТОГО|ЛИЦЕНЗИ|WWW\.|ДАТА СПИСАНИЯ|НОМЕР КАРТЫ|СПРАВКА|ВРЕМЯ ОПЕРАЦИИ|СУММА ОПЕРАЦИИ|ДВИЖЕНИ|ПОСТУПЛЕНИЯ/u;

/** Операции, которые точно не подписки */
const NOT_SUBSCRIPTION =
  /ПЕРЕВОД|ПОПОЛНЕНИЕ|СНЯТИЕ|НАЛИЧН|ЗАЧИСЛЕНИЕ|ВОЗВРАТ|ОТМЕНА|КЕШБЭК|КЭШБЭК|КЕШБЕК|КЭШБЕК|CASHBACK|ПРОЦЕНТ|ЗАРПЛАТ|ЗАРАБОТН|ПОГАШЕНИЕ|ATM|BANKOMAT|БАНКОМАТ|СБП|FAILED|ОТКЛОНЕН/u;

/** Слова, которые не говорят о продавце: «Оплата в YANDEX PLUS Moscow RUS» → «YANDEX PLUS» */
const STOP_WORDS = new Set([
  'ОПЛАТА', 'ОПЛАТЫ', 'ПОКУПКА', 'ОПЕРАЦИЯ', 'СПИСАНИЕ', 'В', 'ПО', 'ЗА', 'НА', 'С', 'КАРТЕ', 'КАРТЫ', 'УСЛУГ',
  'УСЛУГИ', 'ТОВАРОВ', 'ПЛАТЕЖ', 'ПЛАТЁЖ', 'OK', 'RUB', 'RUR', 'USD', 'EUR', 'РУБ', 'RUS', 'MOSCOW', 'MOSKVA',
  'МОСКВА', 'G', 'Г', 'SANKT', 'PETERBURG', 'ST', 'PETERSBURG', 'САНКТ', 'ПЕТЕРБУРГ', 'SPB', 'MSK',
]);

/** Категории банков: попадают в строку операции, но в название подписки им не нужно */
const CATEGORY_PHRASES = [
  'Прочие операции', 'Прочие расходы', 'Цифровые товары', 'Супермаркеты', 'Рестораны и кафе', 'Рестораны',
  'Фастфуд', 'Транспорт', 'Отдых и развлечения', 'Развлечения', 'Здоровье и красота', 'Коммунальные платежи, связь, интернет',
  'Коммунальные платежи', 'Одежда и аксессуары', 'Все для дома', 'Автомобиль', 'Образование', 'Мобильная связь',
  'Связь, телеком', 'Сервис', 'Книги', 'Кино', 'Музыка', 'Аптеки', 'Маркетплейсы', 'Онлайн-кинотеатры',
];

// ─── Нормализация ────────────────────────────────────────────────────────────

/** «Оплата в YANDEX*5815*PLUS Moscow RUS» → «YANDEX PLUS» */
export function normalizeMerchant(text: string): string {
  return text
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t) && !/^\d{4,}$/.test(t))
    .join(' ');
}

function cleanDisplayName(description: string): string {
  let text = description;
  for (const phrase of CATEGORY_PHRASES) {
    text = text.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  const words = text
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')) && !/^\d{4,}$/.test(w))
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const name = words.join(' ').trim();
  return name.length > 40 ? `${name.slice(0, 39)}…` : name || 'Подписка';
}

function toIsoDate(m: RegExpMatchArray | RegExpExecArray): string {
  // Группы: 1-3 — ДД.ММ.ГГГГ, 4-6 — ГГГГ-ММ-ДД
  if (m[4]) return `${m[4]}-${m[5]}-${m[6]}`;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

function isValidDate(iso: string): boolean {
  const [y, mo, d] = iso.split('-').map(Number);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// ─── Строки → операции ───────────────────────────────────────────────────────

interface Block {
  date: string;
  lines: string[];
}

interface MoneyToken {
  sign: '+' | '-' | null;
  kopecks: number;
  currency: string | null;
}

function findMoney(text: string): MoneyToken[] {
  const result: MoneyToken[] = [];
  for (const m of text.matchAll(MONEY)) {
    const rubles = Number(m[2].replace(/[   ]/g, ''));
    const sign = m[1] ? (m[1].trim() === '+' ? '+' : '-') : null;
    result.push({ sign, kopecks: rubles * 100 + Number(m[3]), currency: m[4]?.toUpperCase() ?? null });
  }
  return result;
}

function stripForDescription(text: string): string {
  return text
    .replace(ANY_DATE, ' ')
    .replace(ANY_TIME, ' ')
    .replace(CARD_MASK, ' ')
    .replace(MONEY, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitBlocks(lines: string[]): Block[] {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Если в выписке есть строки «дата + время» — операция начинается только с них,
  // а строки с одной датой — продолжение (у Сбера это дата обработки и код авторизации)
  const withTime = clean.filter((l) => LINE_STARTS_WITH_DATE_TIME.test(l)).length;
  const startRe = withTime >= 2 ? LINE_STARTS_WITH_DATE_TIME : LINE_STARTS_WITH_DATE;

  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of clean) {
    if (NOISE_LINE.test(line.toUpperCase())) continue;
    const m = line.match(startRe);
    if (m) {
      const date = toIsoDate(m);
      if (isValidDate(date)) {
        current = { date, lines: [line] };
        blocks.push(current);
        continue;
      }
    }
    // Продолжение операции. Больше трёх строк — уже не она, а мусор между таблицами.
    if (current && current.lines.length < 3) current.lines.push(line);
  }

  // Без «даты + времени» строка с датой, но без суммы — это продолжение предыдущей операции
  if (startRe === LINE_STARTS_WITH_DATE) {
    const merged: Block[] = [];
    for (const block of blocks) {
      const prev = merged[merged.length - 1];
      if (prev && findMoney(stripDates(block.lines.join(' '))).length === 0) {
        prev.lines.push(...block.lines);
      } else {
        merged.push(block);
      }
    }
    return merged;
  }
  return blocks;
}

function stripDates(text: string): string {
  return text.replace(ANY_DATE, ' ').replace(ANY_TIME, ' ');
}

/** Разбор строк выписки в список операций */
export function parseTransactions(lines: string[]): Transaction[] {
  const blocks = splitBlocks(lines);
  const parsed = blocks
    .map((block) => {
      const text = stripDates(block.lines.join(' ')).replace(CARD_MASK, ' ');
      const money = findMoney(text);
      if (money.length === 0) return null;
      // Если у сумм указана валюта — берём первую рублёвую (вторая колонка у Т-Банка — сумма в валюте карты)
      const rub = money.find((t) => t.currency && /₽|РУБ|RUB|RUR/.test(t.currency));
      const amount = rub ?? money[0];
      const description = stripForDescription(block.lines.join(' '));
      return { date: block.date, amount, description };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.amount.kopecks > 0);

  // Как банк помечает списания: Т-Банк и Альфа пишут «-299,00», Сбер — «299,00» без знака
  // (а поступления — «+5 000,00»). Определяем по всей выписке.
  const negatives = parsed.filter((p) => p.amount.sign === '-').length;
  const minusMeansExpense = negatives >= Math.max(1, parsed.length * 0.2);

  return parsed.map((p) => {
    const upper = p.description.toUpperCase().replace(/Ё/g, 'Е');
    const signExpense = minusMeansExpense ? p.amount.sign === '-' : p.amount.sign !== '+';
    return {
      date: p.date,
      amountKopecks: p.amount.kopecks,
      isExpense: signExpense && !NOT_SUBSCRIPTION.test(upper),
      description: p.description,
      key: normalizeMerchant(p.description),
    };
  });
}

// ─── Даты ────────────────────────────────────────────────────────────────────

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

function addMonthsAnchored(iso: string, months: number, anchorDay: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(anchorDay, dim)).padStart(2, '0')}`;
}

/** Следующее списание не раньше today: шагаем от последнего списания по периоду */
export function nextChargeAfter(last: string, unit: PeriodUnit, count: number, today: string): string {
  const anchor = Number(last.slice(8, 10));
  let next = last;
  let steps = 0;
  do {
    steps += 1;
    next =
      unit === 'WEEK'
        ? fromDayNumber(dayNumber(last) + 7 * count * steps)
        : addMonthsAnchored(last, (unit === 'YEAR' ? 12 : 1) * count * steps, anchor);
  } while (next < today && steps < 1000);
  return next;
}

// ─── Поиск регулярных списаний ───────────────────────────────────────────────

interface PeriodRule {
  unit: PeriodUnit;
  count: number;
  days: number;
  /** Допуск в днях: списание может уехать из-за выходных или повторной попытки */
  tolerance: number;
  minOccurrences: number;
}

const PERIOD_RULES: PeriodRule[] = [
  { unit: 'WEEK', count: 1, days: 7, tolerance: 1, minOccurrences: 3 },
  { unit: 'MONTH', count: 1, days: 30.44, tolerance: 4, minOccurrences: 2 },
  { unit: 'MONTH', count: 3, days: 91.3, tolerance: 8, minOccurrences: 2 },
  { unit: 'MONTH', count: 6, days: 182.6, tolerance: 12, minOccurrences: 2 },
  { unit: 'YEAR', count: 1, days: 365.25, tolerance: 15, minOccurrences: 2 },
];

function periodDays(unit: PeriodUnit, count: number): number {
  return (unit === 'WEEK' ? 7 : unit === 'YEAR' ? 365.25 : 30.44) * count;
}

/** Самая большая группа списаний с близкой суммой (±10%) */
function amountCluster(txs: Transaction[]): Transaction[] {
  let best: Transaction[] = [];
  for (const ref of txs) {
    const tol = Math.max(ref.amountKopecks * 0.1, 100);
    const members = txs.filter((t) => Math.abs(t.amountKopecks - ref.amountKopecks) <= tol);
    if (members.length > best.length) best = members;
  }
  return best;
}

/** Подходит ли ряд дат под период: интервалы ≈ период (или 2 периода — пропущенный платёж) */
function detectPeriod(dates: string[]): PeriodRule | null {
  if (dates.length < 2) return null;
  const intervals = dates.slice(1).map((d, i) => dayNumber(d) - dayNumber(dates[i]));
  for (const rule of PERIOD_RULES) {
    if (dates.length < rule.minOccurrences) continue;
    let exact = 0;
    const fits = intervals.every((iv) => {
      if (Math.abs(iv - rule.days) <= rule.tolerance) {
        exact += 1;
        return true;
      }
      return rule.days < 60 && Math.abs(iv - 2 * rule.days) <= rule.tolerance * 2;
    });
    if (fits && exact >= Math.ceil(intervals.length / 2)) return rule;
  }
  return null;
}

/** Каталожный сервис, чьё банковское название встречается в описании (самое длинное совпадение) */
export function matchService(key: string, catalog: CatalogItem[]): CatalogItem | null {
  const haystack = ` ${key} `;
  let best: { item: CatalogItem; length: number } | null = null;
  for (const item of catalog) {
    for (const pattern of item.merchantPatterns ?? []) {
      const p = normalizeMerchant(pattern);
      if (p && haystack.includes(` ${p} `) && (!best || p.length > best.length)) {
        best = { item, length: p.length };
      }
    }
  }
  return best?.item ?? null;
}

export interface ExistingSubscription {
  serviceId: number | null;
  name: string;
}

export function findCandidates(
  transactions: Transaction[],
  catalog: CatalogItem[],
  existing: ExistingSubscription[],
  today: string,
): Candidate[] {
  const statementEnd = transactions.reduce((max, t) => (t.date > max ? t.date : max), '');
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.isExpense || !t.key) continue;
    groups.set(t.key, [...(groups.get(t.key) ?? []), t]);
  }

  const candidates: Candidate[] = [];
  for (const [key, txs] of groups) {
    const service = matchService(key, catalog);
    // Одна и та же операция могла попасть дважды (дубль строки) — убираем
    const unique = [...new Map(txs.map((t) => [`${t.date}:${t.amountKopecks}`, t])).values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const cluster = amountCluster(unique);
    // Продавец, где суммы разные (магазин, такси), — не подписка, даже если пара покупок совпала
    const consistent = cluster.length / unique.length >= 0.5;
    const rule = consistent ? detectPeriod(cluster.map((t) => t.date)) : null;
    // Незнакомому продавцу с двумя списаниями верим, только если суммы совпали до рубля
    const strictEnough =
      rule && (cluster.length >= 3 || service || Math.abs(cluster[0].amountKopecks - cluster[1].amountKopecks) <= 100);

    if (!(rule && strictEnough) && !service) continue;

    const last = (rule ? cluster : unique)[(rule ? cluster : unique).length - 1];
    const unit = rule?.unit ?? service!.periodUnit;
    const count = rule?.count ?? service!.periodCount;
    const recurring = Boolean(rule && strictEnough);
    const stale = dayNumber(statementEnd) - dayNumber(last.date) > periodDays(unit, count) + (rule?.tolerance ?? 4);
    const name = service?.name ?? cleanDisplayName(last.description);
    const alreadyAdded = existing.some((e) =>
      service ? e.serviceId === service.id : e.name.trim().toLowerCase() === name.toLowerCase(),
    );

    candidates.push({
      key,
      name,
      service,
      priceKopecks: last.amountKopecks,
      periodUnit: unit,
      periodCount: count,
      occurrences: recurring ? cluster.length : unique.length,
      lastChargeDate: last.date,
      nextChargeDate: nextChargeAfter(last.date, unit, count, today),
      recurring,
      stale,
      alreadyAdded,
      preselected: !alreadyAdded && !stale && (recurring || consistent),
    });
  }

  // Один сервис мог прийти под разными описаниями («YANDEX PLUS» и «ЯНДЕКС ПЛЮС») — оставляем более надёжный
  const byService = new Map<string, Candidate>();
  for (const c of candidates) {
    const id = c.service ? `s${c.service.id}` : `k${c.key}`;
    const prev = byService.get(id);
    if (!prev || score(c) > score(prev)) byService.set(id, c);
  }

  return [...byService.values()].sort(
    (a, b) => Number(a.alreadyAdded) - Number(b.alreadyAdded) || Number(a.stale) - Number(b.stale) || b.priceKopecks - a.priceKopecks,
  );
}

function score(c: Candidate): number {
  return (c.recurring ? 1000 : 0) + (c.stale ? 0 : 500) + c.occurrences;
}

/** Полный разбор: строки выписки → операции → кандидаты в подписки */
export function analyzeStatement(
  lines: string[],
  catalog: CatalogItem[],
  existing: ExistingSubscription[],
  today: string,
): ParseResult {
  const transactions = parseTransactions(lines);
  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    candidates: findCandidates(transactions, catalog, existing, today),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}
