import type { NextConfig } from 'next';

// Адрес NestJS API. Запросы /api/* проксируются туда, поэтому мини-приложению
// нужен один HTTPS-домен, а CORS настраивать не придётся.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Разрешаем dev-серверу отдавать ресурсы через HTTPS-туннель (cloudflared), иначе мини-приложение в Telegram не загрузится
  allowedDevOrigins: ['*.trycloudflare.com'],
  // Значок «N» режима разработки в углу экрана: через туннель его видят и в Telegram — прячем
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
