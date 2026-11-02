import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { todayInTz } from '../common/dates';
import { DB, Db } from '../db/db.module';
import { memberPayments, services, subscriptionMembers, subscriptions, User, users } from '../db/schema';
import { subscriptionName, SubscriptionsService } from '../subscriptions/subscriptions.service';
import { displayName, MAX_PEOPLE, shareKopecks } from './sharing.logic';

export interface MemberView {
  memberId: number;
  name: string;
  username: string | null;
  paid: boolean;
  isMe: boolean;
}

export interface SharedSubscriptionInfo {
  subscriptionId: number;
  name: string;
  priceKopecks: number;
  periodUnit: 'WEEK' | 'MONTH' | 'YEAR';
  periodCount: number;
  nextChargeDate: string;
  owner: User;
  membersCount: number;
}

export type JoinResult =
  | { status: 'joined' | 'already' | 'owner' | 'full'; info: SharedSubscriptionInfo }
  | { status: 'not-found' };

/** Кто что сделал — чтобы бот мог уведомить второго человека */
export interface PaymentChange {
  info: SharedSubscriptionInfo;
  member: User;
  paid: boolean;
  shareKopecks: number;
}

@Injectable()
export class SharingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly subs: SubscriptionsService,
  ) {}

  /** Токен для ссылки-приглашения (создаётся один раз) */
  async invite(user: User, subscriptionId: number): Promise<{ token: string }> {
    const sub = await this.subs.findOwned(user.id, subscriptionId);
    if (sub.status !== 'ACTIVE') throw new ForbiddenException('Отменённой подпиской поделиться нельзя');
    if (sub.shareToken) return { token: sub.shareToken };
    const token = randomBytes(9).toString('base64url');
    await this.db.update(subscriptions).set({ shareToken: token }).where(eq(subscriptions.id, sub.id));
    return { token };
  }

  async infoByToken(token: string): Promise<SharedSubscriptionInfo | null> {
    const [row] = await this.db
      .select({ sub: subscriptions, owner: users, service: services })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .leftJoin(services, eq(services.id, subscriptions.serviceId))
      .where(and(eq(subscriptions.shareToken, token), eq(subscriptions.status, 'ACTIVE')));
    return row ? this.toInfo(row) : null;
  }

  async infoById(subscriptionId: number): Promise<SharedSubscriptionInfo> {
    const [row] = await this.db
      .select({ sub: subscriptions, owner: users, service: services })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .leftJoin(services, eq(services.id, subscriptions.serviceId))
      .where(eq(subscriptions.id, subscriptionId));
    if (!row) throw new NotFoundException('Подписка не найдена');
    return this.toInfo(row);
  }

  private async toInfo(row: {
    sub: typeof subscriptions.$inferSelect;
    owner: User;
    service: typeof services.$inferSelect | null;
  }): Promise<SharedSubscriptionInfo> {
    // Дату ближайшего списания считаем по часовому поясу владельца — он платит сервису
    const [fresh] = await this.subs.rollStale([{ ...row.sub, service: row.service }], todayInTz(row.owner.timezone));
    const members = await this.db
      .select({ id: subscriptionMembers.id })
      .from(subscriptionMembers)
      .where(eq(subscriptionMembers.subscriptionId, row.sub.id));
    return {
      subscriptionId: row.sub.id,
      name: subscriptionName({ ...row.sub, service: row.service }),
      priceKopecks: row.sub.priceKopecks,
      periodUnit: row.sub.periodUnit,
      periodCount: row.sub.periodCount,
      nextChargeDate: fresh.nextChargeDate,
      owner: row.owner,
      membersCount: members.length,
    };
  }

  async join(user: User, token: string): Promise<JoinResult> {
    const info = await this.infoByToken(token);
    if (!info) return { status: 'not-found' };
    if (info.owner.id === user.id) return { status: 'owner', info };
    if (await this.findMember(info.subscriptionId, user.id)) return { status: 'already', info };
    if (info.membersCount + 1 >= MAX_PEOPLE) return { status: 'full', info };
    await this.db
      .insert(subscriptionMembers)
      .values({ subscriptionId: info.subscriptionId, userId: user.id })
      .onConflictDoNothing();
    return { status: 'joined', info: { ...info, membersCount: info.membersCount + 1 } };
  }

  /** Участники подписки — видит владелец и сами участники */
  async members(user: User, subscriptionId: number): Promise<{ owner: string; shareKopecks: number; members: MemberView[] }> {
    const info = await this.infoById(subscriptionId);
    await this.assertAccess(user, info);
    const rows = await this.db
      .select({ member: subscriptionMembers, user: users })
      .from(subscriptionMembers)
      .innerJoin(users, eq(users.id, subscriptionMembers.userId))
      .where(eq(subscriptionMembers.subscriptionId, subscriptionId))
      .orderBy(subscriptionMembers.joinedAt);
    const payments = await this.db
      .select({ memberId: memberPayments.memberId })
      .from(memberPayments)
      .innerJoin(subscriptionMembers, eq(subscriptionMembers.id, memberPayments.memberId))
      .where(and(eq(subscriptionMembers.subscriptionId, subscriptionId), eq(memberPayments.chargeDate, info.nextChargeDate)));
    const paid = new Set(payments.map((p) => p.memberId));
    return {
      owner: displayName(info.owner),
      shareKopecks: shareKopecks(info.priceKopecks, rows.length),
      members: rows.map((r) => ({
        memberId: r.member.id,
        name: displayName(r.user),
        username: r.user.username,
        paid: paid.has(r.member.id),
        isMe: r.user.id === user.id,
      })),
    };
  }

  /** Отметить, что участник перевёл долю за ближайшее списание. Может сам участник или владелец. */
  async setPaid(user: User, subscriptionId: number, memberId: number, paid: boolean): Promise<PaymentChange> {
    const info = await this.infoById(subscriptionId);
    const member = await this.memberById(subscriptionId, memberId);
    if (info.owner.id !== user.id && member.userId !== user.id) throw new ForbiddenException('Нет доступа');
    if (paid) {
      await this.db
        .insert(memberPayments)
        .values({ memberId, chargeDate: info.nextChargeDate })
        .onConflictDoNothing();
    } else {
      await this.db
        .delete(memberPayments)
        .where(and(eq(memberPayments.memberId, memberId), eq(memberPayments.chargeDate, info.nextChargeDate)));
    }
    const memberUser = (await this.db.query.users.findFirst({ where: eq(users.id, member.userId) }))!;
    return { info, member: memberUser, paid, shareKopecks: shareKopecks(info.priceKopecks, info.membersCount) };
  }

  /** Владелец исключает участника, или участник выходит сам */
  async removeMember(user: User, subscriptionId: number, memberId: number): Promise<{ info: SharedSubscriptionInfo; member: User }> {
    const info = await this.infoById(subscriptionId);
    const member = await this.memberById(subscriptionId, memberId);
    if (info.owner.id !== user.id && member.userId !== user.id) throw new ForbiddenException('Нет доступа');
    await this.db.delete(subscriptionMembers).where(eq(subscriptionMembers.id, memberId));
    const memberUser = (await this.db.query.users.findFirst({ where: eq(users.id, member.userId) }))!;
    return { info: { ...info, membersCount: info.membersCount - 1 }, member: memberUser };
  }

  /** Пользователи-участники подписки (для уведомлений) */
  async memberUsers(subscriptionId: number): Promise<User[]> {
    const rows = await this.db
      .select({ user: users })
      .from(subscriptionMembers)
      .innerJoin(users, eq(users.id, subscriptionMembers.userId))
      .where(eq(subscriptionMembers.subscriptionId, subscriptionId));
    return rows.map((r) => r.user);
  }

  async findMember(subscriptionId: number, userId: number) {
    return this.db.query.subscriptionMembers.findFirst({
      where: and(eq(subscriptionMembers.subscriptionId, subscriptionId), eq(subscriptionMembers.userId, userId)),
    });
  }

  private async memberById(subscriptionId: number, memberId: number) {
    const member = await this.db.query.subscriptionMembers.findFirst({
      where: and(eq(subscriptionMembers.id, memberId), eq(subscriptionMembers.subscriptionId, subscriptionId)),
    });
    if (!member) throw new NotFoundException('Участник не найден');
    return member;
  }

  private async assertAccess(user: User, info: SharedSubscriptionInfo) {
    if (info.owner.id === user.id) return;
    if (await this.findMember(info.subscriptionId, user.id)) return;
    throw new NotFoundException('Подписка не найдена');
  }
}
