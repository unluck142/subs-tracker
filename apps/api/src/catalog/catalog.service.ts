import { Inject, Injectable } from '@nestjs/common';
import { and, asc, avg, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import type { CatalogRef } from '../bot/parse-message';
import { Service, services, subscriptions } from '../db/schema';

/** Сколько подписок нужно, чтобы доверять средней цене от пользователей */
const MIN_SAMPLES_FOR_SUGGESTED_PRICE = 3;

export interface CatalogItem {
  id: number;
  slug: string;
  name: string;
  category: Service['category'];
  color: string;
  periodUnit: Service['periodUnit'];
  periodCount: number;
  suggestedPriceKopecks: number | null;
  isPopular: boolean;
  hasCancelGuide: boolean;
  /** Как сервис подписан в выписке банка — для импорта выписки (сопоставление идёт на устройстве) */
  merchantPatterns: string[];
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async search(query?: string): Promise<CatalogItem[]> {
    const q = query?.trim();
    const where = q
      ? or(ilike(services.name, `%${escapeLike(q)}%`), ilike(services.searchAliases, `%${escapeLike(q)}%`))
      : undefined;

    const rows = await this.db
      .select()
      .from(services)
      .where(where)
      .orderBy(desc(services.isPopular), asc(services.sortOrder), asc(services.name))
      .limit(q ? 20 : 200);

    const prices = await this.averagePrices(rows.filter((r) => r.defaultPriceKopecks == null).map((r) => r.id));
    return rows.map((r) => toItem(r, prices.get(`${r.id}:${r.periodUnit}`) ?? null));
  }

  private refsCache: { at: number; refs: CatalogRef[] } | null = null;

  /** Каталог для распознавания сервисов в сообщениях. Меняется только при db:seed — кэшируем на 10 минут. */
  async refs(): Promise<CatalogRef[]> {
    if (this.refsCache && Date.now() - this.refsCache.at < 10 * 60_000) return this.refsCache.refs;
    const rows = await this.db.select().from(services);
    const refs = rows.map((r) => ({
      id: r.id,
      name: r.name,
      periodUnit: r.periodUnit,
      periodCount: r.periodCount,
      patterns: [r.name, ...splitList(r.merchantPatterns)],
      aliases: splitList(r.searchAliases),
    }));
    this.refsCache = { at: Date.now(), refs };
    return refs;
  }

  async findById(id: number): Promise<Service | undefined> {
    return this.db.query.services.findFirst({ where: eq(services.id, id) });
  }

  /**
   * Если у сервиса не указана цена — подсказываем среднюю цену,
   * которую вводили сами пользователи. Цены меняются часто, так каталог
   * поддерживает себя в актуальном состоянии без ручной работы.
   */
  private async averagePrices(serviceIds: number[]): Promise<Map<string, number>> {
    // Ключ — «id:период», чтобы не смешивать месячные и годовые цены
    const result = new Map<string, number>();
    if (serviceIds.length === 0) return result;
    const rows = await this.db
      .select({
        serviceId: subscriptions.serviceId,
        periodUnit: subscriptions.periodUnit,
        avgPrice: avg(subscriptions.priceKopecks),
        samples: count(),
      })
      .from(subscriptions)
      .where(and(inArray(subscriptions.serviceId, serviceIds), eq(subscriptions.periodCount, 1)))
      .groupBy(subscriptions.serviceId, subscriptions.periodUnit);
    for (const row of rows) {
      if (row.serviceId != null && row.samples >= MIN_SAMPLES_FOR_SUGGESTED_PRICE && row.avgPrice) {
        // Округляем до целых рублей
        result.set(`${row.serviceId}:${row.periodUnit}`, Math.round(Number(row.avgPrice) / 100) * 100);
      }
    }
    return result;
  }
}

function toItem(row: Service, avgPrice: number | null): CatalogItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    color: row.color,
    periodUnit: row.periodUnit,
    periodCount: row.periodCount,
    suggestedPriceKopecks: row.defaultPriceKopecks ?? avgPrice,
    isPopular: row.isPopular,
    hasCancelGuide: Boolean(row.cancelSteps || row.cancelUrl),
    merchantPatterns: splitList(row.merchantPatterns),
  };
}

function splitList(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
