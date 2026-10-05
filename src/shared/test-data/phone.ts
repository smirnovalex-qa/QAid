/**
 * Генератор телефонных номеров в формате страны (TASK-034).
 *
 * Формат берётся из курируемой таблицы `PHONE_FORMATS`: `#` → случайная цифра
 * (через `rng.below(10)`, без modulo-bias), прочие символы (код, скобки, дефисы,
 * пробелы) переносятся дословно. Добавление страны — правка таблицы, не алгоритма.
 */
import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import type { PhoneCountry } from './types';
import { PHONE_FORMATS } from './data/phone-formats';

/**
 * Телефон в формате указанной страны (по умолчанию `US`).
 *
 * @param country Код страны из курируемого набора.
 * @param rng Источник случайности (по умолчанию `secureRandom`).
 * @returns Строка номера, где каждый `#` заменён случайной цифрой.
 */
export function phone(country: PhoneCountry = 'US', rng: RandomSource = secureRandom): string {
  const format = PHONE_FORMATS[country];
  let out = '';
  for (const ch of format) {
    out += ch === '#' ? String(rng.below(10)) : ch;
  }
  return out;
}
