import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import type { BotService } from '../bot/bot.service';

/**
 * Ошибки сервера (500) в запросах мини-приложения сообщаем владельцам бота в Telegram.
 * Ошибки пользователя (400, 401, 404) — нормальная работа, о них не пишем.
 */
@Catch()
export class AlertingFilter extends BaseExceptionFilter {
  constructor(
    private readonly bot: BotService,
    ...args: ConstructorParameters<typeof BaseExceptionFilter>
  ) {
    super(...args);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const isServerError = !(exception instanceof HttpException) || exception.getStatus() >= 500;
    if (isServerError && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request>();
      void this.bot.alertAdmins(`API ${req.method} ${req.path}`, exception);
    }
    super.catch(exception, host);
  }
}
