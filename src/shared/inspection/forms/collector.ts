/**
 * DOM-сборщик форм (TASK-020). Чистый модуль без саморегистрации и без импортов из
 * `@/content/**`: экспортирует id и `collectForms`, которую content-хост (TASK-013)
 * регистрирует через `registerInspector` — проводку делает оркестратор. Стиль — как
 * `contrast/collector.ts`.
 *
 * Снимает сериализуемую модель форм/полей (устойчивый селектор + атрибуты +
 * ВЫЧИСЛЕННЫЙ доступный ярлык/скрытость). DOM-узлы наружу не отдаём. Хелперы
 * `collectFormControls`/`readFieldModel` переиспользует content-заполнитель
 * (`filler.ts`), чтобы извлечение атрибутов и классификация не дублировались.
 */
import { classifyField } from './logic';
import type { FieldAttrs, FieldModel, FormInfo, FormModel } from './types';

/** Публичный id сборщика — под ним хост регистрирует его в реестре инспекторов. */
export const FORMS_INSPECTOR_ID = 'forms';

/** Бюджет контролов (форм на странице обычно немного; защита от патологий). */
const CONTROL_BUDGET = 2000;

/** Типы `input`, которые не заполняем и не аудируем как поля ввода. */
const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const defaultGetStyle = (el: Element): CSSStyleDeclaration => getComputedStyle(el);

/** Экранирует значение для использования в CSS-селекторе (fallback без `CSS.escape`). */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Строит по возможности уникальный CSS-путь к элементу: до ближайшего `id` (стоп) или
 * до `<body>`, добавляя `:nth-of-type` при неоднозначности тега среди сиблингов.
 */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node !== null && node.nodeType === 1 && node.tagName.toLowerCase() !== 'html') {
    const id = node.getAttribute('id');
    if (id !== null && id !== '') {
      parts.unshift(`#${cssEscape(id)}`);
      break;
    }
    let sel = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (parent !== null) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node?.tagName);
      if (sameTag.length > 1) {
        sel += `:nth-of-type(${String(sameTag.indexOf(node) + 1)})`;
      }
    }
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** Собирает текст элементов по списку id (для `aria-labelledby`). */
function textFromIds(ids: string, doc: Document): string {
  return ids
    .split(/\s+/)
    .map((id) => (id !== '' ? (doc.getElementById(id)?.textContent ?? '') : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Вычисляет доступный ярлык контрола: `aria-label` → `aria-labelledby` → связанный
 * `<label for>`/оборачивающий `<label>`. `placeholder` ярлыком НЕ считается.
 */
function accessibleLabel(el: FormControl): string | null {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel !== null && ariaLabel.trim() !== '') return ariaLabel.trim();

  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby !== null && labelledby.trim() !== '') {
    const text = textFromIds(labelledby, el.ownerDocument);
    if (text !== '') return text;
  }

  const id = el.getAttribute('id');
  if (id !== null && id !== '') {
    const forLabel = el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`);
    const text = forLabel?.textContent?.replace(/\s+/g, ' ').trim();
    if (text !== undefined && text !== '') return text;
  }

  const wrapping = el.closest('label');
  if (wrapping !== null) {
    const text = wrapping.textContent?.replace(/\s+/g, ' ').trim();
    if (text !== undefined && text !== '') return text;
  }

  return null;
}

/** Скрыт ли контрол по вычисленным стилям/атрибуту (type=hidden отфильтрован раньше). */
function isHidden(el: FormControl, getStyle: (el: Element) => CSSStyleDeclaration): boolean {
  if (el.hidden) return true;
  const style = getStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** Плоский снимок атрибутов контрола. */
function readAttrs(el: FormControl, getStyle: (el: Element) => CSSStyleDeclaration): FieldAttrs {
  const tagName = el.tagName.toLowerCase() as 'input' | 'textarea' | 'select';
  const type = tagName === 'input' ? (el.getAttribute('type') ?? 'text').toLowerCase() : null;
  const maxAttr = el.getAttribute('maxlength');
  const maxLength = maxAttr !== null && /^\d+$/.test(maxAttr) ? Number.parseInt(maxAttr, 10) : null;
  const readonly =
    tagName === 'select' ? false : (el as HTMLInputElement | HTMLTextAreaElement).readOnly;

  return {
    tagName,
    type,
    name: el.getAttribute('name'),
    id: el.getAttribute('id'),
    autocomplete: el.getAttribute('autocomplete'),
    placeholder: el.getAttribute('placeholder'),
    labelText: accessibleLabel(el),
    required: el.hasAttribute('required'),
    ariaRequired: el.getAttribute('aria-required') === 'true',
    maxLength,
    pattern: el.getAttribute('pattern'),
    disabled: el.hasAttribute('disabled'),
    readonly,
    hidden: isHidden(el, getStyle),
  };
}

/**
 * Возвращает заполняемые/аудируемые контролы под `root` (в порядке DOM, в пределах
 * бюджета). Отфильтрованы служебные `input` (hidden/submit/button/reset/image/file).
 */
export function collectFormControls(root: Element): FormControl[] {
  const all = root.querySelectorAll('input, select, textarea');
  const out: FormControl[] = [];
  for (const el of Array.from(all)) {
    if (out.length >= CONTROL_BUDGET) break;
    const control = el as FormControl;
    if (control.tagName.toLowerCase() === 'input') {
      const type = (control.getAttribute('type') ?? 'text').toLowerCase();
      if (SKIP_INPUT_TYPES.has(type)) continue;
    }
    out.push(control);
  }
  return out;
}

/** Строит модель одного поля: селектор + атрибуты + вычисленный вид. */
export function readFieldModel(
  el: FormControl,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): FieldModel {
  const attrs = readAttrs(el, getStyle);
  return { selector: cssPath(el), kind: classifyField(attrs), attrs };
}

/**
 * Собирает сериализуемую модель форм в пределах `root`. Второй аргумент — инъекция
 * источника стилей для тестируемости (по умолчанию глобальный `getComputedStyle`).
 */
export function collectForms(
  root: Element,
  getStyle: (el: Element) => CSSStyleDeclaration = defaultGetStyle,
): FormModel {
  const fields = collectFormControls(root).map((el) => readFieldModel(el, getStyle));

  const forms: FormInfo[] = Array.from(root.querySelectorAll('form')).map((form) => ({
    selector: cssPath(form),
    fieldCount: collectFormControls(form).length,
  }));

  return { fields, forms };
}
