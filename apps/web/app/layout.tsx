import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Не спишут — напоминания о подписках',
  description: 'Все подписки в одном месте и напоминания до того, как спишут деньги.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // SDK Telegram до гидрации дописывает в <html> CSS-переменные темы (--tg-theme-*) — это ожидаемо
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* SDK мини-приложений Telegram: initData, тема, кнопка «Назад», вибрация */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
