import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig, CONFIG } from '../config';
import type { User } from '../db/schema';
import { UsersService } from '../users/users.service';
import { InitDataError, validateInitData } from './init-data';

type AuthedRequest = Request & { user?: User };

/**
 * Пускает запрос, только если в заголовке Authorization: tma <initData>
 * лежат подписанные Telegram данные. В режиме разработки без Telegram
 * можно задать DEV_TELEGRAM_ID в .env.
 */
@Injectable()
export class TelegramAuthGuard implements CanActivate {
  private readonly logger = new Logger(TelegramAuthGuard.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const [scheme, initData] = header.split(' ');

    if (scheme === 'tma' && initData) {
      if (!this.config.botToken) {
        throw new UnauthorizedException('На сервере не задан BOT_TOKEN');
      }
      try {
        const { user } = validateInitData(initData, this.config.botToken, this.config.initDataMaxAge);
        req.user = await this.users.upsertFromTelegram(user);
        return true;
      } catch (e) {
        if (e instanceof InitDataError) throw new UnauthorizedException(e.message);
        throw e;
      }
    }

    if (this.config.devTelegramId) {
      req.user = await this.users.upsertFromTelegram({
        id: this.config.devTelegramId,
        first_name: 'Разработчик',
      });
      return true;
    }

    this.logger.debug('Запрос без авторизации Telegram');
    throw new UnauthorizedException('Открой приложение через Telegram');
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user!;
});
