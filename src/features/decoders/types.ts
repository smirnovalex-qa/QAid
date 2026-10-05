/**
 * Общие типы фичи «Декодеры» (JWT · Base64 · URL · JSON).
 *
 * Вынесены отдельно, чтобы чистая логика (`logic.ts`), слой настроек и UI
 * зависели от единого контракта, а не друг от друга.
 */

/** Активная под-вкладка декодеров. */
export type DecoderTab = 'jwt' | 'base64' | 'url' | 'json';

/** Персистентное состояние фичи (через слой настроек TASK-005). */
export interface DecodersState {
  readonly activeTab: DecoderTab;
}

export const DECODERS_DEFAULTS: DecodersState = { activeTab: 'jwt' };

/** Максимальный размер входа (5 MiB); превышение → ошибка `too-large`. */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Дискриминируемый результат декодирования — успех. */
export interface DecodeOk<T> {
  readonly ok: true;
  readonly value: T;
}

/** Дискриминируемый результат декодирования — ошибка. */
export interface DecodeErr {
  readonly ok: false;
  readonly error: DecodeError;
}

export type DecodeResult<T> = DecodeOk<T> | DecodeErr;

/** Разновидности ошибок декодирования. */
export type DecodeErrorKind =
  | 'invalid-base64'
  | 'invalid-utf8'
  | 'malformed-jwt'
  | 'invalid-json'
  | 'invalid-url-escape'
  | 'empty-input'
  | 'too-large';

/** Позиция в тексте: `offset` 0-based, `line`/`column` 1-based. */
export interface TextPosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface DecodeError {
  readonly kind: DecodeErrorKind;
  /** Человекочитаемое сообщение (нейтральный английский; UI локализует через messageKey). */
  readonly message: string;
  /** Ключ i18n, напр. 'dec.err.invalid_base64'. */
  readonly messageKey: string;
  readonly position?: TextPosition;
}

// — Base64 —
export type Base64Variant = 'standard' | 'url-safe';
export interface Base64Options {
  readonly variant: Base64Variant;
  readonly padding: boolean;
}

// — URL —
export type UrlMode = 'component' | 'full';

// — JSON —
export interface JsonFormatOptions {
  /** Отступ; 0 => минификация. */
  readonly indent: number;
}

// — JWT —
export interface JwtTimeClaim {
  readonly epochSeconds: number;
  readonly iso: string;
  readonly localeString: string;
}

export interface JwtClaimsView {
  readonly exp?: JwtTimeClaim;
  readonly iat?: JwtTimeClaim;
  readonly nbf?: JwtTimeClaim;
  readonly expired: boolean;
  readonly notYetValid: boolean;
}

export interface JwtDecoded {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly signaturePresent: boolean;
  readonly signatureRaw: string;
  readonly claims: JwtClaimsView;
  readonly raw: { readonly header: string; readonly payload: string; readonly signature: string };
}
