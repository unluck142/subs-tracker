import { Controller, Get, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminService } from './admin/admin.service';
import { TelegramAuthGuard } from './auth/telegram-auth.guard';
import { BotService } from './bot/bot.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { PublicController } from './catalog/public.controller';
import { DbModule } from './db/db.module';
import { RemindersService } from './reminders/reminders.service';
import { SharingController } from './sharing/sharing.controller';
import { SharingService } from './sharing/sharing.service';
import { SubscriptionsController } from './subscriptions/subscriptions.controller';
import { SubscriptionsService } from './subscriptions/subscriptions.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [DbModule, ScheduleModule.forRoot()],
  controllers: [HealthController, UsersController, CatalogController, SubscriptionsController, SharingController, PublicController],
  providers: [
    TelegramAuthGuard,
    UsersService,
    CatalogService,
    SubscriptionsService,
    SharingService,
    AdminService,
    BotService,
    RemindersService,
  ],
})
export class AppModule {}
