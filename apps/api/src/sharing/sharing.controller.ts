import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { CurrentUser, TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { BotService } from '../bot/bot.service';
import { memberLeftText, memberPaidText } from '../bot/messages';
import type { User } from '../db/schema';
import { displayName } from './sharing.logic';
import { SharingService } from './sharing.service';

class SetPaidDto {
  @IsBoolean()
  paid!: boolean;
}

@Controller('subscriptions/:id')
@UseGuards(TelegramAuthGuard)
export class SharingController {
  constructor(
    private readonly sharing: SharingService,
    private readonly bot: BotService,
  ) {}

  /** Токен для ссылки-приглашения t.me/бот?start=join_<токен> */
  @Post('invite')
  invite(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.sharing.invite(user, id);
  }

  @Get('members')
  members(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.sharing.members(user, id);
  }

  /** Отметить оплату доли за ближайшее списание (владелец — за любого, участник — за себя) */
  @Post('members/:memberId/paid')
  async setPaid(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: SetPaidDto,
  ) {
    const change = await this.sharing.setPaid(user, id, memberId, dto.paid);
    // Участник сам отметил перевод — сообщаем владельцу
    if (dto.paid && change.member.id === user.id) {
      await this.bot.notify(change.info.owner, memberPaidText(displayName(user), change.info.name, change.shareKopecks));
    }
    return this.sharing.members(user, id);
  }

  /** Владелец исключает участника, или участник выходит сам */
  @Delete('members/:memberId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    const { info, member } = await this.sharing.removeMember(user, id, memberId);
    const removedByOwner = info.owner.id === user.id;
    await this.bot.notify(
      removedByOwner ? member : info.owner,
      memberLeftText(displayName(member), info.name, removedByOwner),
    );
  }
}
