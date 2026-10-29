import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, TelegramAuthGuard } from '../auth/telegram-auth.guard';
import type { User } from '../db/schema';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(TelegramAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('all') all?: string) {
    return this.subs.list(user, { includeCancelled: all === '1' });
  }

  @Get('stats')
  stats(@CurrentUser() user: User) {
    return this.subs.stats(user);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.subs.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateSubscriptionDto) {
    return this.subs.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubscriptionDto) {
    return this.subs.update(user, id, dto);
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this.subs.cancel(user.id, id);
    return this.subs.get(user, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.subs.restore(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.subs.remove(user, id);
  }
}
