import { Inject, Injectable } from '@nestjs/common';
import { sql, SQL } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';

/**
 * Статистика для владельца бота (/stats). Только чтение.
 * Считаем прямо в SQL: так быстрее и не тянем все подписки в память.
 */

/** Стоимость подписки в месяц, в копейках (как monthlyKopecks в common/money.ts) */
const MONTHLY = sql`(case s.period_unit
  when 'WEEK' then s.price_kopecks * 52.0 / 12 / s.period_count
  when 'MONTH' then s.price_kopecks * 1.0 / s.period_count
  else s.price_kopecks / 12.0 / s.period_count end)`;

export interface Overview {
  users: number;
  new24h: number;
  newPrev7d: number;
  new7d: number;
  active24h: number;
  active7d: number;
  activeSubs: number;
  newSubs24h: number;
  monthlyTotalKopecks: number;
  reminders24h: number;
}

export interface UsersStats {
  total: number;
  new24h: number;
  new7d: number;
  new30d: number;
  active24h: number;
  active7d: number;
  active30d: number;
  withSubs: number;
  blocked: number;
  reviewsOff: number;
  /** Сколько пользователей с 0, 1, 2–3, 4–6, 7+ активными подписками */
  distribution: { bucket: string; users: number }[];
  timezones: { name: string; users: number }[];
}

export interface GrowthDay {
  day: string;
  users: number;
  subs: number;
}

export interface SubsStats {
  active: number;
  trials: number;
  cancelled: number;
  cancelled7d: number;
  added7d: number;
  bySource: { source: string; total: number; last7d: number }[];
  byCategory: { category: string; count: number; monthlyKopecks: number }[];
  byPeriod: { period: string; count: number }[];
  shared: number;
  members: number;
  payments30d: number;
  avgMonthlyKopecks: number;
}

export interface ServicesStats {
  top: { name: string; count: number }[];
  custom: { name: string; count: number }[];
  cancelled: { name: string; count: number }[];
}

export interface MoneyStats {
  monthlyTotalKopecks: number;
  avgPerUserKopecks: number;
  medianPerUserKopecks: number;
  maxPerUserKopecks: number;
  savedMonthlyKopecks: number;
  savedThisMonthKopecks: number;
}

export interface ActivityStats {
  reminders24h: number;
  reminders7d: number;
  memberReminders7d: number;
  reviews7d: number;
  confirmed7d: number;
  muted: number;
  cancelled7d: number;
  payments7d: number;
}

export interface RecentUser {
  name: string;
  username: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  subs: number;
  blocked: boolean;
}

