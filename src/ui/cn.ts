/** Мини-хелпер склейки классов: отбрасывает falsy-значения. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
