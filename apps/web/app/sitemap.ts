import type { MetadataRoute } from 'next';
import { getGuides, SITE_URL } from '@/lib/guides';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = await getGuides();
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/otmena`, changeFrequency: 'weekly', priority: 0.9 },
    ...guides.map((g) => ({ url: `${SITE_URL}/otmena/${g.slug}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
