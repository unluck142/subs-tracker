/**
 * Тексты бота. Вынесены отдельно, чтобы их было легко править и тестировать.
 * Используем parse_mode: HTML, поэтому всё пользовательское экранируем.
 */
import { formatRub, inDaysLabel, periodLabel } from '../common/money';
import type { Stats, SubscriptionView } from '../subscriptions/subscriptions.service';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function welcomeText(firstName: string | null, hasWebApp: boolean): string {
  const name = firstName ? `, ${escapeHtml(firstName)}` : '';
  return [
    `Привет${name}! 👋`,
    '',
    'Я — <b>«Не спишут»</b>. Слежу за твоими подписками и напоминаю <b>до того, как спишут деньги</b>.',
    '',
    '• Все подписки и карты в одном месте',
    '• Напоминания за день-два до списания',
    '• Пробные периоды — предупрежу, пока ещё не поздно отменить',
    '• Сколько уходит на подписки в месяц и в год',
    '',
    'Подписку можно добавить в приложении, написать мне текстом («Okko 399 15 числа») или переслать СМС банка о списании.',
    '',
    hasWebApp
      ? 'Нажми кнопку ниже, чтобы добавить первую подписку.'
      : 'Мини-приложение пока не настроено (нет WEBAPP_URL). Пока доступна команда /list.',
  ].join('\n');
}

export const HELP_TEXT = [
  '<b>Что я умею</b>',
  '',
  '/start — открыть приложение',
  '/list — список подписок и сумма в месяц',
  '/help — эта справка',
  '',
  'Подписки удобно смотреть и редактировать в приложении — кнопка «Подписки» слева от поля ввода.',
  '',
  'А ещё можно просто <b>написать мне</b> подписку («Okko 399 15 числа») или <b>переслать СМС банка</b> о списании.',
].join('\n');

export function reminderText(sub: SubscriptionView): string {
  const name = `«${escapeHtml(sub.name)}»`;
  const when = inDaysLabel(sub.daysLeft);
  const price = formatRub(sub.priceKopecks);
  if (sub.isTrial) {
    return [
      `🎁 Пробный период ${name} заканчивается <b>${when}</b> — спишут <b>${price}</b>.`,
      '',
      'Если не пользуешься — самое время отменить.',
    ].join('\n');
  }
  return [
    `⏰ ${capitalize(when)} спишут <b>${price}</b> за ${name} (${periodLabel(sub.periodUnit, sub.periodCount)}).`,
    '',
    'Пользуешься? Если нет — отмени, пока не списали.',
  ].join('\n');
}

export function listText(subs: SubscriptionView[], stats: Stats): string {
  if (subs.length === 0) {
    return 'Пока нет ни одной подписки. Открой приложение и добавь первую — это займёт полминуты.';
  }
  const lines = subs.map((s) => {
    const trial = s.isTrial ? ' 🎁' : '';
    return `• <b>${escapeHtml(s.name)}</b>${trial} — ${formatRub(s.priceKopecks)} ${periodLabel(
      s.periodUnit,
      s.periodCount,
    )}, ${inDaysLabel(s.daysLeft)}`;
  });
  return [
    `<b>Твои подписки</b> (${subs.length})`,
    '',
    ...lines,
    '',
    `В месяц: <b>${formatRub(stats.monthlyKopecks)}</b>`,
    `В год: <b>${formatRub(stats.yearlyKopecks)}</b>`,
  ].join('\n');
}

