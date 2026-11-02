import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, TelegramAuthGuard } from '../auth/telegram-auth.guard';
import type { User } from '../db/schema';
import { UsersService } from './users.service';

class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  reminderHour?: number;

  @IsOptional()
  @IsBoolean()
  reviewsEnabled?: boolean;
}

function toDto(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    username: user.username,
    timezone: user.timezone,
    reminderHour: user.reminderHour,
    reviewsEnabled: user.reviewsEnabled,
    isPremium: user.isPremium,
  };
}

@Controller('me')
@UseGuards(TelegramAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: User) {
    return toDto(user);
  }

  @Patch()
  async update(@CurrentUser() user: User, @Body() dto: UpdateSettingsDto) {
    return toDto(await this.users.updateSettings(user.id, dto));
  }
}
