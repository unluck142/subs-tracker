import { randomBytes } from 'node:crypto';
import type { ParsedMessage } from './parse-message';

/**
 * Что бот предложил добавить или обновить, пока пользователь не нажал кнопку.
 * В callback_data Telegram помещается только 64 байта — название туда не влезет,
 * поэтому храним черновик здесь, а в кнопке — короткий ключ.
 *
 * Хранится в памяти: после перезапуска сервера старые кнопки ответят «пришли ещё раз».
 */
export interface Draft {
  userId: number;
  parsed: ParsedMessage;
  /** Подписка, которую обновляем (если цена изменилась) */
  existingId: number | null;
  createdAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 5000;

export class DraftStore {
  private readonly drafts = new Map<string, Draft>();

  put(draft: Omit<Draft, 'createdAt'>): string {
    this.cleanup();
    const key = randomBytes(6).toString('base64url');
    this.drafts.set(key, { ...draft, createdAt: Date.now() });
    return key;
  }

  /** Достать черновик и удалить: одна кнопка срабатывает один раз */
  take(key: string, userId: number): Draft | null {
    const draft = this.drafts.get(key);
    if (!draft || draft.userId !== userId || Date.now() - draft.createdAt > TTL_MS) return null;
    this.drafts.delete(key);
    return draft;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, d] of this.drafts) {
      if (now - d.createdAt > TTL_MS) this.drafts.delete(key);
    }
    // Map хранит порядок вставки — при переполнении выкидываем самые старые
    while (this.drafts.size >= MAX_DRAFTS) {
      const oldest = this.drafts.keys().next().value;
      if (oldest === undefined) break;
      this.drafts.delete(oldest);
    }
  }
}
