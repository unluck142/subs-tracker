/**
 * Стартовый каталог сервисов.
 *
 * price — цена в рублях за период. Специально оставлена пустой: цены меняются
 * несколько раз в год, а выдуманная цена хуже, чем никакой. Пока поле пустое,
 * приложение подсказывает среднюю цену, которую вводят сами пользователи
 * (когда наберётся хотя бы 3 подписки на сервис). Если хочешь — впиши актуальные
 * цены для самых популярных сервисов и перезапусти `npm run db:seed`.
 *
 * merchants — как сервис называется в выписке банка. По ним импорт выписки узнаёт
 * подписку даже по одному списанию. Если сервис не находится в чьей-то выписке —
 * допиши сюда, как он там подписан.
 *
 * cancelSteps — инструкция «как отменить». Наполняй постепенно: эти же тексты
 * потом станут SEO-страницами «Как отключить подписку X».
 */
import type { Category, PeriodUnit } from './schema';

export interface CatalogEntry {
  slug: string;
  name: string;
  category: Category;
  color: string;
  aliases?: string;
  /** Как сервис подписан в выписке банка (через запятую). Регистр и знаки препинания не важны. */
  merchants?: string;
  price?: number | null;
  periodUnit?: PeriodUnit;
  popular?: boolean;
  cancelUrl?: string;
  cancelSteps?: string;
}

