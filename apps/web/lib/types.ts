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
