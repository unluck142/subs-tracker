import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { BotService } from '../bot/bot.service';
import { addDays, hourInTz, todayInTz } from '../common/dates';
import { DB, Db } from '../db/db.module';
import { reminderLogs, services, Subscription, subscriptions, users } from '../db/schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { isReminderDue } from './reminders.logic';
import { isUserReviewDue, pickForReview, REVIEW_EVERY_DAYS } from './review.logic';

/** Поля проверки пользования, которых нет в SubscriptionView */
function pick(row: Subscription) {
  return {
    createdAt: row.createdAt,
    lastReviewedAt: row.lastReviewedAt,
    usageConfirmedAt: row.usageConfirmedAt,
    reviewMuted: row.reviewMuted,
  };
}

/** Максимум remindDaysBefore (30) + запас на разницу часовых поясов */
const LOOKAHEAD_DAYS = 32;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly bot: BotService,
    private readonly subs: SubscriptionsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick() {
    if (!this.bot.enabled || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const stats = await this.processDue(now);
      if (stats.sent > 0 || stats.failed > 0) {
        this.logger.log(`Напоминания: отправлено ${stats.sent}, ошибок ${stats.failed}`);
      }
      const reviews = await this.processReviews(now);
      if (reviews > 0) this.logger.log(`Проверка пользования: отправлено вопросов ${reviews}`);
    } catch (e) {
      this.logger.error(`Ошибка при рассылке напоминаний: ${(e as Error).message}`, (e as Error).stack);
    } finally {
      this.running = false;
    }
  }

  /**
   * Раз в неделю спросить пользователя про одну подписку: «Ты ей пользуешься?»
   * Возвращает, сколько вопросов отправлено.
   */
  async processReviews(now: Date): Promise<number> {
    const weekAgo = new Date(now.getTime() - REVIEW_EVERY_DAYS * 86_400_000);
    const candidates = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.reviewsEnabled, true),
          eq(users.botBlocked, false),
          or(isNull(users.lastReviewAt), lt(users.lastReviewAt, weekAgo)),
        ),
      );

    let sent = 0;
    for (const user of candidates) {
      const due = isUserReviewDue({
        reviewsEnabled: user.reviewsEnabled,
        lastReviewAt: user.lastReviewAt,
        now,
        localHour: hourInTz(user.timezone, now),
        reminderHour: user.reminderHour,
      });
      if (!due) continue;

      // «Бронируем» неделю: даже если спросить не о чем, следующая проверка — через неделю.
      // Условие в WHERE не даст двум экземплярам приложения спросить дважды.
      const reserved = await this.db
        .update(users)
        .set({ lastReviewAt: now })
        .where(and(eq(users.id, user.id), or(isNull(users.lastReviewAt), lt(users.lastReviewAt, weekAgo))))
        .returning({ id: users.id });
      if (reserved.length === 0) continue;

      const today = todayInTz(user.timezone, now);
      const views = await this.subs.list(user);
      const rows = await this.db.query.subscriptions.findMany({ where: eq(subscriptions.userId, user.id) });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const picked = pickForReview(
        views.flatMap((v) => {
          const row = byId.get(v.id);
          return row ? [{ ...v, ...pick(row), monthlyKopecks: v.monthlyKopecks, nextChargeDate: v.nextChargeDate }] : [];
        }),
        today,
        now,
      );
      if (!picked) continue;

      const view = views.find((v) => v.id === picked.id)!;
      const result = await this.bot.sendReview(user, view);
      if (result === 'sent') {
        sent++;
        await this.db.update(subscriptions).set({ lastReviewedAt: now }).where(eq(subscriptions.id, view.id));
      } else if (result === 'failed') {
        // Сеть — вернём пользователя в очередь, спросим в следующий раз
        await this.db.update(users).set({ lastReviewAt: user.lastReviewAt }).where(eq(users.id, user.id));
      }
    }
    return sent;
  }

  /**
   * Найти подписки, о которых пора напомнить, и отправить напоминания.
   * Вынесено из tick(), чтобы можно было вызвать вручную и в тестах.
   */
  async processDue(now: Date): Promise<{ sent: number; failed: number }> {
    const horizon = addDays(now.toISOString().slice(0, 10), LOOKAHEAD_DAYS);
    const rows = await this.db
      .select({ sub: subscriptions, user: users, service: services })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .leftJoin(services, eq(services.id, subscriptions.serviceId))
      .where(
        and(
          eq(subscriptions.status, 'ACTIVE'),
          eq(users.botBlocked, false),
          lte(subscriptions.nextChargeDate, horizon),
        ),
      );

    let sent = 0;
    let failed = 0;
    for (const { sub, user, service } of rows) {
      const today = todayInTz(user.timezone, now);
      const [fresh] = await this.subs.rollStale([{ ...sub, service }], today);

      const due = isReminderDue({
        nextChargeDate: fresh.nextChargeDate,
        remindDaysBefore: fresh.remindDaysBefore,
        today,
        localHour: hourInTz(user.timezone, now),
        reminderHour: user.reminderHour,
      });
      if (!due) continue;

      // Сначала «бронируем» напоминание в логе: уникальный индекс не даст отправить дважды,
      // даже если два экземпляра приложения запустят рассылку одновременно
      const reserved = await this.db
        .insert(reminderLogs)
        .values({ subscriptionId: fresh.id, chargeDate: fresh.nextChargeDate })
        .onConflictDoNothing()
        .returning({ id: reminderLogs.id });
      if (reserved.length === 0) continue;

      // Берём из полного списка: там посчитано, не входит ли подписка в другую (Кинопоиск — в Плюс)
      const view = (await this.subs.list(user)).find((s) => s.id === fresh.id) ?? this.subs.toView(fresh, today);
      const result = await this.bot.sendReminder(user, view);
      if (result === 'sent') {
        sent++;
      } else {
        failed++;
        if (result === 'failed') {
          // Сетевая ошибка — снимаем бронь, попробуем в следующий раз
          await this.db.delete(reminderLogs).where(eq(reminderLogs.id, reserved[0].id));
        }
      }
    }
    return { sent, failed };
  }
}
