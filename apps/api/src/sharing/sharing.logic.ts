/** Общие подписки: сколько платит каждый */

/** Сколько человек может быть в одной общей подписке (вместе с владельцем) */
export const MAX_PEOPLE = 10;

/**
 * Доля каждого при делении поровну (владелец тоже платит свою долю).
 * Округляем вверх до рубля: 449 ₽ на троих — по 150 ₽, а не по 149,67.
 */
export function shareKopecks(priceKopecks: number, membersCount: number): number {
  if (membersCount <= 0) return priceKopecks;
  return Math.ceil(priceKopecks / (membersCount + 1) / 100) * 100;
}

/** Как показать человека: имя, а если его нет — @username */
export function displayName(user: { firstName: string | null; username: string | null }): string {
  return user.firstName?.trim() || (user.username ? `@${user.username}` : 'Участник');
}
