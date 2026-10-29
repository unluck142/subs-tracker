import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Bot, Context, GrammyError, InlineKeyboard } from 'grammy';
import { AppConfig, CONFIG } from '../config';
import type { User } from '../db/schema';
import { SubscriptionsService, SubscriptionView } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import {
  cancelledText,
  HELP_TEXT,
  howToCancelText,
  keepText,
  listText,
  reminderText,
  welcomeText,
} from './messages';

export type SendResult = 'sent' | 'blocked' | 'failed';

@Injectable()
export class BotService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly subs: SubscriptionsService,
  ) {}

  get enabled(): boolean {
    return this.bot !== null;
  }

  async onModuleInit() {
    if (!this.config.botToken) {
      this.logger.warn('BOT_TOKEN не задан — бот и напоминания выключены, работает только API');
      return;
    }
    this.bot = new Bot(this.config.botToken);
    this.registerHandlers(this.bot);
    this.bot.catch((err) => this.logger.error(`Ошибка в обработчике бота: ${err.message}`, err.stack));

    // Не ждём bot.start(): он резолвится только при остановке бота
    void this.setupAndStart(this.bot);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.bot?.stop();
  }

  private stopping = false;
  private retryTimer: NodeJS.Timeout | null = null;

  private async setupAndStart(bot: Bot) {
    try {
      await bot.api.setMyCommands([
        { command: 'start', description: 'Открыть приложение' },
        { command: 'list', description: 'Мои подписки и сумма в месяц' },
        { command: 'help', description: 'Справка' },
      ]);
      if (this.config.webAppUrl) {
        // Кнопка «Подписки» слева от поля ввода — открывает мини-приложение
        await bot.api.setChatMenuButton({
          menu_button: { type: 'web_app', text: 'Подписки', web_app: { url: this.config.webAppUrl } },
        });
      }
      await bot.start({
        drop_pending_updates: true,
        onStart: (info) => this.logger.log(`Бот @${info.username} запущен`),
      });
    } catch (e) {
      if (this.stopping) return;
      // Неверный токен — повторять бессмысленно
      if (e instanceof GrammyError && e.error_code === 401) {
        this.logger.error('Telegram отклонил BOT_TOKEN — проверь токен в .env');
        return;
      }
      // Сеть недоступна или Telegram временно не отвечает — пробуем снова через 30 секунд
      this.logger.error(`Не удалось запустить бота: ${(e as Error).message}. Повтор через 30 сек.`);
      this.retryTimer = setTimeout(() => void this.setupAndStart(bot), 30_000);
    }
  }

  private openAppKeyboard(): InlineKeyboard | undefined {
    if (!this.config.webAppUrl) return undefined;
    return new InlineKeyboard().webApp('📱 Открыть подписки', this.config.webAppUrl);
  }

  private registerHandlers(bot: Bot) {
    bot.command('start', async (ctx) => {
      if (!ctx.from) return;
      const user = await this.users.upsertFromTelegram(ctx.from, { unblock: true });
      await ctx.reply(welcomeText(user.firstName, Boolean(this.config.webAppUrl)), {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(),
      });
    });

    bot.command('help', (ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'HTML' }));

    bot.command('list', async (ctx) => {
      const user = await this.userFromCtx(ctx);
      if (!user) return;
      const [list, stats] = await Promise.all([this.subs.list(user), this.subs.stats(user)]);
      await ctx.reply(listText(list, stats), { parse_mode: 'HTML', reply_markup: this.openAppKeyboard() });
    });

    // Кнопки под напоминанием: keep:ID, cancel:ID, undo:ID, howto:ID
    bot.callbackQuery(/^(keep|cancel|undo|howto):(\d+)$/, async (ctx) => {
      const [, action, idRaw] = ctx.match;
      const user = await this.userFromCtx(ctx);
      if (!user) return ctx.answerCallbackQuery();
      const id = Number(idRaw);

      try {
        switch (action) {
          case 'keep': {
            const sub = await this.subs.get(user, id);
            await ctx.editMessageText(keepText(sub), { parse_mode: 'HTML' });
            return ctx.answerCallbackQuery({ text: 'Оставляем 👌' });
          }
          case 'cancel': {
            await this.subs.cancel(user.id, id);
            const [sub, stats] = await Promise.all([this.subs.get(user, id), this.subs.stats(user)]);
            await ctx.editMessageText(cancelledText(sub, stats.savedMonthlyKopecks), {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text('↩️ Я передумал', `undo:${id}`),
            });
            return ctx.answerCallbackQuery({ text: 'Отмечено как отменённая' });
          }
          case 'undo': {
            const sub = await this.subs.restore(user, id);
            await ctx.editMessageText(keepText(sub), { parse_mode: 'HTML' });
            return ctx.answerCallbackQuery({ text: 'Вернул подписку' });
          }
          case 'howto': {
            const sub = await this.subs.findOwned(user.id, id);
            const keyboard = sub.service?.cancelUrl
              ? new InlineKeyboard().url('Открыть сайт сервиса', sub.service.cancelUrl)
              : undefined;
            await ctx.reply(howToCancelText(sub.service?.name ?? sub.customName ?? 'подписку', sub.service?.cancelSteps ?? null), {
              parse_mode: 'HTML',
              reply_markup: keyboard,
              link_preview_options: { is_disabled: true },
            });
            return ctx.answerCallbackQuery();
          }
        }
      } catch (e) {
        // Повторное нажатие той же кнопки — Telegram отвечает «message is not modified», это не ошибка
        if (e instanceof GrammyError && e.description.includes('message is not modified')) {
          return ctx.answerCallbackQuery();
        }
        this.logger.warn(`Кнопка ${action}:${id} не сработала: ${(e as Error).message}`);
        return ctx.answerCallbackQuery({ text: 'Подписка не найдена — возможно, её уже удалили' });
      }
    });

    bot.on('message', (ctx) =>
      ctx.reply('Управлять подписками удобнее в приложении 👇', { reply_markup: this.openAppKeyboard() }),
    );
  }

  private async userFromCtx(ctx: Context): Promise<User | null> {
    if (!ctx.from) return null;
    return this.users.upsertFromTelegram(ctx.from);
  }

  /** Отправить напоминание о списании. Возвращает результат, чтобы планировщик мог повторить попытку. */
  async sendReminder(user: User, sub: SubscriptionView): Promise<SendResult> {
    if (!this.bot) return 'failed';
    const keyboard = new InlineKeyboard()
      .text('✅ Оставляю', `keep:${sub.id}`)
      .text('❌ Отменил', `cancel:${sub.id}`)
      .row()
      .text('📖 Как отменить', `howto:${sub.id}`);
    if (this.config.webAppUrl) keyboard.row().webApp('📱 Все подписки', this.config.webAppUrl);

    try {
      await this.bot.api.sendMessage(user.telegramId, reminderText(sub), {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return 'sent';
    } catch (e) {
      // 403 — пользователь заблокировал бота
      if (e instanceof GrammyError && e.error_code === 403) {
        await this.users.markBotBlocked(user.id, true);
        return 'blocked';
      }
      this.logger.warn(`Не удалось отправить напоминание ${sub.id}: ${(e as Error).message}`);
      return 'failed';
    }
  }
}
