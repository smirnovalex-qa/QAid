/**
 * Тест-помощники слоя `shared/test-data`: детерминированные/наблюдаемые источники
 * случайности. Не тест-файл (нет `.test`) — vitest его не запускает; в порог
 * покрытия `__tests__/**` не входит.
 */
import type { RandomSource } from '@/shared/random';

/**
 * Детерминированный источник из seed (mulberry32). Только для воспроизводимости в
 * тестах — допускаем лёгкий modulo-bias (в проде — `secureRandom`).
 */
export function seeded(seed: number): RandomSource {
  let a = seed >>> 0;
  const nextUint = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    below: (n) => (n <= 1 ? 0 : nextUint() % n),
    float: () => nextUint() / 2 ** 32,
  };
}

/** Источник, отдающий `below` по скрипту (циклится); пишет каждый запрошенный `n`. */
export interface RecordingSource extends RandomSource {
  /** Значения `n`, с которыми вызывали `below` (для проверки bias-free выборки). */
  readonly ns: number[];
}

/**
 * Источник по скрипту значений `below` (циклится, если исчерпан). Записывает все
 * запрошенные верхние границы `n` — так тест доказывает, что выбор идёт через
 * `below(n)` (rejection sampling), а не через `% n` над сырым словом.
 */
export function recording(belowValues: number[]): RecordingSource {
  const ns: number[] = [];
  let i = 0;
  return {
    ns,
    below: (n) => {
      ns.push(n);
      const v = belowValues[i % belowValues.length] ?? 0;
      i += 1;
      return v % n; // держим в диапазоне [0, n) при любом скрипте
    },
    float: () => 0.5,
  };
}
