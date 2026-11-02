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
import { BotService } from '../bot/bot.service';
import type { User } from '../db/schema';
import { SharingService } from '../sharing/sharing.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(TelegramAuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly sharing: SharingService,
    private readonly bot: BotService,
  ) {}

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
    const sub = await this.subs.cancel(user.id, id);
    await this.bot.notifySharedEnded(this.subs.nameOf(sub), user, await this.sharing.memberUsers(id), false);
    return this.subs.get(user, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.subs.restore(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    const sub = await this.subs.findOwned(user.id, id);
    // Участников берём до удаления — потом они удалятся вместе с подпиской
    const members = await this.sharing.memberUsers(id);
    await this.subs.remove(user, id);
    await this.bot.notifySharedEnded(this.subs.nameOf(sub), user, members, true);
  }
}
