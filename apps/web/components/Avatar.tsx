import { colorFromName } from '@/lib/format';

/** На светлом фоне (жёлтый Т-Банка и т.п.) белая буква не читается — берём тёмную */
function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#1c1c1e' : '#fff';
}

export default function Avatar({
  name,
  color,
  size,
}: {
  name: string;
  color?: string | null;
  size?: 'lg';
}) {
  // Array.from — чтобы не разрезать эмодзи пополам
  const letter = (Array.from(name.trim())[0] ?? '?').toUpperCase();
  const bg = color || colorFromName(name);
  return (
    <div
      className={`avatar${size ? ` ${size}` : ''}`}
      style={{ background: bg, color: textColorFor(bg) }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
