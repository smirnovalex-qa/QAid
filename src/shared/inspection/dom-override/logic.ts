/**
 * Чистая логика фичи «Мок: DOM-подмена выделением» (TASK-023, часть `dom-override`).
 *
 * БЕЗ DOM и `chrome.*`: модель косметической операции (zod-free типы в `types.ts`),
 * планировщик «операция → упорядоченный список записей в поля узла» (`planApply`),
 * планировщик отката по снятому снимку прежних значений (`planUndo`), генератор
 * длинного плейсхолдера, валидатор операции и чистые операции над списком подмен
 * (upsert/remove/toggle по селектору — защищают инвариант «одна подмена на селектор»).
 *
 * Ключевая идея разделения: ЧТО менять и КАК откатить — считается здесь, чисто и
 * тестируемо; ЧТЕНИЕ/ЗАПИСЬ реального DOM и снятие снимка — в `applier.ts`. Это
 * почти-на-100% покрытый модуль фичи (канон «core ~100%»).
 */
import type { DomOverrideEntry, DomOverrideOp } from './types';

/**
 * Адресуемое поле узла, значение которого читается/пишется как `string | null`.
 * `null` при записи означает «очистить/удалить» (снять атрибут, убрать инлайн-стиль,
 * обнулить текст) — так один и тот же формат описывает и применение, и откат.
 */
export type DomField =
  | { readonly kind: 'text' }
  | { readonly kind: 'attr'; readonly name: string }
  | { readonly kind: 'style'; readonly prop: string };

/** Одна запись в поле узла: куда и что писать (`null` — очистить/удалить). */
export interface DomWrite {
  readonly field: DomField;
  readonly value: string | null;
}

/** Единица-заготовка плейсхолдера по умолчанию (если пользователь не задал свою). */
export const DEFAULT_PLACEHOLDER_UNIT = 'Lorem ipsum dolor sit amet';

/** Верхняя граница повторов плейсхолдера — защита от гигантских строк. */
export const MAX_PLACEHOLDER_REPEAT = 500;

/** Приводит число повторов к целому из диапазона `[1, MAX_PLACEHOLDER_REPEAT]`. */
export function clampRepeat(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const int = Math.floor(n);
  if (int < 1) return 1;
  return Math.min(int, MAX_PLACEHOLDER_REPEAT);
}

/**
 * Строит длинный плейсхолдер повтором единицы-заготовки через пробел. Пустая
 * заготовка заменяется дефолтной; число повторов клампится (см. `clampRepeat`).
 */
export function buildPlaceholder(unit: string, repeat: number): string {
  const seed = unit.trim() === '' ? DEFAULT_PLACEHOLDER_UNIT : unit;
  const count = clampRepeat(repeat);
  return Array.from({ length: count }, () => seed).join(' ');
}

/**
 * Планирует применение операции — чистый список записей в поля узла (без DOM).
 * `hide` — инлайн `display: none`; `inject-content` кладёт длинный текст в `text`
 * (никогда в разметку, косметика строго текстовая).
 */
export function planApply(op: DomOverrideOp): readonly DomWrite[] {
  switch (op.kind) {
    case 'replace-text':
      return [{ field: { kind: 'text' }, value: op.text }];
    case 'set-attribute':
      return [{ field: { kind: 'attr', name: op.name }, value: op.value }];
    case 'remove-attribute':
      return [{ field: { kind: 'attr', name: op.name }, value: null }];
    case 'hide':
      return [{ field: { kind: 'style', prop: 'display' }, value: 'none' }];
    case 'inject-content':
      return [{ field: { kind: 'text' }, value: buildPlaceholder(op.text, op.repeat) }];
  }
}

/**
 * Планирует откат: по тем же полям, что и применение, восстанавливает прежние
 * значения из снятого снимка (`previous[i]` — прежнее значение поля `writes[i]`).
 * Отсутствующий снимок трактуется как «поле было пустым/без атрибута» → очистка.
 * Порядок сохраняется (вызывающий откатывает в обратном порядке применения).
 */
export function planUndo(
  writes: readonly DomWrite[],
  previous: readonly (string | null)[],
): readonly DomWrite[] {
  return writes.map((w, i) => ({ field: w.field, value: previous[i] ?? null }));
}

/** Итог валидации операции: список кодов ошибок (пуст → валидно). */
export interface OpValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Консервативная проверка имени HTML-атрибута (буква/`_`/`:` в начале). */
function isValidAttrName(name: string): boolean {
  return /^[A-Za-z_:][-A-Za-z0-9_:.]*$/.test(name);
}

/**
 * Валидирует атрибуты операции перед применением. Возвращает коды ошибок для
 * локализации в UI. `replace-text`/`hide` валидны всегда (пустой текст допустим).
 */
export function validateOp(op: DomOverrideOp): OpValidation {
  const errors: string[] = [];
  if (op.kind === 'set-attribute' || op.kind === 'remove-attribute') {
    if (op.name.trim() === '') errors.push('attr-name-empty');
    else if (!isValidAttrName(op.name)) errors.push('attr-name-invalid');
  } else if (op.kind === 'inject-content') {
    if (!Number.isInteger(op.repeat) || op.repeat <= 0) errors.push('repeat-invalid');
  }
  return { valid: errors.length === 0, errors };
}

// ── Чистые операции над списком подмен (адресация по селектору) ────────────────

/** Находит подмену по селектору (или `undefined`). */
export function findOverride(
  list: readonly DomOverrideEntry[],
  selector: string,
): DomOverrideEntry | undefined {
  return list.find((e) => e.selector === selector);
}

/**
 * Вставляет или заменяет подмену по селектору — инвариант «одна активная подмена на
 * селектор». Новый селектор дописывается в конец; существующий перезаписывается на
 * месте (порядок строк стабилен). Возвращает новый список (вход не мутируется).
 */
export function upsertOverride(
  list: readonly DomOverrideEntry[],
  entry: DomOverrideEntry,
): DomOverrideEntry[] {
  const idx = list.findIndex((e) => e.selector === entry.selector);
  if (idx === -1) return [...list, entry];
  const next = list.slice();
  next[idx] = entry;
  return next;
}

/** Удаляет подмену по селектору. Возвращает новый список. */
export function removeOverride(
  list: readonly DomOverrideEntry[],
  selector: string,
): DomOverrideEntry[] {
  return list.filter((e) => e.selector !== selector);
}

/** Переключает флаг активности подмены по селектору. Возвращает новый список. */
export function setOverrideEnabled(
  list: readonly DomOverrideEntry[],
  selector: string,
  enabled: boolean,
): DomOverrideEntry[] {
  return list.map((e) => (e.selector === selector ? { ...e, enabled } : e));
}

/** Отбирает активные подмены (для отправки в content-хост). */
export function activeOverrides(list: readonly DomOverrideEntry[]): DomOverrideEntry[] {
  return list.filter((e) => e.enabled);
}
