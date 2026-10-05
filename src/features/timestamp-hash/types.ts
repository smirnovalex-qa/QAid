/**
 * Общие типы фичи «Таймстемпы и хеши» — единый контракт для чистой логики,
 * слоя настроек и UI (они зависят от контракта, а не друг от друга).
 */

/** Успешный результат. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Ошибочный результат с машинным `kind` и ключом локализации. */
export interface Err {
  readonly ok: false;
  readonly error: {
    /** Машинный код ошибки (стабильный, для ветвления). */
    readonly kind: string;
    /** Человекочитаемое сообщение (fallback EN). */
    readonly message: string;
    /** Ключ каталога i18n для перевода в UI. */
    readonly messageKey: string;
  };
}

/** Дискриминированный результат: без бросков на «плохой» вход. */
export type Result<T> = Ok<T> | Err;

// — Таймстемпы —

/** Единица unix-времени во входной строке. */
export type UnixUnit = 'seconds' | 'milliseconds';

/** Представление момента времени в конкретной зоне (DST-корректное). */
export interface TimestampView {
  /** Эпоха в миллисекундах. */
  epochMs: number;
  /** Эпоха в секундах (усечённая вниз). */
  epochSeconds: number;
  /** ISO-8601 в UTC с суффиксом `Z`. */
  iso: string;
  /** Отформатированное «стенное» время в выбранной зоне (`YYYY-MM-DD HH:MM:SS`). */
  inZone: string;
  /** IANA-идентификатор зоны или `UTC`. */
  zone: string;
  /** Смещение зоны ДЛЯ ЭТОГО момента в минутах (учитывает DST). */
  offsetMinutes: number;
}

/** Разложенная разница двух моментов. */
export interface DateDiff {
  /** Знаковая разница `b - a` в миллисекундах. */
  ms: number;
  /** Модуль разницы в миллисекундах. */
  absMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Нейтральная строка вида `"2d 3h 4m 5s"` (UI релокализует по компонентам). */
  humanized: string;
}

// — Хеши —

/** Алгоритмы, поддержанные Web Crypto (`crypto.subtle.digest`). */
export type ShaAlgo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/** Полный набор алгоритмов UI (включая legacy MD5, которого нет в Web Crypto). */
export type HashAlgo = ShaAlgo | 'MD5';

/** Кодировка вывода хеша. */
export type HashEncoding = 'hex' | 'base64';

/** Результат хеширования: и hex, и base64 от одних и тех же байтов. */
export interface HashResult {
  algo: ShaAlgo;
  hex: string;
  base64: string;
}

// — Настройки (персист активной под-вкладки и предпочтений) —

/** Активная под-вкладка панели. */
export type TsHashTab = 'timestamp' | 'hash';

/** Персистимое состояние фичи. */
export interface TsHashState {
  readonly activeTab: TsHashTab;
  readonly unit: UnixUnit;
  readonly algo: HashAlgo;
  readonly encoding: HashEncoding;
  readonly zone: string;
}

/** Значения по умолчанию. */
export const TS_HASH_DEFAULTS: TsHashState = {
  activeTab: 'timestamp',
  unit: 'seconds',
  algo: 'SHA-256',
  encoding: 'hex',
  zone: 'UTC',
};

/** Верхняя граница диапазона `Date` в миллисекундах (±100 млн дней). */
export const MAX_EPOCH_MS = 8.64e15;

/** Максимальный размер пачки UUID. */
export const MAX_UUID_BATCH = 1000;
