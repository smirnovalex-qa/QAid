/**
 * «Умные» валидные тест-значения (TASK-034): номер карты (валидный Луна), IBAN
 * (валидные контрольные цифры mod-97), UUID v4 (RFC-4122).
 *
 * Чистые, на инъектируемом `RandomSource` (по умолчанию `secureRandom`). Вся
 * энтропия — через `rng.below(...)` (rejection sampling, без modulo-bias). Валидность
 * КАЖДОГО значения проверяема (см. `__tests__/smart.test.ts`): бесполезное для тестов
 * невалидное значение недопустимо (PRD §7.1).
 *
 * ЕДИНАЯ КАНОНИЧЕСКАЯ реализация `uuidV4`/`isUuidV4` для всего проекта:
 * `features/timestamp-hash` РЕЭКСПОРТИРУЕТ отсюда (feature→shared разрешён), чтобы не
 * плодить второй алгоритм (fitness-инвариант «shared не тянет features» соблюдён —
 * зависимость направлена корректно).
 */
import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import type { CardScheme, IbanCountry } from './types';
import { randomBytes } from './internal';

// ───────────────────────────── карта (Луна) ─────────────────────────────

/** Спецификация схемы карты: допустимые IIN-префиксы и полная длина. */
interface CardSpec {
  readonly prefixes: readonly string[];
  readonly length: number;
}

const CARD_SPECS: Record<CardScheme, CardSpec> = {
  visa: { prefixes: ['4'], length: 16 },
  mastercard: { prefixes: ['51', '52', '53', '54', '55'], length: 16 },
  amex: { prefixes: ['34', '37'], length: 15 },
};

/**
 * Контрольная цифра Луна для payload (всех цифр, КРОМЕ контрольной): удваиваем
 * каждую вторую цифру справа (начиная с крайней правой payload), корректируем >9,
 * контрольная = дополнение суммы до кратного 10.
 */
function luhnCheckDigit(payload: string): number {
  let sum = 0;
  let double = true; // крайняя правая payload-цифра стоит на «удваиваемой» позиции
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    let d = payload.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** Проверяет число по алгоритму Луна (сумма кратна 10). */
export function isValidLuhn(number: string): boolean {
  if (!/^\d+$/.test(number)) return false;
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let d = number.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Номер карты с валидной контрольной суммой Луна для выбранной схемы (цифры без
 * разделителей).
 *
 * @param scheme Платёжная схема (по умолчанию `visa`).
 * @param rng Источник случайности (по умолчанию `secureRandom`).
 */
export function cardNumber(scheme: CardScheme = 'visa', rng: RandomSource = secureRandom): string {
  const spec = CARD_SPECS[scheme];
  const prefix = spec.prefixes[rng.below(spec.prefixes.length)] ?? '';
  let payload = prefix;
  while (payload.length < spec.length - 1) payload += String(rng.below(10));
  return payload + String(luhnCheckDigit(payload));
}

// ───────────────────────────── IBAN (mod-97) ─────────────────────────────

/** BBAN-маска по стране: `n` — цифра, `a` — заглавная латинская буква. Длина IBAN = 4 + маска. */
const IBAN_BBAN_MASKS: Record<IbanCountry, string> = {
  DE: 'nnnnnnnnnnnnnnnnnn', // 18n → длина 22
  ES: 'nnnnnnnnnnnnnnnnnnnn', // 20n → длина 24
  FR: 'nnnnnnnnnnnnnnnnnnnnnnn', // 23n → длина 27
  GB: 'aaaannnnnnnnnnnnnn', // 4a+14n → длина 22
  NL: 'aaaannnnnnnnnn', // 4a+10n → длина 18
};

/** Переводит IBAN-строку в числовую: буквы → две цифры (A=10 … Z=35), цифры — как есть. */
function ibanToNumeric(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    out += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  return out;
}

/** Остаток по модулю 97 для длинного числа-строки (поразрядно, без BigInt). */
function mod97(numeric: string): number {
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 1) {
    remainder = (remainder * 10 + (numeric.charCodeAt(i) - 48)) % 97;
  }
  return remainder;
}

/** Проверяет IBAN по mod-97 (перестановка первых 4 символов в хвост → остаток === 1). */
export function isValidIban(iban: string): boolean {
  if (iban.length < 5) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  return mod97(ibanToNumeric(rearranged)) === 1;
}

/** Генерирует BBAN по маске (`n`/`a`) через RNG. */
function generateBban(mask: string, rng: RandomSource): string {
  let out = '';
  for (const m of mask) {
    out += m === 'a' ? String.fromCharCode(65 + rng.below(26)) : String(rng.below(10));
  }
  return out;
}

/**
 * IBAN с валидными контрольными цифрами (mod-97) для страны. BBAN — синтетический
 * (правильная длина/классы символов, не привязка к реальному банку — см. TASK-034,
 * вне scope: региональные базы).
 *
 * @param country Код страны из курируемого набора (по умолчанию `DE`).
 * @param rng Источник случайности (по умолчанию `secureRandom`).
 */
export function iban(country: IbanCountry = 'DE', rng: RandomSource = secureRandom): string {
  const bban = generateBban(IBAN_BBAN_MASKS[country], rng);
  // Контрольные: 98 − mod97( BBAN + код страны + "00" ).
  const check = 98 - mod97(ibanToNumeric(`${bban}${country}00`));
  return `${country}${String(check).padStart(2, '0')}${bban}`;
}

// ───────────────────────────── UUID v4 (RFC-4122) ─────────────────────────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UUID v4 (RFC-4122) из 16 байт `RandomSource`: nibble версии = 4, старшие биты
 * варианта = `10`. КАНОНИЧЕСКАЯ реализация проекта (реэкспортируется фичами).
 *
 * @param rng Источник случайности (по умолчанию `secureRandom`).
 */
export function uuidV4(rng: RandomSource = secureRandom): string {
  const b = randomBytes(16, rng);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // версия 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // вариант 10xx
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Проверяет соответствие строки формату UUID v4 (RFC-4122: версия + вариант). */
export function isUuidV4(s: string): boolean {
  return UUID_V4_RE.test(s);
}
