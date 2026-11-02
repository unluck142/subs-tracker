import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { autoRetry } from '@grammyjs/auto-retry';
import { Bot, Context, GrammyError, InlineKeyboard } from 'grammy';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  activityText,
  ADMIN_SECTIONS,
  adminKeyboard,
  AdminSection,
  growthText,
  moneyText,
  overviewText,
  recentText,
  servicesText,
  subsText,
  usersText,
} from '../admin/admin-texts';
import { AdminService } from '../admin/admin.service';
import { CatalogService } from '../catalog/catalog.service';
import { todayInTz } from '../common/dates';
import { AppConfig, CONFIG } from '../config';
import type { User } from '../db/schema';
import { SharingService } from '../sharing/sharing.service';
import { displayName, shareKopecks } from '../sharing/sharing.logic';
import { overlapHint } from '../subscriptions/bundles';
import { SubscriptionsService, SubscriptionView } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { DraftStore } from './drafts';
import {
  ADD_BY_TEXT_HINT,
  adminAlertText,
  addedText,
  alreadyTrackedText,
  askPriceText,
  cancelledText,
  DRAFT_EXPIRED_TEXT,
  FOREIGN_CURRENCY_TEXT,
  memberAlreadyText,
  sharedEndedText,
  draftText,
  HELP_TEXT,
  joinedText,
  joinOfferText,
  joinStatusText,
  memberJoinedText,
  memberPaidText,
  sharePaidText,
  shareReminderText,
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

const USER_COMMANDS = [
  { command: 'start', description: 'Открыть приложение' },
  { command: 'list', description: 'Мои подписки и сумма в месяц' },
  { command: 'help', description: 'Справка' },
];

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
    private readonly sharing: SharingService,
    private readonly admin: AdminService,
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
    // «Слишком много запросов» (429) и сбои Telegram — подождать, сколько просит Telegram, и повторить.
    // Важно для рассылки напоминаний: в 10:00 их уходит много одновременно.
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));
    this.registerHandlers(this.bot);
    this.bot.catch((err) => {
      // Повторное нажатие кнопки («message is not modified») и запоздалый ответ на кнопку — не ошибки
      if (err.error instanceof GrammyError && /message is not modified|query is too old/.test(err.error.description)) {
        return;
      }
      this.logger.error(`Ошибка в обработчике бота: ${err.message}`, err.stack);
      void this.alertAdmins('бот', err.error ?? err);
      // Пользователь не должен оставаться без ответа
      void err.ctx.reply('Что-то пошло не так 😔 Попробуй ещё раз чуть позже.').catch(() => undefined);
    });

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
      await bot.api.setMyCommands(USER_COMMANDS);
      // Владельцу — ещё и /stats. Остальные её в меню не видят.
      for (const id of this.config.adminTelegramIds) await this.setAdminCommands(id);
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
    // Бот работает только в личных сообщениях: в группе он отвечал бы на каждое сообщение
    bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.chat.type !== 'private') return;
      await next();
    });

    // Пользователь заблокировал или разблокировал бота — Telegram сообщает сразу.
    // Без этого узнали бы только при неудачной отправке напоминания, и статистика врала бы.
    bot.on('my_chat_member', async (ctx) => {
      const status = ctx.myChatMember.new_chat_member.status;
      const user = await this.users.findByTelegramId(ctx.myChatMember.from.id);
      if (!user) return;
      if (status === 'kicked') await this.users.markBotBlocked(user.id, true);
      else if (status === 'member') await this.users.markBotBlocked(user.id, false);
    });

    bot.command('start', async (ctx) => {
      if (!ctx.from) return;
      const user = await this.users.upsertFromTelegram(ctx.from, { unblock: true });
      // Админ мог впервые написать боту уже после запуска — ставим ему меню с /stats сразу
      if (this.isAdmin(ctx)) void this.setAdminCommands(ctx.from.id);
      // Ссылка-приглашение в общую подписку: t.me/бот?start=join_<токен>
      const payload = typeof ctx.match === 'string' ? ctx.match : '';
      if (payload.startsWith('join_')) return this.showJoinOffer(ctx, user, payload.slice(5));
      await ctx.reply(welcomeText(user.firstName, Boolean(this.config.webAppUrl)), {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(),
      });
    });

    // Присоединиться к общей подписке: j:<токен> / jno
    bot.callbackQuery(/^j:([\w-]+)$/, async (ctx) => {
      const user = await this.userFromCtx(ctx);
      if (!user) return ctx.answerCallbackQuery();
      const result = await this.sharing.join(user, ctx.match[1]);
      if (result.status !== 'joined') {
        const name = result.status === 'not-found' ? undefined : result.info.name;
        await ctx.editMessageText(joinStatusText(result.status, name), { parse_mode: 'HTML' });
        return ctx.answerCallbackQuery();
      }
      const { info } = result;
      const share = shareKopecks(info.priceKopecks, info.membersCount);
      await ctx.editMessageText(joinedText(info, displayName(info.owner), info.owner.username, share), {
        parse_mode: 'HTML',
        reply_markup: this.openAppKeyboard(),
      });
      await this.notify(info.owner, memberJoinedText(displayName(user), info, info.membersCount + 1, share));
      return ctx.answerCallbackQuery({ text: 'Готово 👥' });
    });
    bot.callbackQuery('jno', async (ctx) => {
      await ctx.editMessageText('Ок, не присоединяюсь. Если передумаешь — открой ссылку ещё раз.');
      return ctx.answerCallbackQuery();
    });

    // Участник перевёл свою долю: sp:<id подписки>
    bot.callbackQuery(/^sp:(\d+)$/, async (ctx) => {
      const user = await this.userFromCtx(ctx);
      if (!user) return ctx.answerCallbackQuery();
      const subscriptionId = Number(ctx.match[1]);
      const member = await this.sharing.findMember(subscriptionId, user.id);
      if (!member) {
        await ctx.editMessageText('Ты больше не участвуешь в этой подписке.').catch(() => undefined);
        return ctx.answerCallbackQuery();
      }
      const change = await this.sharing.setPaid(user, subscriptionId, member.id, true);
      await ctx.editMessageText(sharePaidText(change.shareKopecks, displayName(change.info.owner)), {
        parse_mode: 'HTML',
      });
      await this.notify(change.info.owner, memberPaidText(displayName(user), change.info.name, change.shareKopecks));
      return ctx.answerCallbackQuery({ text: 'Отметил ✅' });
    });

    bot.command('help', (ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'HTML' }));

    // Статистика — только для владельцев бота (ADMIN_TELEGRAM_IDS), остальным как неизвестная команда
    bot.command('stats', async (ctx) => {
      if (!this.isAdmin(ctx)) return ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
      const user = await this.userFromCtx(ctx);
      const { text, keyboard } = await this.adminSection('overview', user?.timezone ?? 'Europe/Moscow');
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });

    // Разделы админ-панели: adm:<раздел>. Чужим нажатиям (если кто-то перешлёт сообщение) не отвечаем.
    bot.callbackQuery(/^adm:(\w+)$/, async (ctx) => {
      const section = ctx.match[1] as AdminSection;
      if (!this.isAdmin(ctx) || !ADMIN_SECTIONS.includes(section)) return ctx.answerCallbackQuery();
      const user = await this.userFromCtx(ctx);
      const { text, keyboard } = await this.adminSection(section, user?.timezone ?? 'Europe/Moscow');
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
        return ctx.answerCallbackQuery();
      } catch (e) {
        if (e instanceof GrammyError && e.description.includes('message is not modified')) {
          return ctx.answerCallbackQuery({ text: 'Без изменений' });
        }
        throw e;
      }
    });

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
            const cancelled = await this.subs.cancel(user.id, id);
            await this.notifySharedEnded(
              this.subs.nameOf(cancelled),
              user,
              await this.sharing.memberUsers(id),
              false,
            );
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
        // Сообщение не трогаем: при двойном нажатии там уже «✅ Добавил», затирать его нельзя
        return ctx.answerCallbackQuery({ text: DRAFT_EXPIRED_TEXT, show_alert: true });
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
            source: p.kind === 'bank' ? 'sms' : 'bot',
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
      if (outcome.reason === 'currency') return ctx.reply(FOREIGN_CURRENCY_TEXT, { parse_mode: 'HTML' });
      return ctx.reply(ADD_BY_TEXT_HINT, { parse_mode: 'HTML', reply_markup: this.openAppKeyboard() });
    }

    const p = outcome.parsed;
    const existing = await this.subs.findActiveMatch(user, p.service?.id ?? null, p.name);
    // Чужую общую подписку менять нельзя — просто напоминаем, что она уже есть
    if (existing?.role === 'member') return ctx.reply(memberAlreadyText(existing), { parse_mode: 'HTML' });
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
    // Раз пишет или жмёт кнопки — бот не заблокирован. Иначе после разблокировки без /start
    // напоминания так и не возобновились бы.
    return this.users.upsertFromTelegram(ctx.from, { unblock: true });
  }

  private async showJoinOffer(ctx: Context, user: User, token: string) {
    const info = await this.sharing.infoByToken(token);
    if (!info) return ctx.reply(joinStatusText('not-found'), { parse_mode: 'HTML' });
    if (info.owner.id === user.id) return ctx.reply(joinStatusText('owner', info.name), { parse_mode: 'HTML' });
    if (await this.sharing.findMember(info.subscriptionId, user.id)) {
      return ctx.reply(joinStatusText('already', info.name), { parse_mode: 'HTML' });
    }
    const share = shareKopecks(info.priceKopecks, info.membersCount + 1);
    return ctx.reply(joinOfferText(displayName(info.owner), info, info.membersCount + 2, share), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('✅ Присоединиться', `j:${token}`).text('Не сейчас', 'jno'),
    });
  }

  private async setAdminCommands(chatId: number): Promise<void> {
    await this.bot?.api
      .setMyCommands([...USER_COMMANDS, { command: 'stats', description: 'Статистика (только для тебя)' }], {
        scope: { type: 'chat', chat_id: chatId },
      })
      // «chat not found» — админ ещё не писал боту; поставим, когда нажмёт /start
      .catch((e) => this.logger.warn(`Не удалось поставить меню админу ${chatId}: ${(e as Error).message}`));
  }

  private isAdmin(ctx: Context): boolean {
    return Boolean(ctx.from && this.config.adminTelegramIds.includes(ctx.from.id));
  }

  /** Текст и кнопки раздела админ-панели */
  private async adminSection(section: AdminSection, tz: string): Promise<{ text: string; keyboard: InlineKeyboard }> {
    const now = new Date();
    const texts: Record<AdminSection, () => Promise<string>> = {
      overview: async () => overviewText(await this.admin.overview(), now, tz),
      users: async () => usersText(await this.admin.users(), now, tz),
      growth: async () => growthText(await this.admin.growth(tz), now, tz),
      subs: async () => subsText(await this.admin.subscriptions(), now, tz),
      services: async () => servicesText(await this.admin.services(), now, tz),
      money: async () => moneyText(await this.admin.money(tz), now, tz),
      activity: async () => activityText(await this.admin.activity(), now, tz),
      recent: async () => recentText(await this.admin.recentUsers(), now, tz),
    };
    return { text: await texts[section](), keyboard: adminKeyboard(section) };
  }

  private readonly lastAlerts = new Map<string, number>();

  /**
   * Сообщить владельцам бота об ошибке. Одинаковые ошибки — не чаще раза в 10 минут,
   * чтобы падение базы не превратилось в сотню сообщений.
   */
  async alertAdmins(where: string, error: unknown): Promise<void> {
    if (!this.bot || this.config.adminTelegramIds.length === 0) return;
    const message = error instanceof Error ? error.message : String(error);
    const key = `${where}:${message}`;
    const last = this.lastAlerts.get(key) ?? 0;
    if (Date.now() - last < 10 * 60_000) return;
    this.lastAlerts.set(key, Date.now());
    if (this.lastAlerts.size > 500) this.lastAlerts.clear();
    for (const id of this.config.adminTelegramIds) {
      await this.bot.api
        .sendMessage(id, adminAlertText(where, message), { parse_mode: 'HTML' })
        .catch((e) => this.logger.warn(`Не удалось отправить ошибку админу ${id}: ${(e as Error).message}`));
    }
  }

  /**
   * Владелец отменил или удалил общую подписку — сообщаем участникам, чтобы они не ждали напоминаний.
   * Участников нужно получить до удаления: после него записи пропадут каскадом.
   */
  async notifySharedEnded(name: string, owner: User, members: User[], deleted: boolean): Promise<void> {
    for (const member of members) {
      await this.notify(member, sharedEndedText(name, displayName(owner), deleted));
    }
  }

  /** Короткое уведомление без кнопок (участник присоединился, перевёл долю…) */
  async notify(user: User, text: string): Promise<void> {
    if (!this.bot || user.botBlocked) return;
    await this.send(user, text, new InlineKeyboard(), 'уведомление');
  }

  /** Участнику общей подписки: «скинься за Яндекс Плюс» */
  async sendShareReminder(user: User, sub: SubscriptionView): Promise<SendResult> {
    const keyboard = new InlineKeyboard().text('✅ Перевёл', `sp:${sub.id}`);
    if (this.config.webAppUrl) keyboard.row().webApp('📱 Подписки', this.config.webAppUrl);
    return this.send(user, shareReminderText(sub), keyboard, `напоминание участнику ${sub.id}`);
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
