/**
 * Content-заполнитель форм (TASK-020). Живёт в shared-слое инспекции (как collector),
 * НЕ в `features/`, и `chrome.*` не трогает — обмен только через шину
 * (`registerHandler`). Регистрируется в content-хосте оркестратором
 * (`installFormsContentHost()`), роутер поднимает инспекционный хост (TASK-013).
 *
 * Ключевая тонкость — события фреймворков: прямое `el.value = x` не триггерит
 * React/Vue `onChange`. Значение ставим НАТИВНЫМ сеттером прототипа
 * (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`) и
 * диспатчим `input`/`change`/`blur` — тогда контролируемый компонент обновляет
 * состояние. `select`/`checkbox`/`radio` обрабатываются отдельно. Пропускаем
 * `disabled`/`readonly`/скрытые. Автосабмит НЕ выполняем.
 *
 * Импорт `./messages` (side-effect) регистрирует zod-контракты `forms/*` в реестре
 * content-реалма — иначе роутер не провалидирует входящий запрос.
 */
import './messages';
import { registerHandler } from '@/shared/messaging/bus';
import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import type { RequestOf } from '@/shared/messaging/contract';
import { generateValue, seededRandom } from './logic';
import { collectFormControls, readFieldModel } from './collector';

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Ставит значение через нативный value-сеттер прототипа (для React/Vue-контролов). */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

/** Ставит `checked` через нативный сеттер (аналогично `value`). */
function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  if (desc?.set) desc.set.call(el, checked);
  else el.checked = checked;
}

/** Диспатчит события, которые слушают фреймворки при вводе. */
function fireInputEvents(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

/** Заполняемо ли поле: не disabled, не readonly, не скрыто. */
function isFillable(el: FormControl): boolean {
  const model = readFieldModel(el);
  return !model.attrs.disabled && !model.attrs.readonly && !model.attrs.hidden;
}

/** Выбирает непустой `<option>` селекта через RNG (или первый, если пустых нет). */
function pickOption(select: HTMLSelectElement, rng: RandomSource): string | null {
  const options = Array.from(select.options).filter((o) => !o.disabled && o.value !== '');
  if (options.length === 0) return null;
  const chosen = options[rng.below(options.length)];
  return chosen?.value ?? null;
}

/** Заполняет один контрол сгенерированным по профилю значением. Возвращает `true`, если тронул. */
function fillControl(
  el: FormControl,
  profile: RequestOf<'forms/fill'>['profile'],
  rng: RandomSource,
): boolean {
  const model = readFieldModel(el);
  const { kind, attrs } = model;

  if (el instanceof HTMLSelectElement) {
    if (profile === 'empty') {
      setNativeValueOnSelect(el, '');
      fireInputEvents(el);
      return true;
    }
    const value = pickOption(el, rng);
    if (value === null) return false;
    setNativeValueOnSelect(el, value);
    fireInputEvents(el);
    return true;
  }

  if (el instanceof HTMLInputElement && (kind === 'checkbox' || kind === 'radio')) {
    const checked = generateValue(kind, profile, rng) === true;
    setNativeChecked(el, checked);
    fireInputEvents(el);
    return true;
  }

  const generated = generateValue(kind, profile, rng, {
    maxLength: attrs.maxLength,
    pattern: attrs.pattern,
  });
  const value = typeof generated === 'string' ? generated : '';
  setNativeValue(el, value);
  fireInputEvents(el);
  return true;
}

/** Устанавливает значение `<select>` через нативный сеттер. */
function setNativeValueOnSelect(el: HTMLSelectElement, value: string): void {
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

/** Заполняет поля страницы тест-данными выбранного профиля. */
function fill(req: RequestOf<'forms/fill'>): Promise<{ filled: number }> {
  const rng = req.seed !== undefined ? seededRandom(req.seed) : secureRandom;
  let filled = 0;
  for (const el of collectFormControls(document.body)) {
    if (!isFillable(el)) continue;
    if (fillControl(el, req.profile, rng)) filled += 1;
  }
  return Promise.resolve({ filled });
}

/** Очищает заполняемые поля (значения + события). */
function clear(): Promise<{ cleared: number }> {
  let cleared = 0;
  for (const el of collectFormControls(document.body)) {
    if (!isFillable(el)) continue;
    if (el instanceof HTMLSelectElement) {
      setNativeValueOnSelect(el, '');
    } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      setNativeChecked(el, false);
    } else {
      setNativeValue(el, '');
    }
    fireInputEvents(el);
    cleared += 1;
  }
  return Promise.resolve({ cleared });
}

/** Хендлеры — экспортируются для прямого юнит-тестирования (без полного runtime). */
export const formsHandlers = { fill, clear };

/** Идемпотентность: шина не умеет разрегистрировать хендлеры — защита от повтора. */
let installed = false;

/**
 * Поднимает content-хост «Форм»: регистрирует хендлеры `forms/fill`/`forms/clear` в
 * шине. Роутер и teardown обеспечивает инспекционный хост (`installInspectionHost`),
 * с которым этот модуль проводится оркестратором в одном content-бандле.
 */
export function installFormsContentHost(): void {
  if (installed) return;
  installed = true;
  registerHandler('forms/fill', fill);
  registerHandler('forms/clear', clear);
}
