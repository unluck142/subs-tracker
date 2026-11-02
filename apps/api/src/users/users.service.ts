import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { TelegramUser } from '../auth/init-data';
import { isValidTimezone } from '../common/dates';
import { DB, Db } from '../db/db.module';
import { User, users } from '../db/schema';

const SEEN_THROTTLE_MS = 10 * 60_000;

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Создать пользователя при первом входе или обновить имя/username */
  async upsertFromTelegram(tg: TelegramUser, opts: { unblock?: boolean } = {}): Promise<User> {
    const values = {
      telegramId: tg.id,
      firstName: tg.first_name ?? null,
      username: tg.username ?? null,
      languageCode: tg.language_code ?? null,
    };

    // Вызывается на каждый запрос, поэтому сначала читаем и пишем только при изменениях
    const existing = await this.findByTelegramId(tg.id);
    if (existing) {
      // Время последней активности обновляем не чаще раза в 10 минут — для статистики этого хватает
      const seenStale = !existing.lastSeenAt || Date.now() - existing.lastSeenAt.getTime() > SEEN_THROTTLE_MS;
      const changed =
        seenStale ||
        existing.firstName !== values.firstName ||
        existing.username !== values.username ||
        existing.languageCode !== values.languageCode ||
        (opts.unblock && existing.botBlocked);
      if (!changed) return existing;
      const [updated] = await this.db
        .update(users)
        .set({
          firstName: values.firstName,
          username: values.username,
          languageCode: values.languageCode,
          updatedAt: sql`now()`,
          lastSeenAt: new Date(),
          ...(opts.unblock ? { botBlocked: false } : {}),
        })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }

    // Новый пользователь. onConflictDoNothing — на случай двух одновременных первых запросов
    const [created] = await this.db
      .insert(users)
      .values({ ...values, lastSeenAt: new Date() })
      .onConflictDoNothing()
      .returning();
    return created ?? (await this.findByTelegramId(tg.id))!;
  }

  async findByTelegramId(telegramId: number): Promise<User | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  }

  async updateSettings(
    userId: number,
    patch: { timezone?: string; reminderHour?: number; reviewsEnabled?: boolean },
  ): Promise<User> {
    const set: Partial<User> = {};
    if (patch.timezone !== undefined) {
      if (!isValidTimezone(patch.timezone)) throw new BadRequestException('Неизвестный часовой пояс');
      set.timezone = patch.timezone;
    }
    if (patch.reminderHour !== undefined) set.reminderHour = patch.reminderHour;
    if (patch.reviewsEnabled !== undefined) set.reviewsEnabled = patch.reviewsEnabled;
    const [user] = await this.db
      .update(users)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async markBotBlocked(userId: number, blocked: boolean): Promise<void> {
    await this.db.update(users).set({ botBlocked: blocked }).where(eq(users.id, userId));
  }
}
