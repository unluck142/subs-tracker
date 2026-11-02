import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lte } from 'drizzle-orm';
import { BotService } from '../bot/bot.service';
import { addDays, hourInTz, todayInTz } from '../common/dates';
import { DB, Db } from '../db/db.module';
import { reminderLogs, services, subscriptions, users } from '../db/schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { isReminderDue } from './reminders.logic';

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
      const stats = await this.processDue(new Date());
      if (stats.sent > 0 || stats.failed > 0) {
        this.logger.log(`Напоминания: отправлено ${stats.sent}, ошибок ${stats.failed}`);
      }
    } catch (e) {
      this.logger.error(`Ошибка при рассылке напоминаний: ${(e as Error).message}`, (e as Error).stack);
    } finally {
      this.running = false;
    }
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
