/**
 * Кодек значений хранилища: валидация на границе чтения/записи через zod.
 */

import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Схема, чей ВЫХОД — `T`, а вход произвольный. Схемы с `.default()` имеют вход,
 * отличный от выхода (поля необязательны), поэтому `ZodType<T>` (вход = `T`) их
 * не принимает — используем вход `unknown`.
 */
export type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

/** Результат декодирования сырого значения из хранилища. */
export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: 'missing' | 'json' | 'schema';
      readonly error?: unknown;
    };

/**
 * Декодирует и валидирует сырое значение из хранилища. Никогда не бросает.
 *
 * `undefined`/`null` → `missing`. Строка парсится как JSON (поддержка значений,
 * сохранённых строкой): ошибка парсинга → `json`. Иначе значение проверяется
 * схемой: несовпадение → `schema`.
 *
 * @param raw Сырое значение из `chrome.storage.local`.
 * @param schema Zod-схема ожидаемого типа.
 * @returns Результат: `ok` со значением либо причина ошибки.
 */
export function decode<T>(raw: unknown, schema: Schema<T>): DecodeResult<T> {
  if (raw === undefined || raw === null) {
    return { ok: false, reason: 'missing' };
  }

  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch (error) {
      return { ok: false, reason: 'json', error };
    }
  }

  // safeParse не бросает на несовпадении схемы, но может пробросить исключение
  // из «злого» геттера входного значения — страхуемся, чтобы decode был тотальным.
  try {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      return { ok: true, value: parsed.data };
    }
    return { ok: false, reason: 'schema', error: parsed.error };
  } catch (error) {
    return { ok: false, reason: 'schema', error };
  }
}

/**
 * Валидирует значение перед записью и возвращает разобранное значение.
 *
 * `chrome.storage.local` хранит СТРУКТУРНЫЕ значения, поэтому мы НЕ сериализуем
 * в JSON: `encode` возвращает провалидированное значение типа `T`, а не строку.
 * Бросает, только если значение нарушает схему — это сломанный инвариант кода
 * до записи.
 *
 * @param value Значение для записи.
 * @param schema Zod-схема ожидаемого типа.
 * @returns Провалидированное значение типа `T`.
 * @throws {import('zod').ZodError} Если значение не проходит схему.
 */
export function encode<T>(value: T, schema: Schema<T>): T {
  return schema.parse(value);
}
