/**
 * Заполнить/обновить каталог сервисов. Можно запускать сколько угодно раз —
 * существующие записи обновятся по slug, подписки пользователей не пострадают.
 * Запуск: npm run db:seed
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { CANCEL_GUIDES } from './cancel-guides';
import { CATALOG } from './catalog.data';
import * as schema from './schema';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    for (const [index, entry] of CATALOG.entries()) {
      const guide = CANCEL_GUIDES[entry.slug];
      const values = {
        slug: entry.slug,
        name: entry.name,
        category: entry.category,
        color: entry.color,
        searchAliases: entry.aliases ?? null,
        merchantPatterns: entry.merchants ?? null,
        defaultPriceKopecks: entry.price != null ? Math.round(entry.price * 100) : null,
        periodUnit: entry.periodUnit ?? 'MONTH',
        isPopular: entry.popular ?? false,
        sortOrder: index,
        cancelUrl: guide?.url ?? entry.cancelUrl ?? null,
        cancelSteps: guide?.steps ?? entry.cancelSteps ?? null,
      } as const;
      await db
        .insert(schema.services)
        .values(values)
        .onConflictDoUpdate({
          target: schema.services.slug,
          set: {
            name: values.name,
            category: values.category,
            color: values.color,
            searchAliases: values.searchAliases,
            merchantPatterns: values.merchantPatterns,
            defaultPriceKopecks: values.defaultPriceKopecks,
            periodUnit: values.periodUnit,
            isPopular: values.isPopular,
            sortOrder: values.sortOrder,
            // Инструкции из файла не затирают те, что уже заполнены в БД вручную
            cancelUrl: sql`coalesce(excluded.cancel_url, ${schema.services.cancelUrl})`,
            cancelSteps: sql`coalesce(excluded.cancel_steps, ${schema.services.cancelSteps})`,
          },
        });
    }
    console.log(`✅ Каталог обновлён, сервисов в каталоге: ${CATALOG.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ Ошибка заполнения каталога:', e);
  process.exit(1);
});
