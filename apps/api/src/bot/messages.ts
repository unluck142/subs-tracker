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

/** Первое сообщение: коротко о пользе и что сделать первым. privacyUrl — ссылка на политику конфиденциальности. */
export function welcomeText(firstName: string | null, hasWebApp: boolean, privacyUrl: string | null = null): string {
  const name = firstName ? `, ${escapeHtml(firstName)}` : '';
  return [
    `Привет${name}! 👋`,
    '',
    'Я — <b>«Не спишут»</b>: напоминаю о списаниях за подписки <b>заранее</b>, предупреждаю о конце пробных периодов и считаю, сколько уходит в месяц.',
    '',
    hasWebApp
      ? '<b>С чего начать?</b> Быстрее всего — найти подписки в выписке банка: загрузишь файл, я покажу, что нашёл.'
      : 'Мини-приложение пока не настроено (нет WEBAPP_URL). Можно написать подписку текстом: «Okko 399 15 числа».',
    ...(privacyUrl
      ? ['', `<i>Пользуясь ботом, ты соглашаешься с <a href="${escapeHtml(privacyUrl)}">политикой конфиденциальности</a>.</i>`]
      : []),
  ].join('\n');
}

export const ONBOARDING_TEXT_HINT = [
  '✍️ <b>Напиши подписку одним сообщением</b>, например:',
  '<code>Okko 399 15 числа</code>',
  '<code>Netflix 999 в год 20 ноября</code>',
  '<code>пробный Кинопоиск 299 до 05.12</code>',
  '',
  'Я разберу и предложу добавить кнопкой.',
].join('\n');

export const ONBOARDING_SMS_HINT = [
  '📩 <b>Перешли мне СМС или пуш банка о списании</b> — например, «Покупка 449 ₽ YANDEX*PLUS…».',
  '',
  'Я узнаю сервис и сумму и предложу добавить подписку. А если она уже есть и цена выросла — скажу, на сколько.',
].join('\n');

export function deleteConfirmText(subsCount: number, sharedCount: number): string {
  return [
    '🗑 <b>Удалить все твои данные?</b>',
    '',
    `Удалятся подписки (${subsCount}), настройки и участие в общих подписках.`,
    sharedCount > 0 ? `Участники твоих общих подписок (${sharedCount}) получат уведомление.` : '',
    'Это нельзя отменить.',
  ]
    .filter(Boolean)
    .join('\n');
}

export const DELETED_TEXT = 'Готово: все твои данные удалены. Если захочешь вернуться — просто нажми /start.';

export const HELP_TEXT = [
  '<b>Что я умею</b>',
  '',
  '/start — открыть приложение',
  '/list — список подписок и сумма в месяц',
  '/help — эта справка',
  '/delete_me — удалить все мои данные',
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
    sub.includedIn
      ? `💡 Похоже, ${name} уже входит в «${escapeHtml(sub.includedIn)}» — проверь свой тариф, возможно, платишь дважды.`
      : 'Пользуешься? Если нет — отмени, пока не списали.',
    ...(sub.sharing && sub.role === 'owner'
      ? [
          '',
          `👥 Общая подписка: доля каждого ${formatRub(sub.sharing.shareKopecks)}, скинулись ${sub.sharing.paidCount} из ${sub.sharing.membersCount}. Остальным я напомню.`,
        ]
      : []),
  ].join('\n');
}

