/**
 * Криптостойкий источник случайности (ADR-0006, PRD §9).
 *
 * ТОЛЬКО `crypto.getRandomValues` — никогда `Math.random`. Равномерность целых
 * без modulo-bias через rejection sampling. Все выборщики принимают инъектируемый
 * источник 32-битных слов (`next`) — это даёт детерминированные тесты.
 */

/** Равномерное 32-битное беззнаковое целое (crypto). */
export function randomUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}

const TWO32 = 2 ** 32;
const TWO53 = 2 ** 53;

function assertPositiveInt(n: number, api: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`${api}: n должно быть положительным целым, получено ${String(n)}`);
  }
}

/**
 * Равномерное целое в `[0, n)` для `n ≤ 2^32` через rejection sampling (без
 * `% n` bias): отбрасываем слова из «хвоста», не делящегося на `n` нацело.
 *
 * @param n Верхняя граница (исключительно), `1 ≤ n ≤ 2^32`.
 * @param next Источник 32-битных слов (для тестов); по умолчанию crypto.
 */
export function randomBelow(n: number, next: () => number = randomUint32): number {
  assertPositiveInt(n, 'randomBelow');
  if (n > TWO32) throw new RangeError('randomBelow: n превышает 2^32 — используйте randomBelowBig');
  if (n === 1) return 0;
  const limit = TWO32 - (TWO32 % n); // наибольшее кратное n, не превышающее 2^32
  let x = next() >>> 0;
  while (x >= limit) x = next() >>> 0;
  return x % n;
}

/** Собирает 53-битное целое из двух 32-битных слов. */
function next53(next: () => number): number {
  const hi = next() >>> 0;
  const lo = next() >>> 0;
  return (hi >>> 11) * TWO32 + lo; // 21 старших бит + 32 бита = 53 бита
}

/**
 * Равномерное целое в `[0, n)` для `n ≤ 2^53` (большие диапазоны) — rejection
 * sampling на 53 битах.
 *
 * @param n Верхняя граница (исключительно), `1 ≤ n ≤ 2^53`.
 * @param next Источник 32-битных слов (для тестов); по умолчанию crypto.
 */
export function randomBelowBig(n: number, next: () => number = randomUint32): number {
  assertPositiveInt(n, 'randomBelowBig');
  if (n > TWO53) throw new RangeError('randomBelowBig: n превышает 2^53');
  if (n === 1) return 0;
  const limit = TWO53 - (TWO53 % n);
  let x = next53(next);
  while (x >= limit) x = next53(next);
  return x % n;
}

/**
 * Равномерное вещественное в `[0, 1)` с 53-битной мантиссой (crypto-аналог
 * `Math.random`), собранное из двух 32-битных слов.
 *
 * @param next Источник 32-битных слов (для тестов); по умолчанию crypto.
 */
export function randomFloat53(next: () => number = randomUint32): number {
  const hi = next() >>> 0;
  const lo = next() >>> 0;
  return ((hi >>> 5) * 2 ** 26 + (lo >>> 6)) / TWO53;
}

/** Инъектируемый источник случайности для чистой логики (детерминизм в тестах). */
export interface RandomSource {
  /** Равномерное целое в `[0, n)` без modulo-bias. */
  below(n: number): number;
  /** Равномерное вещественное в `[0, 1)`. */
  float(): number;
}

/** Дефолтный криптостойкий источник: авто-выбор 32/53-битной выборки по величине `n`. */
export const secureRandom: RandomSource = {
  below: (n) => (n <= TWO32 ? randomBelow(n) : randomBelowBig(n)),
  float: () => randomFloat53(),
};