@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async rows<T>(query: SQL): Promise<T[]> {
    const result = await this.db.execute(query);
    return result.rows as T[];
  }

  private async one<T>(query: SQL): Promise<T> {
    return (await this.rows<T>(query))[0];
  }

  async overview(): Promise<Overview> {
    const r = await this.one<Record<keyof Overview, string>>(sql`
      select
        (select count(*) from users) as users,
        (select count(*) from users where created_at > now() - interval '1 day') as "new24h",
        (select count(*) from users where created_at > now() - interval '7 days') as "new7d",
        (select count(*) from users where created_at between now() - interval '14 days' and now() - interval '7 days') as "newPrev7d",
        (select count(*) from users where last_seen_at > now() - interval '1 day') as "active24h",
        (select count(*) from users where last_seen_at > now() - interval '7 days') as "active7d",
        (select count(*) from subscriptions where status = 'ACTIVE') as "activeSubs",
        (select count(*) from subscriptions where created_at > now() - interval '1 day') as "newSubs24h",
        (select coalesce(sum(${MONTHLY}), 0) from subscriptions s where s.status = 'ACTIVE') as "monthlyTotalKopecks",
        (select count(*) from reminder_logs where sent_at > now() - interval '1 day') as "reminders24h"
    `);
    return numbers<Overview>(r);
  }

  async users(): Promise<UsersStats> {
    const r = await this.one<Record<string, string>>(sql`
      select
        count(*) as total,
        count(*) filter (where created_at > now() - interval '1 day') as "new24h",
        count(*) filter (where created_at > now() - interval '7 days') as "new7d",
        count(*) filter (where created_at > now() - interval '30 days') as "new30d",
        count(*) filter (where last_seen_at > now() - interval '1 day') as "active24h",
        count(*) filter (where last_seen_at > now() - interval '7 days') as "active7d",
        count(*) filter (where last_seen_at > now() - interval '30 days') as "active30d",
        count(*) filter (where bot_blocked) as blocked,
        count(*) filter (where not reviews_enabled) as "reviewsOff",
        count(*) filter (where exists (select 1 from subscriptions s where s.user_id = users.id and s.status = 'ACTIVE')) as "withSubs"
      from users
    `);
    const distribution = await this.rows<{ bucket: string; users: string }>(sql`
      select bucket, count(*) as users from (
        select case
          when n = 0 then '0' when n = 1 then '1' when n <= 3 then '2–3' when n <= 6 then '4–6' else '7+' end as bucket,
          case when n = 0 then 0 when n = 1 then 1 when n <= 3 then 2 when n <= 6 then 3 else 4 end as ord
        from (
          select (select count(*) from subscriptions s where s.user_id = u.id and s.status = 'ACTIVE') as n from users u
        ) t
      ) b group by bucket, ord order by ord
    `);
    const timezones = await this.rows<{ name: string; users: string }>(sql`
      select timezone as name, count(*) as users from users group by timezone order by count(*) desc, timezone limit 5
    `);
    return {
      ...numbers<Omit<UsersStats, 'distribution' | 'timezones'>>(r),
      distribution: distribution.map((d) => ({ bucket: d.bucket, users: Number(d.users) })),
      timezones: timezones.map((t) => ({ name: t.name, users: Number(t.users) })),
    };
  }

  /** Новые пользователи и подписки по дням (в часовом поясе админа) */
  async growth(timezone: string, days = 14): Promise<GrowthDay[]> {
    const rows = await this.rows<{ day: string; users: string; subs: string }>(sql`
      with days as (
        select generate_series(
          (now() at time zone ${timezone})::date - ${days - 1}::int,
          (now() at time zone ${timezone})::date,
          interval '1 day'
        )::date as day
      )
      select to_char(d.day, 'DD.MM') as day,
        (select count(*) from users u where (u.created_at at time zone ${timezone})::date = d.day) as users,
        (select count(*) from subscriptions s where (s.created_at at time zone ${timezone})::date = d.day) as subs
      from days d order by d.day
    `);
    return rows.map((r) => ({ day: r.day, users: Number(r.users), subs: Number(r.subs) }));
  }

  async subscriptions(): Promise<SubsStats> {
    const r = await this.one<Record<string, string>>(sql`
      select
        count(*) filter (where status = 'ACTIVE') as active,
        count(*) filter (where status = 'ACTIVE' and is_trial) as trials,
        count(*) filter (where status = 'CANCELLED') as cancelled,
        count(*) filter (where status = 'CANCELLED' and cancelled_at > now() - interval '7 days') as "cancelled7d",
        count(*) filter (where created_at > now() - interval '7 days') as "added7d",
        coalesce(avg(${MONTHLY}) filter (where status = 'ACTIVE'), 0) as "avgMonthlyKopecks",
        (select count(distinct subscription_id) from subscription_members) as shared,
        (select count(*) from subscription_members) as members,
        (select count(*) from member_payments where paid_at > now() - interval '30 days') as "payments30d"
      from subscriptions s
    `);
    const bySource = await this.rows<{ source: string; total: string; last7d: string }>(sql`
      select source, count(*) as total, count(*) filter (where created_at > now() - interval '7 days') as last7d
      from subscriptions group by source order by count(*) desc
    `);
    const byCategory = await this.rows<{ category: string; count: string; monthly: string }>(sql`
      select coalesce(sv.category::text, 'OTHER') as category, count(*) as count, sum(${MONTHLY}) as monthly
      from subscriptions s left join services sv on sv.id = s.service_id
      where s.status = 'ACTIVE' group by 1 order by sum(${MONTHLY}) desc
    `);
    const byPeriod = await this.rows<{ period: string; count: string }>(sql`
      select period_unit || ':' || period_count as period, count(*) as count
      from subscriptions where status = 'ACTIVE' group by 1 order by count(*) desc
    `);
    return {
      ...numbers<Omit<SubsStats, 'bySource' | 'byCategory' | 'byPeriod'>>(r),
      bySource: bySource.map((s) => ({ source: s.source, total: Number(s.total), last7d: Number(s.last7d) })),
      byCategory: byCategory.map((c) => ({ category: c.category, count: Number(c.count), monthlyKopecks: Number(c.monthly) })),
      byPeriod: byPeriod.map((p) => ({ period: p.period, count: Number(p.count) })),
    };
  }

  async services(): Promise<ServicesStats> {
    const top = await this.rows<{ name: string; count: string }>(sql`
      select sv.name, count(*) as count from subscriptions s join services sv on sv.id = s.service_id
      where s.status = 'ACTIVE' group by sv.name order by count(*) desc, sv.name limit 10
    `);
    // Свои подписки, которых нет в каталоге: подсказывают, что в каталог добавить
    const custom = await this.rows<{ name: string; count: string }>(sql`
      select min(custom_name) as name, count(*) as count from subscriptions
      where service_id is null and custom_name is not null
      group by lower(trim(custom_name)) order by count(*) desc, 1 limit 10
    `);
    const cancelled = await this.rows<{ name: string; count: string }>(sql`
      select coalesce(sv.name, min(s.custom_name)) as name, count(*) as count
      from subscriptions s left join services sv on sv.id = s.service_id
      where s.status = 'CANCELLED' group by sv.name, case when sv.name is null then lower(trim(s.custom_name)) end
      order by count(*) desc limit 5
    `);
    const map = (rows: { name: string; count: string }[]) => rows.map((r) => ({ name: r.name, count: Number(r.count) }));
    return { top: map(top), custom: map(custom), cancelled: map(cancelled) };
  }

  async money(timezone: string): Promise<MoneyStats> {
    const r = await this.one<Record<string, string>>(sql`
      with per_user as (
        select s.user_id, sum(${MONTHLY}) as monthly from subscriptions s where s.status = 'ACTIVE' group by s.user_id
      )
      select
        coalesce((select sum(monthly) from per_user), 0) as "monthlyTotalKopecks",
        coalesce((select avg(monthly) from per_user), 0) as "avgPerUserKopecks",
        coalesce((select percentile_cont(0.5) within group (order by monthly) from per_user), 0) as "medianPerUserKopecks",
        coalesce((select max(monthly) from per_user), 0) as "maxPerUserKopecks",
        coalesce((select sum(${MONTHLY}) from subscriptions s where s.status = 'CANCELLED'), 0) as "savedMonthlyKopecks",
        coalesce((select sum(${MONTHLY}) from subscriptions s where s.status = 'CANCELLED'
          and date_trunc('month', s.cancelled_at at time zone ${timezone}) = date_trunc('month', now() at time zone ${timezone})), 0)
          as "savedThisMonthKopecks"
    `);
    return numbers<MoneyStats>(r);
  }

  async activity(): Promise<ActivityStats> {
    const r = await this.one<Record<string, string>>(sql`
      select
        (select count(*) from reminder_logs where sent_at > now() - interval '1 day') as "reminders24h",
        (select count(*) from reminder_logs where sent_at > now() - interval '7 days') as "reminders7d",
        (select count(*) from reminder_logs l join subscriptions s on s.id = l.subscription_id
          where l.sent_at > now() - interval '7 days' and l.user_id <> s.user_id) as "memberReminders7d",
        (select count(*) from subscriptions where last_reviewed_at > now() - interval '7 days') as "reviews7d",
        (select count(*) from subscriptions where usage_confirmed_at > now() - interval '7 days') as "confirmed7d",
        (select count(*) from subscriptions where review_muted) as muted,
        (select count(*) from subscriptions where cancelled_at > now() - interval '7 days') as "cancelled7d",
        (select count(*) from member_payments where paid_at > now() - interval '7 days') as "payments7d"
    `);
    return numbers<ActivityStats>(r);
  }

  async recentUsers(limit = 10): Promise<RecentUser[]> {
    const rows = await this.rows<{
      first_name: string | null;
      username: string | null;
      created_at: Date;
      last_seen_at: Date | null;
      subs: string;
      bot_blocked: boolean;
    }>(sql`
      select u.first_name, u.username, u.created_at, u.last_seen_at, u.bot_blocked,
        (select count(*) from subscriptions s where s.user_id = u.id and s.status = 'ACTIVE') as subs
      from users u order by u.created_at desc limit ${limit}
    `);
    return rows.map((r) => ({
      name: r.first_name?.trim() || (r.username ? `@${r.username}` : 'Без имени'),
      username: r.username,
      createdAt: new Date(r.created_at),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at) : null,
      subs: Number(r.subs),
      blocked: r.bot_blocked,
    }));
  }
}

/** Postgres отдаёт count/sum строками — переводим в числа */
function numbers<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Math.round(Number(v ?? 0))])) as unknown as T;
}
