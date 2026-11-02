import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq, gte, sql } from 'drizzle-orm';
import { monthlyKopecks } from '../common/money';
import { DB, Db } from '../db/db.module';
import { services, subscriptionMembers, subscriptions, users } from '../db/schema';

export interface AdminStats {
  users: { total: number; new24h: number; new7d: number; withSubscriptions: number; blockedBot: number };
  subscriptions: { active: number; added7d: number; cancelled: number; shared: number; members: number };
  /** Средняя сумма подписок в месяц на пользователя (у кого есть подписки) */
  avgMonthlyKopecks: number;
  /** Сколько в месяц экономят пользователи благодаря отменам */
  savedMonthlyKopecks: number;
  topServices: { name: string; count: number }[];
}

/** Статистика для владельца бота (/stats) */
@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async stats(now = new Date()): Promise<AdminStats> {
    const day = new Date(now.getTime() - 86_400_000);
    const week = new Date(now.getTime() - 7 * 86_400_000);
    const n = (rows: { value: number }[]) => Number(rows[0]?.value ?? 0);

    const [total, new24h, new7d, blocked, withSubs] = await Promise.all([
      this.db.select({ value: count() }).from(users),
      this.db.select({ value: count() }).from(users).where(gte(users.createdAt, day)),
      this.db.select({ value: count() }).from(users).where(gte(users.createdAt, week)),
      this.db.select({ value: count() }).from(users).where(eq(users.botBlocked, true)),
      this.db
        .select({ value: countDistinct(subscriptions.userId) })
        .from(subscriptions)
        .where(eq(subscriptions.status, 'ACTIVE')),
    ]);

    const [added7d, shared, members] = await Promise.all([
      this.db.select({ value: count() }).from(subscriptions).where(gte(subscriptions.createdAt, week)),
      this.db.select({ value: countDistinct(subscriptionMembers.subscriptionId) }).from(subscriptionMembers),
      this.db.select({ value: count() }).from(subscriptionMembers),
    ]);

    const all = await this.db
      .select({
        status: subscriptions.status,
        priceKopecks: subscriptions.priceKopecks,
        periodUnit: subscriptions.periodUnit,
        periodCount: subscriptions.periodCount,
      })
      .from(subscriptions);
    const monthly = (status: 'ACTIVE' | 'CANCELLED') =>
      all
        .filter((s) => s.status === status)
        .reduce((sum, s) => sum + monthlyKopecks(s.priceKopecks, s.periodUnit, s.periodCount), 0);

    const top = await this.db
      .select({ name: services.name, value: count() })
      .from(subscriptions)
      .innerJoin(services, eq(services.id, subscriptions.serviceId))
      .where(and(eq(subscriptions.status, 'ACTIVE')))
      .groupBy(services.name)
      .orderBy(desc(count()), sql`${services.name}`)
      .limit(5);

    const usersWithSubs = n(withSubs);
    return {
      users: { total: n(total), new24h: n(new24h), new7d: n(new7d), withSubscriptions: usersWithSubs, blockedBot: n(blocked) },
      subscriptions: {
        active: all.filter((s) => s.status === 'ACTIVE').length,
        added7d: n(added7d),
        cancelled: all.filter((s) => s.status === 'CANCELLED').length,
        shared: n(shared),
        members: n(members),
      },
      avgMonthlyKopecks: usersWithSubs > 0 ? Math.round(monthly('ACTIVE') / usersWithSubs) : 0,
      savedMonthlyKopecks: Math.round(monthly('CANCELLED')),
      topServices: top.map((t) => ({ name: t.name, count: Number(t.value) })),
    };
  }
}
