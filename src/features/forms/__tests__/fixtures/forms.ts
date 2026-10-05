/**
 * Фикстуры фичи «Формы» (TASK-020): фабрика атрибутов поля и модель формы с
 * заведомыми нарушениями аудита. Используется logic-тестами (чистая модель, без DOM).
 */
import type { FieldAttrs, FieldModel, FieldKind, FormModel } from '@/shared/inspection/forms/types';

/** Дефолтные атрибуты текстового `input` без разметки — переопределяем частично. */
export function makeAttrs(overrides: Partial<FieldAttrs> = {}): FieldAttrs {
  return {
    tagName: 'input',
    type: 'text',
    name: null,
    id: null,
    autocomplete: null,
    placeholder: null,
    labelText: null,
    required: false,
    ariaRequired: false,
    maxLength: null,
    pattern: null,
    disabled: false,
    readonly: false,
    hidden: false,
    ...overrides,
  };
}

/** Поле-модель с заданным видом/атрибутами и произвольным селектором. */
export function makeField(
  selector: string,
  kind: FieldKind,
  overrides: Partial<FieldAttrs> = {},
): FieldModel {
  return { selector, kind, attrs: makeAttrs(overrides) };
}

/**
 * Модель формы с нарушениями:
 *  - `#a` email без ярлыка И тип text вместо email (label-missing + type-mismatch);
 *  - `#dup` / `#dup2` — оба id="dup" (duplicate-id ×2), но с ярлыком и required;
 *  - `#req` «Name *» без required (required-missing), с ярлыком;
 *  - `#ok` полностью корректное текстовое поле (без проблем).
 */
export function violationModel(): FormModel {
  return {
    fields: [
      makeField('#a', 'email', { id: 'a', name: 'email', type: 'text', labelText: null }),
      makeField('#dup', 'text', { id: 'dup', labelText: 'First' }),
      makeField('#dup2', 'text', { id: 'dup', labelText: 'Second' }),
      makeField('#req', 'name', {
        id: 'req',
        labelText: 'Name *',
        placeholder: 'Name *',
        required: false,
      }),
      makeField('#ok', 'text', { id: 'ok', labelText: 'Nickname' }),
    ],
    forms: [{ selector: 'form', fieldCount: 5 }],
  };
}
