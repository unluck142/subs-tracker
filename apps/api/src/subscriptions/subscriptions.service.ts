import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { addDays, diffDays, parts, rollForward, todayInTz } from '../common/dates';
import { monthlyKopecks } from '../common/money';
import { DB, Db } from '../db/db.module';
import {
  Category,
  memberPayments,
  reminderLogs,
  Service,
  services,
  Subscription,
  subscriptionMembers,
  subscriptions,
  User,
  users,
} from '../db/schema';
import { displayName, shareKopecks } from '../sharing/sharing.logic';
import { findOverlaps, Overlap } from './bundles';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';

export type SubscriptionWithService = Subscription & { service: Service | null };

export interface SubscriptionView {
  id: number;
  name: string;
  serviceId: number | null;
  serviceSlug: string | null;
  color: string | null;
  category: Category;
  priceKopecks: number;
  periodUnit: Subscription['periodUnit'];
  periodCount: number;
  monthlyKopecks: number;
  nextChargeDate: string;
  daysLeft: number;
  isTrial: boolean;
  remindDaysBefore: number;
  notes: string | null;
  status: Subscription['status'];
  hasCancelGuide: boolean;
  /** Название подписки, в которую эта уже входит (или дубль которой она) — можно не платить дважды */
  includedIn: string | null;
  /** owner — своя подписка, member — участвует в чужой общей */
  role: 'owner' | 'member';
  /** Общая подписка: делится между несколькими людьми */
  sharing: SharingInfo | null;
}

export interface SharingInfo {
  /** Участников, не считая владельца */
  membersCount: number;
  /** Доля одного человека за одно списание */
  shareKopecks: number;
  /** Для участника: кто платит сервису и кому переводить */
  ownerName: string | null;
  ownerUsername: string | null;
  /** Для владельца: сколько участников уже перевели за ближайшее списание */
  paidCount: number;
  /** Для участника: перевёл ли он за ближайшее списание */
  paid: boolean;
}

export interface Stats {
  activeCount: number;
  monthlyKopecks: number;
  yearlyKopecks: number;
  /** Сколько спишут в ближайшие 7 дней */
  next7DaysKopecks: number;
  byCategory: { category: Category; monthlyKopecks: number; count: number }[];
  /** Сколько в месяц экономит пользователь благодаря отменённым подпискам */
  savedMonthlyKopecks: number;
  trialsCount: number;
  /** Где пользователь платит за одно и то же дважды */
  overlaps: Overlap[];
}

export function subscriptionName(sub: SubscriptionWithService): string {
  return sub.service?.name ?? sub.customName ?? 'Подписка';
}