export function listText(subs: SubscriptionView[], stats: Stats): string {
  if (subs.length === 0) {
    return 'Пока нет ни одной подписки. Открой приложение и добавь первую — это займёт полминуты.';
  }
  const lines = subs.map((s) => {
    const trial = s.isTrial ? ' 🎁' : '';
    // У общей подписки показываем свою долю — из неё же считается итог «в месяц»
    const price = s.sharing
      ? `${formatRub(s.sharing.shareKopecks)} из ${formatRub(s.priceKopecks)} 👥`
      : formatRub(s.priceKopecks);
    return `• <b>${escapeHtml(s.name)}</b>${trial} — ${price} ${periodLabel(s.periodUnit, s.periodCount)}, ${inDaysLabel(s.daysLeft)}`;
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
    '<b>Оплачивал(а) через магазин приложений?</b>',
    '• App Store: Настройки iPhone → твоё имя → Подписки',
    '• Google Play: профиль → «Платежи и подписки» → «Подписки»',
    '',
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

export type OverlapHint = { coveredBy: string } | { covers: string[] } | null;

export function draftText(d: DraftView, hint: OverlapHint = null): string {
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
  if (hint && 'coveredBy' in hint) {
    lines.push('', `💡 Похоже, ${name} уже входит в твой «${escapeHtml(hint.coveredBy)}» — проверь тариф, может, платить отдельно не нужно.`);
  } else if (hint) {
    lines.push('', `💡 В ${name} обычно уже входит ${hint.covers.map((c) => `«${escapeHtml(c)}»`).join(' и ')} — их можно будет отменить.`);
  }
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

// ─── Проверка пользования ───────────────────────────────────────────────────

function yearlyKopecks(sub: SubscriptionView): number {
  return Math.round(sub.monthlyKopecks * 12);
}

export function reviewText(sub: SubscriptionView): string {
  return [
    '🔍 <b>Ревизия подписок</b>',
    '',
    `Пользуешься <b>${escapeHtml(sub.name)}</b>? Если за последний месяц ни разу — её стоит отменить.`,
    `Она стоит ${formatRub(sub.priceKopecks)} ${periodLabel(sub.periodUnit, sub.periodCount)} — это <b>${formatRub(yearlyKopecks(sub))} в год</b>.`,
  ].join('\n');
}

export function reviewUsedText(sub: SubscriptionView): string {
  return `👍 Отлично, значит «${escapeHtml(sub.name)}» того стоит. Спрошу о ней снова через пару месяцев.`;
}

export function reviewUnusedText(sub: SubscriptionView): string {
  return [
    `Тогда «${escapeHtml(sub.name)}» лучше отменить — это <b>${formatRub(yearlyKopecks(sub))} в год</b> впустую.`,
    '',
    `Следующее списание — ${formatDateLong(sub.nextChargeDate)}: успей до него. Как отменишь — нажми «Отменил».`,
  ].join('\n');
}

export function reviewMutedText(sub: SubscriptionView): string {
  return `🔕 Хорошо, про «${escapeHtml(sub.name)}» больше не спрашиваю. Выключить такие вопросы совсем можно в настройках приложения.`;
}

// ─── Общие подписки ─────────────────────────────────────────────────────────

interface SharedInfoText {
  name: string;
  priceKopecks: number;
  periodUnit: SubscriptionView['periodUnit'];
  periodCount: number;
}

function ownerContact(name: string, username: string | null): string {
  return username ? `${escapeHtml(name)} (@${escapeHtml(username)})` : escapeHtml(name);
}

export function joinOfferText(ownerName: string, info: SharedInfoText, peopleAfterJoin: number, share: number): string {
  return [
    `👥 <b>${escapeHtml(ownerName)}</b> приглашает тебя в общую подписку <b>«${escapeHtml(info.name)}»</b> — ${formatRub(info.priceKopecks)} ${periodLabel(info.periodUnit, info.periodCount)}.`,
    '',
    `Вас будет ${peopleAfterJoin}, доля каждого — <b>${formatRub(share)}</b>.`,
    'Перед каждым списанием я напомню перевести свою долю.',
  ].join('\n');
}

export function joinedText(info: SharedInfoText, ownerName: string, ownerUsername: string | null, share: number): string {
  return [
    `✅ Готово! Ты в общей подписке «${escapeHtml(info.name)}».`,
    '',
    `Перед каждым списанием напомню перевести <b>${formatRub(share)}</b>. Кому: ${ownerContact(ownerName, ownerUsername)}.`,
  ].join('\n');
}

export function memberJoinedText(memberName: string, info: SharedInfoText, people: number, share: number): string {
  return `👥 В «${escapeHtml(info.name)}» новый участник: ${escapeHtml(memberName)}. Теперь вас ${people}, доля каждого — ${formatRub(share)}.`;
}

export function joinStatusText(status: 'owner' | 'already' | 'full' | 'not-found', name?: string): string {
  const n = name ? `«${escapeHtml(name)}»` : 'подписку';
  switch (status) {
    case 'owner':
      return `Это твоя подписка 🙂 Отправь ссылку тем, с кем делишь ${n}.`;
    case 'already':
      return `Ты уже участвуешь в ${n}. Напомню, когда нужно будет скинуться.`;
    case 'full':
      return `В ${n} уже максимальное число участников.`;
    case 'not-found':
      return 'Приглашение не найдено — возможно, подписку отменили или ссылка устарела. Попроси новую.';
  }
}

export function shareReminderText(sub: SubscriptionView): string {
  const s = sub.sharing!;
  const when = inDaysLabel(sub.daysLeft);
  return [
    `👥 ${capitalize(when)} спишут за общую подписку «${escapeHtml(sub.name)}».`,
    '',
    `Твоя доля — <b>${formatRub(s.shareKopecks)}</b>. Кому перевести: ${ownerContact(s.ownerName ?? 'владельцу подписки', s.ownerUsername)}.`,
    'Как переведёшь — нажми кнопку, и я сообщу.',
  ].join('\n');
}

export function sharePaidText(share: number, ownerName: string): string {
  return `✅ Отметил перевод ${formatRub(share)}. ${escapeHtml(ownerName)} получит уведомление.`;
}

export function memberPaidText(memberName: string, name: string, share: number): string {
  return `💸 ${escapeHtml(memberName)}: перевод ${formatRub(share)} за «${escapeHtml(name)}» ✅`;
}

export function memberLeftText(memberName: string, name: string, removedByOwner: boolean): string {
  return removedByOwner
    ? `Тебя исключили из общей подписки «${escapeHtml(name)}». Напоминаний о ней больше не будет.`
    : `👋 ${escapeHtml(memberName)} больше не участвует в общей подписке «${escapeHtml(name)}».`;
}

// ─── Для владельца бота ─────────────────────────────────────────────────────

export function adminAlertText(where: string, message: string): string {
  return `🚨 <b>Ошибка: ${escapeHtml(where)}</b>\n\n<code>${escapeHtml(message.slice(0, 800))}</code>`;
}

export function memberAlreadyText(sub: SubscriptionView): string {
  const s = sub.sharing;
  return s
    ? `«${escapeHtml(sub.name)}» у тебя уже есть как общая подписка — её оплачивает ${escapeHtml(s.ownerName ?? 'другой участник')}. Твоя доля: ${formatRub(s.shareKopecks)}.`
    : `«${escapeHtml(sub.name)}» у тебя уже есть как общая подписка.`;
}

export const FOREIGN_CURRENCY_TEXT =
  'Пока я считаю подписки только в рублях. Напиши сумму в рублях — например, сколько списывает банк: <code>Spotify 499 15 числа</code>';

export function sharedEndedText(name: string, ownerName: string, deleted: boolean): string {
  return `«${escapeHtml(name)}» больше не общая подписка: ${escapeHtml(ownerName)} ${deleted ? 'удалил(а)' : 'отменил(а)'} её. Напоминаний о ней больше не будет.`;
}
