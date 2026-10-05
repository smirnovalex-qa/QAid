/**
 * Генераторы личных тест-данных (TASK-034): email, ФИО, адрес.
 *
 * Чистые (без DOM/chrome), на инъектируемом `RandomSource` (по умолчанию
 * криптостойкий `secureRandom` — детерминизм при инъекции в тестах). Локальные
 * данные — курируемые таблицы в `data/`; алгоритм не зависит от набора локалей.
 */
import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import type { Locale } from './types';
import { FIRST_NAMES, LAST_NAMES } from './data/names';
import { CITIES, STREETS } from './data/addresses';
import { EMAIL_DOMAINS, EMAIL_LOCAL_WORDS } from './data/email';
import { intInRange, pick } from './internal';

/** Случайное имя для локали. */
export function firstName(locale: Locale = 'en', rng: RandomSource = secureRandom): string {
  return pick(FIRST_NAMES[locale], rng);
}

/** Случайная фамилия для локали. */
export function lastName(locale: Locale = 'en', rng: RandomSource = secureRandom): string {
  return pick(LAST_NAMES[locale], rng);
}

/** Полное имя `Имя Фамилия` для локали. */
export function fullName(locale: Locale = 'en', rng: RandomSource = secureRandom): string {
  return `${firstName(locale, rng)} ${lastName(locale, rng)}`;
}

/**
 * Валидный тест-email вида `<слово><цифры>@<домен>`. Локальная часть без пробелов
 * и `@`; домен из курируемого набора уже содержит TLD — результат всегда проходит
 * базовую проверку `local@domain.tld`.
 */
export function email(rng: RandomSource = secureRandom): string {
  const local = `${pick(EMAIL_LOCAL_WORDS, rng)}${String(intInRange(100, 99999, rng))}`;
  return `${local}@${pick(EMAIL_DOMAINS, rng)}`;
}

/**
 * Правдоподобный адрес для локали (курируемый минимум, не геоточность).
 *  - `en`: `123 Oak St, Springfield`
 *  - `ru`: `г. Москва, ул. Ленина, д. 12`
 */
export function address(locale: Locale = 'en', rng: RandomSource = secureRandom): string {
  const street = pick(STREETS[locale], rng);
  const city = pick(CITIES[locale], rng);
  if (locale === 'ru') {
    return `г. ${city}, ул. ${street}, д. ${String(intInRange(1, 200, rng))}`;
  }
  return `${String(intInRange(1, 9999, rng))} ${street} St, ${city}`;
}
