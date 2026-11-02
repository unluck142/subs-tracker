import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/guides';

export default function robots(): MetadataRoute.Robots {
  // Мини-приложение и API поисковикам не нужны — индексируем лендинг и инструкции
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
