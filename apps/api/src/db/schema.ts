/**
 * Схема базы данных (Drizzle ORM).
 *
 * - Деньги храним в копейках (integer), чтобы не ловить ошибки округления float.
 * - Даты списаний храним как DATE ('YYYY-MM-DD'): «когда спишут» — это день, а не момент времени.
 */
import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const periodUnitEnum = pgEnum('period_unit', ['WEEK', 'MONTH', 'YEAR']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['ACTIVE', 'CANCELLED']);
export const categoryEnum = pgEnum('category', [
  'VIDEO', // Кино и сериалы
  'MUSIC', // Музыка, книги, подкасты
  'ECOSYSTEM', // Экосистемы
  'BANK', // Банковские подписки
  'CLOUD', // Облако, софт, нейросети
  'SHOPPING', // Покупки и доставка
  'EDUCATION', // Обучение
  'GAMES', // Игры
  'CONNECTION', // Связь и интернет
  'SPORT', // Спорт
  'OTHER', // Другое
]);

export type PeriodUnit = (typeof periodUnitEnum.enumValues)[number];
export type Category = (typeof categoryEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // ID пользователя в Telegram укладывается в 52 бита — безопасно для number
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  firstName: text('first_name'),
  username: text('username'),
  languageCode: text('language_code'),
  // Часовой пояс (IANA). Мини-приложение присылает его из браузера при первом открытии.
  timezone: text('timezone').notNull().default('Europe/Moscow'),
  // Час (по местному времени), в который присылать напоминания
  reminderHour: integer('reminder_hour').notNull().default(10),
  // Пользователь заблокировал бота — не шлём напоминания, пока снова не напишет /start
  botBlocked: boolean('bot_blocked').notNull().default(false),
  isPremium: boolean('is_premium').notNull().default(false),
  // Раз в неделю спрашиваем, пользуется ли он одной из подписок. Можно выключить в настройках.
  reviewsEnabled: boolean('reviews_enabled').notNull().default(true),
  lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Каталог популярных сервисов — чтобы добавить подписку в два касания */
export const services = pgTable(
  'services',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    category: categoryEnum('category').notNull(),
    // Цена по умолчанию. Если пустая — подсказываем среднюю цену по пользователям.
    defaultPriceKopecks: integer('default_price_kopecks'),
    periodUnit: periodUnitEnum('period_unit').notNull().default('MONTH'),
    periodCount: integer('period_count').notNull().default(1),
    color: text('color').notNull().default('#6C7A89'),
    // Как отменить подписку — наполняется постепенно, пригодится и для SEO-страниц
    cancelUrl: text('cancel_url'),
    cancelSteps: text('cancel_steps'),
    // Синонимы для поиска: «кинопоиск, kinopoisk, кп»
    searchAliases: text('search_aliases'),
    // Как сервис называется в выписке банка: «YANDEX*PLUS, ЯНДЕКС ПЛЮС». Нужно для импорта выписки.
    merchantPatterns: text('merchant_patterns'),
    isPopular: boolean('is_popular').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(100),
  },
  (t) => [index('services_category_idx').on(t.category)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    serviceId: integer('service_id').references(() => services.id, { onDelete: 'set null' }),
    // Название своей подписки (если сервиса нет в каталоге)
    customName: text('custom_name'),
    priceKopecks: integer('price_kopecks').notNull(),
    currency: text('currency').notNull().default('RUB'),
    periodUnit: periodUnitEnum('period_unit').notNull().default('MONTH'),
    periodCount: integer('period_count').notNull().default(1),
    // Дата следующего списания
    nextChargeDate: date('next_charge_date', { mode: 'string' }).notNull(),
    // День месяца, к которому привязано списание. Нужен, чтобы 31-е после февраля
    // не «съехало» навсегда на 28-е.
    anchorDay: integer('anchor_day').notNull(),
    // Пробный период: nextChargeDate — день, когда пробный период станет платным
    isTrial: boolean('is_trial').notNull().default(false),
    // За сколько дней напоминать (0 — в день списания)
    remindDaysBefore: integer('remind_days_before').notNull().default(1),
    status: subscriptionStatusEnum('status').notNull().default('ACTIVE'),
    // Проверка пользования: когда спрашивали, когда ответил «пользуюсь», не спрашивать больше
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    usageConfirmedAt: timestamp('usage_confirmed_at', { withTimezone: true }),
    reviewMuted: boolean('review_muted').notNull().default(false),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_user_status_idx').on(t.userId, t.status),
    index('subscriptions_status_date_idx').on(t.status, t.nextChargeDate),
  ],
);

/** Отправленные напоминания — чтобы не присылать одно и то же дважды */
export const reminderLogs = pgTable(
  'reminder_logs',
  {
    id: serial('id').primaryKey(),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    chargeDate: date('charge_date', { mode: 'string' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reminder_logs_sub_date_uq').on(t.subscriptionId, t.chargeDate)],
);

// Связи для удобных запросов вида db.query.subscriptions.findMany({ with: { service: true } })
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const servicesRelations = relations(services, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  service: one(services, { fields: [subscriptions.serviceId], references: [services.id] }),
  reminders: many(reminderLogs),
}));

export const reminderLogsRelations = relations(reminderLogs, ({ one }) => ({
  subscription: one(subscriptions, { fields: [reminderLogs.subscriptionId], references: [subscriptions.id] }),
}));

export type User = typeof users.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
