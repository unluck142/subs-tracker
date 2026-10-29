/**
 * Тонкая обёртка над window.Telegram.WebApp.
 * Скрипт telegram-web-app.js подключён в layout.tsx. Вне Telegram (в обычном браузере)
 * все функции безопасно ничего не делают — так удобно разрабатывать локально.
 */

interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function webApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const app = window.Telegram?.WebApp;
  // Скрипт создаёт объект и вне Telegram, но initData тогда пустая
  return app && app.initData ? app : null;
}

export function initData(): string {
  return webApp()?.initData ?? '';
}

export function haptic(type: 'success' | 'error' | 'warning' | 'select') {
  const h = webApp()?.HapticFeedback;
  if (!h) return;
  if (type === 'select') h.selectionChanged();
  else h.notificationOccurred(type);
}

export function confirmAction(message: string): Promise<boolean> {
  const app = webApp();
  if (app) return new Promise((resolve) => app.showConfirm(message, resolve));
  return Promise.resolve(window.confirm(message));
}

export function colorScheme(): 'light' | 'dark' {
  const app = window.Telegram?.WebApp;
  if (app?.colorScheme) return app.colorScheme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
