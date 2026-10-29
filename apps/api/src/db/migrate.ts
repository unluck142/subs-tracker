/**
 * Применить миграции из папки drizzle/ к базе из DATABASE_URL.
 * Запуск: npm run db:migrate
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
    console.log('✅ Миграции применены');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ Ошибка миграции:', e);
  process.exit(1);
});
