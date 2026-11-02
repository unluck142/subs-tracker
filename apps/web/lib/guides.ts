/**
 * Инструкции «Как отменить подписку» для SEO-страниц /otmena. Берутся с публичного API (без авторизации).
 * Используется только на сервере (в серверных компонентах Next.js).
 */
import type { Category } from './types';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Адрес сайта для ссылок в sitemap и разметке. На сервере — https://nespishut.ru */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nespishut.ru').replace(/\/$/, '');
export const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME ?? 'nespishut_bot';

export interface GuideListItem {
  slug: string;
  name: string;
  category: Category;
}

export interface Guide extends GuideListItem {
  cancelSteps: string;
  cancelUrl: string | null;
}

export async function getGuides(): Promise<GuideListItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/public/cancel-guides`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as GuideListItem[]) : [];
  } catch {
    return [];
  }
}

export async function getGuide(slug: string): Promise<Guide | null> {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/api/public/cancel-guides/${slug}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Guide) : null;
  } catch {
    return null;
  }
}

export type GuideBlock = { type: 'ol' | 'ul'; items: string[] } | { type: 'p'; text: string };

/** Текст инструкции → блоки: «1. …» — нумерованный список, «• …» — маркированный, остальное — абзацы */
export function toBlocks(steps: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  for (const raw of steps.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    const bullet = line.match(/^•\s+(.*)$/);
    const type = numbered ? 'ol' : bullet ? 'ul' : 'p';
    const text = numbered?.[1] ?? bullet?.[1] ?? line;
    const last = blocks[blocks.length - 1];
    if (type !== 'p' && last && last.type === type) last.items.push(text);
    else blocks.push(type === 'p' ? { type, text } : { type, items: [text] });
  }
  return blocks;
}
