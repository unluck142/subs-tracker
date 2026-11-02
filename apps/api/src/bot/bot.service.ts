import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Bot, Context, GrammyError, InlineKeyboard } from 'grammy';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CatalogService } from '../catalog/catalog.service';
import { todayInTz } from '../common/dates';
import { AppConfig, CONFIG } from '../config';
import type { User } from '../db/schema';
import { overlapHint } from '../subscriptions/bundles';
import { SubscriptionsService, SubscriptionView } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { DraftStore } from './drafts';
import {
  ADD_BY_TEXT_HINT,
  addedText,
  alreadyTrackedText,
  askPriceText,
  cancelledText,
  DRAFT_EXPIRED_TEXT,
  draftText,
  HELP_TEXT,
  priceChangedText,
  priceUpdatedText,
  reviewMutedText,
  reviewText,
  reviewUnusedText,
  reviewUsedText,
  howToCancelText,
  keepText,
  listText,
  reminderText,
  welcomeText,
} from './messages';
import { parseMessage } from './parse-message';

export type SendResult = 'sent' | 'blocked' | 'failed';

@Injectable()
export class BotService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot | null = null;
  private readonly drafts = new DraftStore();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly subs: SubscriptionsService,
    private readonly catalog: CatalogService,
  ) {}

  get enabled(): boolean {
    return this.bot !== null;
  }

  async onModuleInit() {
    if (!this.config.botToken) {
      this.logger.warn('BOT_TOKEN не задан — бот и напоминания выключены, работает только API');
      return;
    }
    const proxy = this.config.telegramProxy;
    this.bot = new Bot(this.config.botToken, {
      client: proxy ? { baseFetchConfig: { agent: new SocksProxyAgent(proxy), compress: true } } : undefined,
    });
    if (proxy) this.logger.log(`Запросы к Telegram идут через прокси ${proxy}`);
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
            await this.subs.markUsed(user.id, id);
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

    // Ответы на проверку пользования: rv:use|no|mute:ID
    bot.callbackQuery(/^rv:(use|no|mute):(\d+)$/, async (ctx) => {
      const [, action, idRaw] = ctx.match;
      const user = await this.userFromCtx(ctx);
      if (!user) return ctx.answerCallbackQuery();
      const id = Number(idRaw);
      try {
        const sub = await this.subs.get(user, id);
        if (action === 'use') {
          await this.subs.markUsed(user.id, id);
          await ctx.editMessageText(reviewUsedText(sub), { parse_mode: 'HTML' });
        } else if (action === 'mute') {
          await this.subs.muteReview(user.id, id);
          await ctx.editMessageText(reviewMutedText(sub), { parse_mode: 'HTML' });
        } else {
          await ctx.editMessageText(reviewUnusedText(sub), {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('📖 Как отменить', `howto:${id}`).text('✅ Отменил', `cancel:${id}`),
          });
        }
        return ctx.answerCallbackQuery();
      } catch {
        return ctx.answerCallbackQuery({ text: 'Подписка не найдена — возможно, её уже удалили' });
      }
    });

    // Подписка текстом («Okko 399 15 числа») или пересланное СМС банка о списании
    bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) {
        return ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
      }
      const user = await this.userFromCtx(ctx);
      if (!user) return;
      await this.handleSubscriptionMessage(ctx, user, ctx.message.text);
    });

    // Кнопки под предложением добавить/обновить: d:<ключ черновика>:add|price|no
    bot.callbackQuery(/^d:([\w-]+):(add|price|no)$/, async (ctx) => {
      const [, key, action] = ctx.match;
      const user = await this.userFromCtx(ctx);
      if (!user) return ctx.answerCallbackQuery();
      const draft = this.drafts.take(key, user.id);
      if (!draft) {
        await ctx.editMessageText(DRAFT_EXPIRED_TEXT).catch(() => undefined);
        return ctx.answerCallbackQuery();
      }
      const p = draft.parsed;
      try {
        if (action === 'add') {
          await this.subs.create(user, {
            serviceId: p.service?.id,
            customName: p.service ? undefined : p.name,
            price: p.priceKopecks / 100,
            periodUnit: p.periodUnit,
            periodCount: p.periodCount,
            nextChargeDate: p.nextChargeDate,
            isTrial: p.isTrial,
            remindDaysBefore: 1,
          });
          const stats = await this.subs.stats(user);
          await ctx.editMessageText(addedText(p.name, stats.monthlyKopecks), {
            parse_mode: 'HTML',
            reply_markup: this.openAppKeyboard(),
          });
          return ctx.answerCallbackQuery({ text: 'Добавил ✅' });
        }
        if (action === 'price' && draft.existingId) {
          const sub = await this.subs.update(user, draft.existingId, {
            price: p.priceKopecks / 100,
            // Из СМС банка знаем, что списание было сегодня — заодно сдвигаем дату следующего
            ...(p.kind === 'bank' ? { nextChargeDate: p.nextChargeDate } : {}),
          });
          await ctx.editMessageText(priceUpdatedText(sub.name, sub.priceKopecks), { parse_mode: 'HTML' });
          return ctx.answerCallbackQuery({ text: 'Цена обновлена' });
        }
        await ctx.editMessageText(draft.existingId ? 'Ок, оставил прежнюю цену.' : 'Ок, не добавляю.');
        return ctx.answerCallbackQuery();
      } catch (e) {
        this.logger.warn(`Черновик ${action} не сохранился: ${(e as Error).message}`);
        return ctx.answerCallbackQuery({ text: 'Не получилось — попробуй ещё раз' });
      }
    });

    bot.on('message', (ctx) =>
      ctx.reply(ADD_BY_TEXT_HINT, { parse_mode: 'HTML', reply_markup: this.openAppKeyboard() }),
    );
  }

  private async handleSubscriptionMessage(ctx: Context, user: User, text: string) {
    const today = todayInTz(user.timezone);
    const outcome = parseMessage(text, await this.catalog.refs(), today);
    if (!outcome.ok) {
      if (outcome.reason === 'no-price' && outcome.name) {
        return ctx.reply(askPriceText(outcome.name), { parse_mode: 'HTML' });
      }
      return ctx.reply(ADD_BY_TEXT_HINT, { parse_mode: 'HTML', reply_markup: this.openAppKeyboard() });
    }

    const p = outcome.parsed;
    const existing = await this.subs.findActiveMatch(user, p.service?.id ?? null, p.name);
    if (existing && existing.priceKopecks !== p.priceKopecks) {
      const key = this.drafts.put({ userId: user.id, parsed: p, existingId: existing.id });
      return ctx.reply(priceChangedText(existing, p.priceKopecks), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('✅ Обновить цену', `d:${key}:price`).text('Оставить', `d:${key}:no`),
      });
    }
    if (existing) {
      // Списание прошло как ожидалось — следующая дата через период
      const fresh =
        p.kind === 'bank' && p.nextChargeDate > existing.nextChargeDate
          ? await this.subs.update(user, existing.id, { nextChargeDate: p.nextChargeDate })
          : existing;
      return ctx.reply(alreadyTrackedText(fresh, p.kind === 'bank'), { parse_mode: 'HTML' });
    }

    const key = this.drafts.put({ userId: user.id, parsed: p, existingId: null });
    const hint = overlapHint(p.service?.slug ?? null, await this.subs.list(user));
    return ctx.reply(draftText(p, hint), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('✅ Добавить', `d:${key}:add`).text('❌ Не надо', `d:${key}:no`),
    });
  }

  private async userFromCtx(ctx: Context): Promise<User | null> {
    if (!ctx.from) return null;
    return this.users.upsertFromTelegram(ctx.from);
  }

  /** Спросить, пользуется ли он подпиской */
  async sendReview(user: User, sub: SubscriptionView): Promise<SendResult> {
    const keyboard = new InlineKeyboard()
      .text('👍 Пользуюсь', `rv:use:${sub.id}`)
      .text('👎 Нет', `rv:no:${sub.id}`)
      .row()
      .text('🔕 Не спрашивай про неё', `rv:mute:${sub.id}`);
    return this.send(user, reviewText(sub), keyboard, `проверку ${sub.id}`);
  }

  private async send(user: User, text: string, keyboard: InlineKeyboard, what: string): Promise<SendResult> {
    if (!this.bot) return 'failed';
    try {
      await this.bot.api.sendMessage(user.telegramId, text, { parse_mode: 'HTML', reply_markup: keyboard });
      return 'sent';
    } catch (e) {
      // 403 — пользователь заблокировал бота
      if (e instanceof GrammyError && e.error_code === 403) {
        await this.users.markBotBlocked(user.id, true);
        return 'blocked';
      }
      this.logger.warn(`Не удалось отправить ${what}: ${(e as Error).message}`);
      return 'failed';
    }
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

    return this.send(user, reminderText(sub), keyboard, `напоминание ${sub.id}`);
  }
}
