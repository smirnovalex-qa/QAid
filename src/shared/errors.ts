/**
 * Сериализуемые ошибки для передачи через границы сред.
 *
 * `Error`-инстансы теряют прототип/стек при structured clone, поэтому наружу
 * (в сообщениях, в `Result`) ходит только plain-объект `AppError`.
 */

export type AppErrorCode =
  | 'VALIDATION'
  | 'NO_RECEIVER'
  | 'TIMEOUT'
  | 'INTERNAL'
  | 'PERMISSION_DENIED'
  | 'PRIVILEGED_PAGE'
  | 'INJECTION_FAILED';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
  /**
   * i18n-ключ для локализованного объяснения в UI. Технический `message`
   * остаётся для логов/разработчика; `messageKey` (при наличии) — то, что
   * показывает поверхность пользователю (напр. отказ в правах, привилегированная
   * страница). Опционален: у большинства ошибок его нет.
   */
  messageKey?: string;
}

/**
 * Конструктор `AppError`. Опциональные поля (`details`, `messageKey`) не
 * проставляются, если не переданы (инвариант `exactOptionalPropertyTypes`).
 */
export function appError(
  code: AppErrorCode,
  message: string,
  details?: unknown,
  messageKey?: string,
): AppError {
  const error: AppError = { code, message };
  if (details !== undefined) error.details = details;
  if (messageKey !== undefined) error.messageKey = messageKey;
  return error;
}

/**
 * Исключение-носитель `AppError`. Хендлеры сообщений (§8) обычно возвращают
 * ответ, но иногда должны провалиться типизированной ошибкой (отказ в правах,
 * привилегированная страница) — не безликим `INTERNAL`. Бросив `AppErrorException`,
 * хендлер доносит точный `AppError` до конверта ошибки (роутер разворачивает его
 * вместо `appError('INTERNAL', String(e))`).
 */
export class AppErrorException extends Error {
  readonly appError: AppError;

  constructor(error: AppError) {
    super(error.message);
    this.name = 'AppErrorException';
    this.appError = error;
  }
}

/** Извлекает `AppError` из брошенного значения (носитель — либо обычный `INTERNAL`). */
export function toAppError(thrown: unknown): AppError {
  if (thrown instanceof AppErrorException) return thrown.appError;
  return appError('INTERNAL', thrown instanceof Error ? thrown.message : String(thrown));
}
