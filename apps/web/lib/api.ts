import { initData } from './telegram';
import type { CatalogItem, Me, Stats, Subscription, SubscriptionInput } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const data = initData();
  if (data) headers.set('Authorization', `tma ${data}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
    throw new ApiError(message || 'Что-то пошло не так, попробуй ещё раз', res.status);
  }
  return body as T;
}

export const api = {
  me: () => request<Me>('/me'),
  updateMe: (patch: Partial<Pick<Me, 'timezone' | 'reminderHour'>>) =>
    request<Me>('/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  catalog: (q = '') => request<CatalogItem[]>(`/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  list: (all = false) => request<Subscription[]>(`/subscriptions${all ? '?all=1' : ''}`),
  stats: () => request<Stats>('/subscriptions/stats'),
  create: (input: SubscriptionInput) =>
    request<Subscription>('/subscriptions', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, input: Partial<SubscriptionInput>) =>
    request<Subscription>(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  cancel: (id: number) => request<Subscription>(`/subscriptions/${id}/cancel`, { method: 'POST' }),
  restore: (id: number) => request<Subscription>(`/subscriptions/${id}/restore`, { method: 'POST' }),
  remove: (id: number) => request<void>(`/subscriptions/${id}`, { method: 'DELETE' }),
};
