/**
 * Тексты админ-панели /stats. Одно сообщение, разделы переключаются кнопками.
 */
import { InlineKeyboard } from 'grammy';
import { escapeHtml } from '../bot/messages';
import { formatRub } from '../common/money';
import type {
  ActivityStats,
  GrowthDay,
  MoneyStats,
  Overview,
  RecentUser,
  ServicesStats,
  SubsStats,
  UsersStats,
} from './admin.service';

export const ADMIN_SECTIONS = ['overview', 'users', 'growth', 'subs', 'services', 'money', 'activity', 'recent'] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

const TITLES: Record<AdminSection, string> = {
  overview: '📊 Обзор',
  users: '👥 Люди',
  growth: '📈 Рост',
  subs: '📋 Подписки',
  services: '🔝 Сервисы',
  money: '💰 Деньги',
  activity: '🤖 Бот',
  recent: '🆕 Новые',
};

export function adminKeyboard(current: AdminSection): InlineKeyboard {
  const kb = new InlineKeyboard();
  ADMIN_SECTIONS.forEach((section, i) => {
    kb.text(section === current ? `• ${TITLES[section]}` : TITLES[section], `adm:${section}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.text('🔄 Обновить', `adm:${current}`);
}

const num = new Intl.NumberFormat('ru-RU');
const n = (value: number) => num.format(value);
/** В статистике копейки только мешают: 139717 → «1 397 ₽» */
const rub = (kopecks: number) => formatRub(Math.round(kopecks / 100) * 100);
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—');

const CATEGORY_LABELS: Record<string, string> = {
  VIDEO: 'Кино и сериалы',
  MUSIC: 'Музыка и книги',
  ECOSYSTEM: 'Экосистемы',
  BANK: 'Банки',
  CLOUD: 'Облако и софт',
  SHOPPING: 'Покупки',
  EDUCATION: 'Обучение',
  GAMES: 'Игры',
  CONNECTION: 'Связь',
  SPORT: 'Спорт',
  OTHER: 'Другое и свои',
};

const SOURCE_LABELS: Record<string, string> = {
  app: 'Форма в приложении',
  import: 'Импорт выписки',
  bot: 'Текстом боту',
  sms: 'Пересланное СМС',
};

const PERIOD_LABELS: Record<string, string> = {
  'WEEK:1': 'неделя',
  'MONTH:1': 'месяц',
  'MONTH:3': '3 месяца',
  'MONTH:6': 'полгода',
  'YEAR:1': 'год',
};

function header(section: AdminSection, now: Date, timezone: string): string {
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(now);
  return `<b>${TITLES[section]}</b> · на ${time}`;
}

/** «+5 за неделю (неделей раньше +3) ↑» */
function trend(current: number, previous: number): string {
  if (current === previous) return '';
  return current > previous ? ' ↑' : ' ↓';
}

export function overviewText(s: Overview, now: Date, tz: string): string {
  return [
    header('overview', now, tz),
    '',
    `👥 Пользователей: <b>${n(s.users)}</b>`,
    `   +${n(s.new24h)} за сутки · +${n(s.new7d)} за неделю (неделей раньше +${n(s.newPrev7d)})${trend(s.new7d, s.newPrev7d)}`,
    `🔥 Заходили: ${n(s.active24h)} за сутки · ${n(s.active7d)} за неделю`,
    '',
    `📋 Активных подписок: <b>${n(s.activeSubs)}</b> · +${n(s.newSubs24h)} за сутки`,
    `💰 Отслеживают: <b>${rub(s.monthlyTotalKopecks)}</b> в месяц`,
    `⏰ Напоминаний за сутки: ${n(s.reminders24h)}`,
  ].join('\n');
}

export function usersText(s: UsersStats, now: Date, tz: string): string {
  return [
    header('users', now, tz),
    '',
    `Всего: <b>${n(s.total)}</b>`,
    `Новые: +${n(s.new24h)} за сутки · +${n(s.new7d)} за 7 дней · +${n(s.new30d)} за 30 дней`,
    `Заходили: ${n(s.active24h)} за сутки · ${n(s.active7d)} за неделю · ${n(s.active30d)} за месяц`,
    `Возвращаемость (за сутки / за месяц): ${pct(s.active24h, s.active30d)}`,
    '',
    `С подписками: <b>${n(s.withSubs)}</b> (${pct(s.withSubs, s.total)} от всех)`,
    `Заблокировали бота: ${n(s.blocked)} · выключили вопросы «пользуешься?»: ${n(s.reviewsOff)}`,
    '',
    '<b>Подписок у человека</b>',
    ...s.distribution.map((d) => `${d.bucket} — ${n(d.users)} чел.`),
    '',
    '<b>Часовые пояса</b>',
    ...s.timezones.map((t) => `${escapeHtml(t.name)} — ${n(t.users)}`),
  ].join('\n');
}

function bar(value: number, max: number, width = 8): string {
  if (max <= 0 || value <= 0) return '·';
  return '█'.repeat(Math.max(1, Math.round((value / max) * width)));
}

export function growthText(days: GrowthDay[], now: Date, tz: string): string {
  const maxUsers = Math.max(...days.map((d) => d.users), 0);
  const maxSubs = Math.max(...days.map((d) => d.subs), 0);
  const rows = days.map(
    (d) => `${d.day} ${String(d.users).padStart(3)} ${bar(d.users, maxUsers).padEnd(8)} ${String(d.subs).padStart(3)} ${bar(d.subs, maxSubs)}`,
  );
  const sum = (key: 'users' | 'subs') => days.reduce((acc, d) => acc + d[key], 0);
  return [
    header('growth', now, tz),
    '',
    `За ${days.length} дней: +${n(sum('users'))} пользователей, +${n(sum('subs'))} подписок`,
    '',
    '<pre>',
    'день  люди          подписки',
    ...rows,
    '</pre>',
  ].join('\n');
}

export function subsText(s: SubsStats, now: Date, tz: string): string {
  return [
    header('subs', now, tz),
    '',
    `Активных: <b>${n(s.active)}</b> (пробных ${n(s.trials)}) · в среднем ${rub(s.avgMonthlyKopecks)} в месяц`,
    `За 7 дней: +${n(s.added7d)} добавлено, ${n(s.cancelled7d)} отменено (всего отменено ${n(s.cancelled)})`,
    '',
    '<b>Откуда добавляют</b> (всего · за 7 дней)',
    ...(s.bySource.length
      ? s.bySource.map((x) => `${SOURCE_LABELS[x.source] ?? escapeHtml(x.source)} — ${n(x.total)} · ${n(x.last7d)}`)
      : ['пока пусто']),
    '',
    '<b>По категориям</b> (активные)',
    ...(s.byCategory.length
      ? s.byCategory.map((c) => `${CATEGORY_LABELS[c.category] ?? c.category} — ${n(c.count)} · ${rub(c.monthlyKopecks)}/мес`)
      : ['пока пусто']),
    '',
    '<b>Период оплаты</b>',
    ...(s.byPeriod.length ? s.byPeriod.map((p) => `${PERIOD_LABELS[p.period] ?? p.period} — ${n(p.count)}`) : ['пока пусто']),
    '',
    `<b>Общие подписки</b>: ${n(s.shared)}, участников ${n(s.members)}, отмеченных переводов за 30 дней ${n(s.payments30d)}`,
  ].join('\n');
}

function ranked(items: { name: string; count: number }[]): string[] {
  return items.length ? items.map((x, i) => `${i + 1}. ${escapeHtml(x.name)} — ${n(x.count)}`) : ['пока пусто'];
}

export function servicesText(s: ServicesStats, now: Date, tz: string): string {
  return [
    header('services', now, tz),
    '',
    '<b>Популярные из каталога</b> (активные)',
    ...ranked(s.top),
    '',
    '<b>Свои подписки, которых нет в каталоге</b>',
    '<i>кандидаты на добавление в каталог</i>',
    ...ranked(s.custom),
    '',
    '<b>Чаще всего отменяют</b>',
    ...ranked(s.cancelled),
  ].join('\n');
}

export function moneyText(s: MoneyStats, now: Date, tz: string): string {
  return [
    header('money', now, tz),
    '',
    `Отслеживают всего: <b>${rub(s.monthlyTotalKopecks)}</b> в месяц (${rub(s.monthlyTotalKopecks * 12)} в год)`,
    `На человека с подписками: в среднем ${rub(s.avgPerUserKopecks)}, медиана ${rub(s.medianPerUserKopecks)}, максимум ${rub(s.maxPerUserKopecks)} в месяц`,
    '',
    `💸 Экономят благодаря отменам: <b>${rub(s.savedMonthlyKopecks)}</b> в месяц`,
    `   из них отменено в этом месяце: ${rub(s.savedThisMonthKopecks)} в месяц`,
  ].join('\n');
}

export function activityText(s: ActivityStats, now: Date, tz: string): string {
  return [
    header('activity', now, tz),
    '',
    `⏰ Напоминаний: ${n(s.reminders24h)} за сутки · ${n(s.reminders7d)} за неделю`,
    `   из них участникам общих подписок за неделю: ${n(s.memberReminders7d)}`,
    `🔍 Вопросов «пользуешься?» за неделю: ${n(s.reviews7d)} · ответили «пользуюсь»/«оставляю»: ${n(s.confirmed7d)}`,
    `🔕 Подписок, про которые просили не спрашивать: ${n(s.muted)}`,
    `❌ Отменено подписок за неделю: ${n(s.cancelled7d)}`,
    `💸 Отмечено переводов в общих подписках за неделю: ${n(s.payments7d)}`,
  ].join('\n');
}

function ago(date: Date | null, now: Date): string {
  if (!date) return 'не заходил(а)';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 60) return 'был(а) только что';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `был(а) ${hours} ч назад`;
  return `был(а) ${Math.floor(hours / 24)} дн назад`;
}

export function recentText(users: RecentUser[], now: Date, tz: string): string {
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit' });
  return [
    header('recent', now, tz),
    '',
    ...(users.length
      ? users.map((u) => {
          const handle = u.username ? ` @${escapeHtml(u.username)}` : '';
          const blocked = u.blocked ? ' · 🚫 заблокировал(а)' : '';
          return `• <b>${escapeHtml(u.name)}</b>${handle} — с ${date.format(u.createdAt)}, подписок ${u.subs}, ${ago(u.lastSeenAt, now)}${blocked}`;
        })
      : ['пока никого']),
  ].join('\n');
}
