/**
 * `Result<T, E>` — явная обработка ошибок без исключений через границы сред.
 * Ошибка по умолчанию — сериализуемый `AppError` (см. [errors.ts]).
 */
import type { AppError } from './errors';

export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E = AppError> {
  ok: false;
  error: E;
}
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E = AppError>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;
