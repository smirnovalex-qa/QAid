/**
 * Композируемые валидаторы полей + сборка ARIA-атрибутов для доступности.
 *
 * Чистый модуль: валидатор — функция `value → FieldError | null`. `compose`
 * собирает ВСЕ ошибки в стабильном порядке (не «первая-и-выход»), чтобы UI мог
 * показать полную картину. `fieldA11y` строит связку `aria-invalid` /
 * `aria-describedby` в стиле компонента `Field`.
 */

export interface FieldError {
  readonly code: string;
  readonly message?: string;
}

export type Validator<T> = (value: T) => FieldError | null;

/** Собирает FieldError, добавляя `message` только когда он передан (exactOptionalPropertyTypes). */
function err(code: string, msg?: string): FieldError {
  return msg === undefined ? { code } : { code, message: msg };
}

/** Непустое значение: `null` / `undefined` / `''` → ошибка `required`. */
export function required<T>(msg?: string): Validator<T> {
  return (value) => {
    if (value === null || value === undefined || (value as unknown) === '') {
      return err('required', msg);
    }
    return null;
  };
}

/** Конечное число (не NaN / ±Infinity) → иначе `not_finite`. */
export function isFiniteNumber(msg?: string): Validator<number> {
  return (value) => (Number.isFinite(value) ? null : err('not_finite', msg));
}

/** Целое число → иначе `not_integer`. */
export function isInteger(msg?: string): Validator<number> {
  return (value) => (Number.isInteger(value) ? null : err('not_integer', msg));
}

/** Число в диапазоне [min, max] включительно → иначе `out_of_range`. */
export function inRange(min: number, max: number, msg?: string): Validator<number> {
  return (value) => (value >= min && value <= max ? null : err('out_of_range', msg));
}

/** Длина строки не меньше `n` → иначе `too_short`. */
export function minLen(n: number, msg?: string): Validator<string> {
  return (value) => (value.length >= n ? null : err('too_short', msg));
}

/** Длина строки не больше `n` → иначе `too_long`. */
export function maxLen(n: number, msg?: string): Validator<string> {
  return (value) => (value.length <= n ? null : err('too_long', msg));
}

/** Применяет валидаторы по очереди, возвращая ВСЕ ошибки в порядке объявления. */
export function compose<T>(...vs: Validator<T>[]): (value: T) => FieldError[] {
  return (value) => {
    const out: FieldError[] = [];
    for (const v of vs) {
      const e = v(value);
      if (e !== null) out.push(e);
    }
    return out;
  };
}

/**
 * Строит ARIA-атрибуты для контрола и регион ошибок.
 *
 * При наличии ошибок: `aria-invalid: true` и `aria-describedby: '<id>-error'`.
 * Без ошибок: `aria-invalid: false`, свойство `aria-describedby` опускается.
 */
export function fieldA11y(
  id: string,
  errors: readonly FieldError[],
): {
  input: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string };
  errorRegion: { id: string; role: 'alert' };
} {
  const errorId = `${id}-error`;
  const hasErrors = errors.length > 0;

  const input: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string } = {
    id,
    'aria-invalid': hasErrors,
  };
  if (hasErrors) {
    input['aria-describedby'] = errorId;
  }

  return {
    input,
    errorRegion: { id: errorId, role: 'alert' },
  };
}
