export type PeriodUnit = 'WEEK' | 'MONTH' | 'YEAR';
export type Category =
  | 'VIDEO'
  | 'MUSIC'
  | 'ECOSYSTEM'
  | 'BANK'
  | 'CLOUD'
  | 'SHOPPING'
  | 'EDUCATION'
  | 'GAMES'
  | 'CONNECTION'
  | 'SPORT'
  | 'OTHER';

export interface Me {
  id: number;
  firstName: string | null;
  username: string | null;
  timezone: string;
  reminderHour: number;
  reviewsEnabled: boolean;
  digestEnabled: boolean;
  isPremium: boolean;
}

export interface CatalogItem {
  id: number;
  slug: string;
  name: string;
  category: Category;
  color: string;
  periodUnit: PeriodUnit;
  periodCount: number;
  suggestedPriceKopecks: number | null;
  isPopular: boolean;
  hasCancelGuide: boolean;
  /** Как сервис подписан в выписке банка */
  merchantPatterns: string[];
}

export interface Subscription {
  id: number;
  name: string;
  serviceId: number | null;
  serviceSlug: string | null;
  color: string | null;
  category: Category;
  priceKopecks: number;
  periodUnit: PeriodUnit;
  periodCount: number;
  monthlyKopecks: number;
  nextChargeDate: string;
  daysLeft: number;
  isTrial: boolean;
  remindDaysBefore: number;
  notes: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  hasCancelGuide: boolean;
  /** В какую подписку эта уже входит (или дубль которой она) */
  includedIn: string | null;
  /** owner — своя, member — участвую в чужой общей подписке */
  role: 'owner' | 'member';
  sharing: SharingInfo | null;
}

export interface SharingInfo {
  /** Участников, не считая владельца */
  membersCount: number;
  /** Доля одного человека за одно списание */
  shareKopecks: number;
  ownerName: string | null;
  ownerUsername: string | null;
  /** Для владельца: сколько участников перевели за ближайшее списание */
  paidCount: number;
  /** Для участника: перевёл ли он */
  paid: boolean;
}

export interface Member {
  memberId: number;
  name: string;
  username: string | null;
  paid: boolean;
  isMe: boolean;
}

export interface MembersInfo {
  owner: string;
  shareKopecks: number;
  members: Member[];
}

export interface Overlap {
  kind: 'bundle' | 'duplicate';
  subscriptionId: number;
  name: string;
  coveredByName: string;
  monthlyKopecks: number;
}

export interface Stats {
  activeCount: number;
  monthlyKopecks: number;
  yearlyKopecks: number;
  next7DaysKopecks: number;
  byCategory: { category: Category; monthlyKopecks: number; count: number }[];
  savedMonthlyKopecks: number;
  trialsCount: number;
  overlaps: Overlap[];
}

export interface SubscriptionInput {
  /** Откуда добавлена — для статистики (по умолчанию форма в приложении) */
  source?: 'app' | 'import';
  serviceId?: number;
  customName?: string;
  price: number;
  periodUnit: PeriodUnit;
  periodCount: number;
  nextChargeDate: string;
  isTrial: boolean;
  remindDaysBefore: number;
  notes?: string;
}