@Injectable()
export class SubscriptionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Все подписки пользователя (по умолчанию — только активные), ближайшие сверху */
  async list(user: User, opts: { includeCancelled?: boolean } = {}): Promise<SubscriptionView[]> {
    const rows = await this.db.query.subscriptions.findMany({
      where: opts.includeCancelled
        ? eq(subscriptions.userId, user.id)
        : and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'ACTIVE')),
      with: { service: true },
      orderBy: [asc(subscriptions.nextChargeDate)],
    });
    const today = todayInTz(user.timezone);
    const fresh = await this.rollStale(rows, today);
    const owned = await this.withOwnerSharing(fresh.map((s) => this.toView(s, today)));
    const views = [...owned, ...(await this.memberViews(user, today))];
    const covered = new Map(findOverlaps(views).map((o) => [o.subscriptionId, o.coveredByName]));
    return views
      .map((v) => ({ ...v, includedIn: covered.get(v.id) ?? null }))
      .sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || a.daysLeft - b.daysLeft);
  }

  async get(user: User, id: number): Promise<SubscriptionView> {
    const sub = await this.findOwned(user.id, id);
    const today = todayInTz(user.timezone);
    const [fresh] = await this.rollStale([sub], today);
    const [view] = await this.withOwnerSharing([this.toView(fresh, today)]);
    return view;
  }

  /** Участники и оплаты по подпискам: id подписки → участники (id записи) и кто перевёл за ближайшее списание */
  private async sharingState(subs: { id: number; nextChargeDate: string }[]) {
    const result = new Map<number, { memberIds: number[]; paidMemberIds: Set<number> }>();
    if (subs.length === 0) return result;
    const members = await this.db
      .select({ id: subscriptionMembers.id, subscriptionId: subscriptionMembers.subscriptionId })
      .from(subscriptionMembers)
      .where(inArray(subscriptionMembers.subscriptionId, subs.map((s) => s.id)));
    if (members.length === 0) return result;
    const payments = await this.db
      .select({ memberId: memberPayments.memberId, chargeDate: memberPayments.chargeDate })
      .from(memberPayments)
      .where(inArray(memberPayments.memberId, members.map((m) => m.id)));
    const dateBySub = new Map(subs.map((s) => [s.id, s.nextChargeDate]));
    for (const m of members) {
      const entry = result.get(m.subscriptionId) ?? { memberIds: [], paidMemberIds: new Set<number>() };
      entry.memberIds.push(m.id);
      if (payments.some((p) => p.memberId === m.id && p.chargeDate === dateBySub.get(m.subscriptionId))) {
        entry.paidMemberIds.add(m.id);
      }
      result.set(m.subscriptionId, entry);
    }
    return result;
  }

  /** Свои подписки, которыми пользователь делится: считаем его долю */
  private async withOwnerSharing(views: SubscriptionView[]): Promise<SubscriptionView[]> {
    const state = await this.sharingState(views);
    return views.map((v) => {
      const st = state.get(v.id);
      if (!st) return v;
      return this.applyShare(v, {
        membersCount: st.memberIds.length,
        shareKopecks: shareKopecks(v.priceKopecks, st.memberIds.length),
        ownerName: null,
        ownerUsername: null,
        paidCount: st.paidMemberIds.size,
        paid: true,
      });
    });
  }

  /** Чужие общие подписки, в которых пользователь участвует */
  private async memberViews(user: User, today: string): Promise<SubscriptionView[]> {
    const rows = await this.db
      .select({ memberId: subscriptionMembers.id, sub: subscriptions, owner: users, service: services })
      .from(subscriptionMembers)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionMembers.subscriptionId))
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .leftJoin(services, eq(services.id, subscriptions.serviceId))
      .where(and(eq(subscriptionMembers.userId, user.id), eq(subscriptions.status, 'ACTIVE')));
    if (rows.length === 0) return [];
    const fresh = await this.rollStale(
      rows.map((r) => ({ ...r.sub, service: r.service })),
      today,
    );
    const state = await this.sharingState(fresh);
    return fresh.map((sub, i) => {
      const { memberId, owner } = rows[i];
      const st = state.get(sub.id)!;
      return this.applyShare(
        { ...this.toView(sub, today), role: 'member' as const },
        {
          membersCount: st.memberIds.length,
          shareKopecks: shareKopecks(sub.priceKopecks, st.memberIds.length),
          ownerName: displayName(owner),
          ownerUsername: owner.username,
          paidCount: st.paidMemberIds.size,
          paid: st.paidMemberIds.has(memberId),
        },
      );
    });
  }

  /** В итогах «в месяц» у общей подписки учитываем только свою долю */
  private applyShare(view: SubscriptionView, sharing: SharingInfo): SubscriptionView {
    return {
      ...view,
      sharing,
      monthlyKopecks: Math.round(monthlyKopecks(sharing.shareKopecks, view.periodUnit, view.periodCount)),
    };
  }

  async create(user: User, dto: CreateSubscriptionDto): Promise<SubscriptionView> {
    if (!dto.serviceId && !dto.customName) {
      throw new BadRequestException('Выберите сервис из каталога или укажите название');
    }
    if (dto.serviceId) {
      const service = await this.db.query.services.findFirst({
        where: (s, { eq }) => eq(s.id, dto.serviceId!),
      });
      if (!service) throw new BadRequestException('Сервис не найден');
    }
    const [created] = await this.db
      .insert(subscriptions)
      .values({
        userId: user.id,
        serviceId: dto.serviceId ?? null,
        customName: dto.serviceId ? null : dto.customName,
        priceKopecks: Math.round(dto.price * 100),
        periodUnit: dto.periodUnit,
        periodCount: dto.periodCount,
        nextChargeDate: dto.nextChargeDate,
        anchorDay: parts(dto.nextChargeDate).d,
        isTrial: dto.isTrial ?? false,
        remindDaysBefore: dto.remindDaysBefore ?? 1,
        notes: dto.notes || null,
        source: dto.source ?? 'app',
      })
      .returning();
    return this.get(user, created.id);
  }

  async update(user: User, id: number, dto: UpdateSubscriptionDto): Promise<SubscriptionView> {
    const sub = await this.findOwned(user.id, id);
    const set: Partial<Subscription> = { updatedAt: new Date() };
    if (dto.customName !== undefined && !sub.serviceId) set.customName = dto.customName;
    if (dto.price !== undefined) set.priceKopecks = Math.round(dto.price * 100);
    if (dto.periodUnit !== undefined) set.periodUnit = dto.periodUnit;
    if (dto.periodCount !== undefined) set.periodCount = dto.periodCount;
    if (dto.nextChargeDate !== undefined) {
      set.nextChargeDate = dto.nextChargeDate;
      set.anchorDay = parts(dto.nextChargeDate).d;
    }
    if (dto.isTrial !== undefined) set.isTrial = dto.isTrial;
    if (dto.remindDaysBefore !== undefined) set.remindDaysBefore = dto.remindDaysBefore;
    if (dto.notes !== undefined) set.notes = dto.notes || null;
    await this.db.update(subscriptions).set(set).where(eq(subscriptions.id, sub.id));
    return this.get(user, id);
  }

  /** Пользователь отменил подписку в самом сервисе — больше не напоминаем */
  async cancel(userId: number, id: number): Promise<SubscriptionWithService> {
    const sub = await this.findOwned(userId, id);
    await this.db
      .update(subscriptions)
      .set({ status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    return { ...sub, status: 'CANCELLED' };
  }

  /** Вернуть отменённую подписку (передумал или отменил по ошибке) */
  async restore(user: User, id: number): Promise<SubscriptionView> {
    const sub = await this.findOwned(user.id, id);
    await this.db
      .update(subscriptions)
      .set({ status: 'ACTIVE', cancelledAt: null, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    return this.get(user, id);
  }

  /** Удалить совсем (например, добавил по ошибке) */
  async remove(user: User, id: number): Promise<void> {
    const sub = await this.findOwned(user.id, id);
    await this.db.delete(subscriptions).where(eq(subscriptions.id, sub.id));
  }

  async stats(user: User): Promise<Stats> {
    const all = await this.list(user, { includeCancelled: true });
    const active = all.filter((s) => s.status === 'ACTIVE');
    const byCategory = new Map<Category, { monthlyKopecks: number; count: number }>();
    for (const s of active) {
      const entry = byCategory.get(s.category) ?? { monthlyKopecks: 0, count: 0 };
      entry.monthlyKopecks += s.monthlyKopecks;
      entry.count += 1;
      byCategory.set(s.category, entry);
    }
    const monthly = active.reduce((sum, s) => sum + s.monthlyKopecks, 0);
    return {
      activeCount: active.length,
      monthlyKopecks: Math.round(monthly),
      yearlyKopecks: Math.round(monthly * 12),
      next7DaysKopecks: active
        .filter((s) => s.daysLeft <= 7)
        .reduce((sum, s) => sum + (s.sharing?.shareKopecks ?? s.priceKopecks), 0),
      byCategory: [...byCategory.entries()]
        .map(([category, v]) => ({ category, monthlyKopecks: Math.round(v.monthlyKopecks), count: v.count }))
        .sort((a, b) => b.monthlyKopecks - a.monthlyKopecks),
      savedMonthlyKopecks: Math.round(
        all.filter((s) => s.status === 'CANCELLED').reduce((sum, s) => sum + s.monthlyKopecks, 0),
      ),
      trialsCount: active.filter((s) => s.isTrial).length,
      overlaps: findOverlaps(all),
    };
  }

  nameOf(sub: SubscriptionWithService): string {
    return subscriptionName(sub);
  }

  /** Пользователь подтвердил, что пользуется подпиской («Оставляю», «Пользуюсь») */
  async markUsed(userId: number, id: number): Promise<void> {
    const sub = await this.findOwned(userId, id);
    await this.db.update(subscriptions).set({ usageConfirmedAt: new Date() }).where(eq(subscriptions.id, sub.id));
  }

  /**
   * «Напомнить завтра»: молчим до завтра и снимаем отметку об отправленном напоминании,
   * чтобы завтра оно пришло снова. Возвращает подписку для текста ответа.
   */
  async snooze(user: User, id: number): Promise<SubscriptionView> {
    const sub = await this.get(user, id);
    const today = todayInTz(user.timezone);
    await this.db.update(subscriptions).set({ snoozeUntil: addDays(today, 1) }).where(eq(subscriptions.id, id));
    await this.db
      .delete(reminderLogs)
      .where(
        and(
          eq(reminderLogs.subscriptionId, id),
          eq(reminderLogs.chargeDate, sub.nextChargeDate),
          eq(reminderLogs.userId, user.id),
          eq(reminderLogs.kind, 'main'),
        ),
      );
    return sub;
  }

  /** «Не спрашивай про неё» в проверке пользования */
  async muteReview(userId: number, id: number): Promise<void> {
    const sub = await this.findOwned(userId, id);
    await this.db.update(subscriptions).set({ reviewMuted: true }).where(eq(subscriptions.id, sub.id));
  }

  /** Активная подписка на тот же сервис (или своя с таким же названием) — чтобы не завести дубль */
  async findActiveMatch(user: User, serviceId: number | null, name: string): Promise<SubscriptionView | null> {
    const active = await this.list(user);
    const lower = name.trim().toLowerCase();
    return (
      active.find((s) => (serviceId ? s.serviceId === serviceId : !s.serviceId && s.name.toLowerCase() === lower)) ??
      null
    );
  }

  async findOwned(userId: number, id: number): Promise<SubscriptionWithService> {
    const sub = await this.db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)),
      with: { service: true },
    });
    if (!sub) throw new NotFoundException('Подписка не найдена');
    return sub;
  }

  /** Перенести прошедшие даты списаний на следующий период и сохранить в БД */
  async rollStale(rows: SubscriptionWithService[], today: string): Promise<SubscriptionWithService[]> {
    const result: SubscriptionWithService[] = [];
    for (const sub of rows) {
      if (sub.status !== 'ACTIVE') {
        result.push(sub);
        continue;
      }
      const rolled = rollForward(sub, today);
      if (rolled.changed) {
        await this.db
          .update(subscriptions)
          .set({ nextChargeDate: rolled.nextChargeDate, isTrial: rolled.isTrial, updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));
        result.push({ ...sub, nextChargeDate: rolled.nextChargeDate, isTrial: rolled.isTrial });
      } else {
        result.push(sub);
      }
    }
    return result;
  }

  toView(sub: SubscriptionWithService, today: string): SubscriptionView {
    return {
      id: sub.id,
      name: subscriptionName(sub),
      serviceId: sub.serviceId,
      serviceSlug: sub.service?.slug ?? null,
      color: sub.service?.color ?? null,
      category: sub.service?.category ?? 'OTHER',
      priceKopecks: sub.priceKopecks,
      periodUnit: sub.periodUnit,
      periodCount: sub.periodCount,
      monthlyKopecks: Math.round(monthlyKopecks(sub.priceKopecks, sub.periodUnit, sub.periodCount)),
      nextChargeDate: sub.nextChargeDate,
      daysLeft: diffDays(today, sub.nextChargeDate),
      isTrial: sub.isTrial,
      remindDaysBefore: sub.remindDaysBefore,
      notes: sub.notes,
      status: sub.status,
      hasCancelGuide: Boolean(sub.service?.cancelSteps || sub.service?.cancelUrl),
      includedIn: null,
      role: 'owner',
      sharing: null,
    };
  }
}