export const CATALOG: CatalogEntry[] = [
  // Экосистемы
  { slug: 'yandex-plus', name: 'Яндекс Плюс', category: 'ECOSYSTEM', color: '#FC3F1D', aliases: 'yandex plus, плюс, яндекс музыка, кинопоиск', popular: true, merchants: 'YANDEX PLUS, PLUS YANDEX, YANDEX.PLUS, ЯНДЕКС ПЛЮС, ЯНДЕКС.ПЛЮС' },
  { slug: 'sberprime', name: 'СберПрайм', category: 'ECOSYSTEM', color: '#21A038', aliases: 'sberprime, сбер прайм, сбер', popular: true, merchants: 'SBERPRIME, SBER PRIME, СБЕРПРАЙМ, СБЕР ПРАЙМ' },
  { slug: 'mts-premium', name: 'МТС Premium', category: 'ECOSYSTEM', color: '#E30611', aliases: 'mts premium, мтс премиум', merchants: 'MTS PREMIUM, МТС PREMIUM, МТС ПРЕМИУМ' },

  // Кино и сериалы
  { slug: 'kinopoisk', name: 'Кинопоиск', category: 'VIDEO', color: '#FF6600', aliases: 'kinopoisk, кп', popular: true, merchants: 'KINOPOISK, КИНОПОИСК' },
  { slug: 'okko', name: 'Okko', category: 'VIDEO', color: '#5B2EFF', aliases: 'окко', popular: true, merchants: 'OKKO, ОККО' },
  { slug: 'ivi', name: 'Иви', category: 'VIDEO', color: '#EA003D', aliases: 'ivi', popular: true, merchants: 'IVI, ИВИ' },
  { slug: 'wink', name: 'Wink', category: 'VIDEO', color: '#FF4F12', aliases: 'винк, ростелеком', popular: true, merchants: 'WINK, ВИНК' },
  { slug: 'start', name: 'START', category: 'VIDEO', color: '#1E1E1E', aliases: 'старт', merchants: 'START.RU, START ONLINE, START VIDEO' },
  { slug: 'premier', name: 'Premier', category: 'VIDEO', color: '#FDB913', aliases: 'премьер, тнт', merchants: 'PREMIER.ONE, PREMIER ONE, ПРЕМЬЕР' },
  { slug: 'kion', name: 'KION', category: 'VIDEO', color: '#7A3CF5', aliases: 'кион, мтс', merchants: 'KION, КИОН' },
  { slug: 'amediateka', name: 'Амедиатека', category: 'VIDEO', color: '#0F2C59', aliases: 'amediateka', merchants: 'AMEDIATEKA, АМЕДИАТЕКА' },
  { slug: 'more-tv', name: 'more.tv', category: 'VIDEO', color: '#00B4FF', aliases: 'мор тв, моретв', merchants: 'MORE.TV, MORETV' },
  { slug: 'smotreshka', name: 'Смотрёшка', category: 'VIDEO', color: '#E4003A', aliases: 'смотрешка, smotreshka, онлайн тв, тв', merchants: 'SMOTRESHKA, СМОТРЕШКА' },

  // Музыка и книги
  { slug: 'vk-music', name: 'VK Музыка', category: 'MUSIC', color: '#0077FF', aliases: 'вк музыка, vk music, boom, бум', popular: true, merchants: 'VK MUSIC, VK MUZYKA, ВК МУЗЫКА, BOOM' },
  { slug: 'zvuk', name: 'Звук', category: 'MUSIC', color: '#7B61FF', aliases: 'zvuk, сберзвук', merchants: 'ZVUK, SBERZVUK, ЗВУК' },
  { slug: 'litres', name: 'Литрес', category: 'MUSIC', color: '#FF5C00', aliases: 'litres, литрес абонемент, книги', merchants: 'LITRES, ЛИТРЕС' },
  { slug: 'yandex-books', name: 'Яндекс Книги', category: 'MUSIC', color: '#FFCC00', aliases: 'букмейт, bookmate, книги', merchants: 'BOOKMATE, БУКМЕЙТ, YANDEX BOOKS, ЯНДЕКС КНИГИ' },

  // Банки
  { slug: 'tbank-pro', name: 'Т-Банк Pro', category: 'BANK', color: '#FFDD2D', aliases: 'тинькофф про, tinkoff pro, т банк про', popular: true, merchants: 'TINKOFF PRO, ТИНЬКОФФ PRO, Т-БАНК PRO, T-BANK PRO, ПОДПИСКА PRO' },
  { slug: 'alfa-smart', name: 'Альфа-Смарт', category: 'BANK', color: '#EF3124', aliases: 'alfa smart, альфа смарт', merchants: 'ALFA SMART, АЛЬФА-СМАРТ, АЛЬФА СМАРТ' },

  // Облако, софт, нейросети
  { slug: 'telegram-premium', name: 'Telegram Premium', category: 'CLOUD', color: '#2AABEE', aliases: 'телеграм премиум, тг премиум', popular: true, merchants: 'TELEGRAM, ТЕЛЕГРАМ' },
  { slug: 'yandex-360', name: 'Яндекс 360', category: 'CLOUD', color: '#FC3F1D', aliases: 'яндекс диск, disk, 360', merchants: 'YANDEX 360, ЯНДЕКС 360, YANDEX DISK, ЯНДЕКС ДИСК' },
  { slug: 'cloud-mail', name: 'Облако Mail', category: 'CLOUD', color: '#005FF9', aliases: 'облако мэйл, mail.ru, облако', merchants: 'CLOUD.MAIL, MAIL.RU CLOUD, ОБЛАКО MAIL' },
  { slug: 'icloud', name: 'iCloud+', category: 'CLOUD', color: '#3693F3', aliases: 'айклауд, apple', merchants: 'ICLOUD' },
  { slug: 'chatgpt', name: 'ChatGPT Plus', category: 'CLOUD', color: '#10A37F', aliases: 'чатгпт, openai, gpt', merchants: 'OPENAI, CHATGPT' },

  // Покупки и доставка
  { slug: 'ozon-premium', name: 'Ozon Premium', category: 'SHOPPING', color: '#005BFF', aliases: 'озон премиум, ozon', popular: true, merchants: 'OZON PREMIUM, ОЗОН ПРЕМИУМ' },
  { slug: 'x5-paket', name: 'Пакет X5', category: 'SHOPPING', color: '#5FAF2D', aliases: 'пакет, перекрёсток, перекресток, пятёрочка, пятерочка', merchants: 'ПАКЕТ X5, X5 PAKET, X5 CLUB' },

  // Обучение
  { slug: 'skyeng', name: 'Skyeng', category: 'EDUCATION', color: '#3F8AE0', aliases: 'скаенг, скайенг, английский', merchants: 'SKYENG, СКАЕНГ' },
  { slug: 'duolingo', name: 'Duolingo Super', category: 'EDUCATION', color: '#58CC02', aliases: 'дуолинго', merchants: 'DUOLINGO' },

  // Игры
  { slug: 'ps-plus', name: 'PlayStation Plus', category: 'GAMES', color: '#0070D1', aliases: 'ps plus, пс плюс, playstation, сони', merchants: 'PLAYSTATION, SONY INTERACTIVE' },
  { slug: 'xbox-game-pass', name: 'Xbox Game Pass', category: 'GAMES', color: '#107C10', aliases: 'game pass, гейм пасс, xbox', merchants: 'XBOX' },

  // Связь
  { slug: 'mobile', name: 'Мобильная связь', category: 'CONNECTION', color: '#8E44AD', aliases: 'мтс, билайн, мегафон, т2, tele2, теле2, yota, йота, сотовая, телефон', popular: true, merchants: 'MTS, МТС, BEELINE, БИЛАЙН, MEGAFON, МЕГАФОН, TELE2, ТЕЛЕ2, YOTA, ЙОТА' },
  { slug: 'home-internet', name: 'Домашний интернет', category: 'CONNECTION', color: '#16A085', aliases: 'интернет, wi-fi, вайфай, ростелеком, дом.ру', popular: true, merchants: 'ROSTELECOM, РОСТЕЛЕКОМ, DOM.RU, ДОМ.РУ, ЭР-ТЕЛЕКОМ' },

  // Спорт
  { slug: 'gym', name: 'Фитнес-клуб', category: 'SPORT', color: '#E67E22', aliases: 'спортзал, зал, абонемент, фитнес', merchants: 'FITNESS, ФИТНЕС, WORLD CLASS, DDX' },

  // Другое
  { slug: 'boosty', name: 'Boosty', category: 'OTHER', color: '#F15F2C', aliases: 'бусти, донаты, авторы', merchants: 'BOOSTY' },
];
