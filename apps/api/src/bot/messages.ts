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
  'Подписки добавляются и редактируются в приложении — кнопка «Подписки» слева от поля ввода.',
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
