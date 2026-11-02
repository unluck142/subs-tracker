import { describe, expect, it } from 'vitest';
import { toBlocks } from './guides';

describe('инструкция «как отменить» → блоки страницы', () => {
  it('нумерованные шаги, пункты и абзацы', () => {
    const blocks = toBlocks(['1. Открой профиль', '2. Нажми «Отменить»', '', 'Важно: до списания', '• App Store', '• Google Play'].join('\n'));
    expect(blocks).toEqual([
      { type: 'ol', items: ['Открой профиль', 'Нажми «Отменить»'] },
      { type: 'p', text: 'Важно: до списания' },
      { type: 'ul', items: ['App Store', 'Google Play'] },
    ]);
  });
});
