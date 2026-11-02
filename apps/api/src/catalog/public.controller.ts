import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { asc, eq, isNotNull } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { services } from '../db/schema';

/**
 * Публичные данные без авторизации — для SEO-страниц сайта «Как отменить подписку X».
 * Только каталог сервисов, никаких данных пользователей.
 */
@Controller('public')
export class PublicController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('cancel-guides')
  async list() {
    return this.db
      .select({ slug: services.slug, name: services.name, category: services.category })
      .from(services)
      .where(isNotNull(services.cancelSteps))
      .orderBy(asc(services.sortOrder));
  }

  @Get('cancel-guides/:slug')
  async get(@Param('slug') slug: string) {
    const [row] = await this.db
      .select({
        slug: services.slug,
        name: services.name,
        category: services.category,
        cancelSteps: services.cancelSteps,
        cancelUrl: services.cancelUrl,
      })
      .from(services)
      .where(eq(services.slug, slug.slice(0, 64)));
    if (!row?.cancelSteps) throw new NotFoundException('Инструкции для этого сервиса пока нет');
    return row;
  }
}
