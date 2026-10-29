import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { CatalogService } from './catalog.service';

@Controller('catalog')
@UseGuards(TelegramAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  search(@Query('q') q?: string) {
    return this.catalog.search(q?.slice(0, 64));
  }
}