export function cancelledText(sub: SubscriptionView, savedMonthlyTotal: number): string {
  return [
    `✅ Отметил «${escapeHtml(sub.name)}» как отменённую. Больше не напоминаю.`,
    '',
    `Экономия: <b>${formatRub(sub.monthlyKopecks)}</b> в месяц.`,
    savedMonthlyTotal > sub.monthlyKopecks
      ? `Всего благодаря отменам ты экономишь ${formatRub(savedMonthlyTotal)} в месяц 🎉`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function keepText(sub: SubscriptionView): string {
  return `👌 Оставляем «${escapeHtml(sub.name)}». Напомню перед следующим списанием.`;
}

/**
 * Как отменить подписку. Если для сервиса есть инструкция — показываем её,
 * плюс общий способ через банк, который работает почти всегда.
 */
export function howToCancelText(name: string, cancelSteps: string | null): string {
  const parts = [`<b>Как отменить «${escapeHtml(name)}»</b>`, ''];
  if (cancelSteps) {
    parts.push(escapeHtml(cancelSteps), '');
  } else {
    parts.push(
      'Зайди в настройки аккаунта сервиса → раздел «Подписка» или «Оплата» → «Отменить автопродление».',
      '',
    );
  }
  parts.push(
    '<b>Если не получается</b> — отвяжи карту в приложении банка:',
    '• Т-Банк: раздел «Подписки»',
    '• Сбер: поиск → «Куда привязана карта»',
    '',
    'С 1 марта 2026 года сервис обязан прекратить автосписания, если ты отказался от использования карты (376-ФЗ). ' +
      'Если списали после отказа — можно требовать возврат.',
  );
  return parts.join('\n');
}

// ─── Подписка текстом и пересланные СМС банка ───────────────────────────────

const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** '2026-11-15' → «15 ноября» */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return longDate.format(new Date(Date.UTC(y, m - 1, d)));
}

export interface DraftView {
  kind: 'bank' | 'text';
  name: string;
  priceKopecks: number;
  periodUnit: SubscriptionView['periodUnit'];
  periodCount: number;
  nextChargeDate: string;
  isTrial: boolean;
}

export function draftText(d: DraftView): string {
  const name = `<b>${escapeHtml(d.name)}</b>`;
  const price = `${formatRub(d.priceKopecks)} ${periodLabel(d.periodUnit, d.periodCount)}`;
  const head =
    d.kind === 'bank'
      ? `💳 Вижу списание <b>${formatRub(d.priceKopecks)}</b> за ${name}. Добавить в подписки?`
      : `Добавить подписку?`;
  const lines = [head, ''];
  if (d.kind === 'text') lines.push(`${name} — ${price}`);
  lines.push(
    d.isTrial
      ? `🎁 Пробный период закончится <b>${formatDateLong(d.nextChargeDate)}</b>`
      : `Следующее списание: <b>${formatDateLong(d.nextChargeDate)}</b>`,
    '',
    'Напомню за день. Дату и цену можно поправить в приложении.',
  );
  return lines.join('\n');
}

export function addedText(name: string, monthlyTotal: number): string {
  return `✅ Добавил «${escapeHtml(name)}». Теперь на подписки уходит <b>${formatRub(monthlyTotal)}</b> в месяц.`;
}

/** Цена в сообщении отличается от сохранённой — подписка подорожала или подешевела */
export function priceChangedText(sub: SubscriptionView, newPriceKopecks: number): string {
  const diff = newPriceKopecks - sub.priceKopecks;
  const up = diff > 0;
  const perYear = Math.abs(diff) * (sub.periodUnit === 'YEAR' ? 1 : sub.periodUnit === 'WEEK' ? 52 : 12 / sub.periodCount);
  return [
    `${up ? '📈' : '📉'} «${escapeHtml(sub.name)}» ${up ? 'подорожала' : 'подешевела'}: было <b>${formatRub(sub.priceKopecks)}</b>, теперь <b>${formatRub(newPriceKopecks)}</b>.`,
    up ? `Это ещё ${formatRub(perYear)} в год.` : `Экономия ${formatRub(perYear)} в год.`,
    '',
    'Обновить цену?',
  ].join('\n');
}

export function priceUpdatedText(name: string, priceKopecks: number): string {
  return `👌 Обновил: «${escapeHtml(name)}» теперь ${formatRub(priceKopecks)}.`;
}

export function alreadyTrackedText(sub: SubscriptionView, fromBank: boolean): string {
  return fromBank
    ? `✅ Списание за «${escapeHtml(sub.name)}» — ${formatRub(sub.priceKopecks)}, как и ожидалось. Следующее — ${formatDateLong(sub.nextChargeDate)}.`
    : `«${escapeHtml(sub.name)}» уже есть в твоём списке: ${formatRub(sub.priceKopecks)} ${periodLabel(sub.periodUnit, sub.periodCount)}, следующее списание ${formatDateLong(sub.nextChargeDate)}.`;
}

export function askPriceText(name: string): string {
  return `Сколько стоит «${escapeHtml(name)}»? Напиши, например: <code>${escapeHtml(name)} 299 15 числа</code>`;
}

export const ADD_BY_TEXT_HINT = [
  'Можно добавить подписку прямо здесь:',
  '',
  '✍️ <b>Напиши</b>, например:',
  '<code>Okko 399 15 числа</code>',
  '<code>Netflix 999 в год 20 ноября</code>',
  '<code>пробный Кинопоиск 299 до 05.12</code>',
  '',
  '📩 Или <b>перешли СМС/пуш банка</b> о списании — я узнаю сервис и сумму.',
].join('\n');

export const DRAFT_EXPIRED_TEXT = 'Это сообщение устарело — пришли подписку ещё раз.';
