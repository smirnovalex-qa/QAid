/**
 * Общие типы фичи «Мок: DOM-подмена выделением» (TASK-023, часть `dom-override`).
 *
 * Живут в `shared/inspection/dom-override` (а НЕ в `features/`), т.к. content-хост
 * применения (`applier.ts`) попадает в инъектируемый content-бандл, которому
 * запрещено импортировать фичи (fitness §12.1, как storage/forms/defects). Все
 * структуры JSON-сериализуемы — DOM-узлы через границу сред не ходят, только
 * стабильный CSS-селектор + сериализуемое описание косметической операции.
 *
 * Строго косметика: операции меняют только текст, атрибут или инлайн-`display`
 * ВЫБРАННОГО элемента. Никакого HTML-инъекта и `innerHTML` — «длинный контент»
 * кладётся как `textContent`, поэтому подмена не может внести разметку/скрипт.
 */

/** Тип косметической операции над выбранным узлом. */
export type DomOverrideOpKind =
  'replace-text' | 'set-attribute' | 'remove-attribute' | 'hide' | 'inject-content';

/** Все типы операций (для селекта в UI и обхода в тестах). */
export const DOM_OVERRIDE_OP_KINDS: readonly DomOverrideOpKind[] = [
  'replace-text',
  'set-attribute',
  'remove-attribute',
  'hide',
  'inject-content',
];

/** Заменить видимый текст узла (`textContent`) на заданный. */
export interface ReplaceTextOp {
  readonly kind: 'replace-text';
  readonly text: string;
}

/** Установить/перезаписать атрибут узла. */
export interface SetAttributeOp {
  readonly kind: 'set-attribute';
  readonly name: string;
  readonly value: string;
}

/** Удалить атрибут узла. */
export interface RemoveAttributeOp {
  readonly kind: 'remove-attribute';
  readonly name: string;
}

/** Скрыть узел (инлайн `display: none`). */
export interface HideOp {
  readonly kind: 'hide';
}

/**
 * Вставить длинный плейсхолдер-текст (проверка вёрстки на переполнение/пустые
 * состояния). `text` — единица-заготовка, `repeat` — сколько раз повторить; результат
 * кладётся в `textContent` (никогда не в разметку).
 */
export interface InjectContentOp {
  readonly kind: 'inject-content';
  readonly text: string;
  readonly repeat: number;
}

/** Сериализуемое описание одной косметической операции. */
export type DomOverrideOp =
  ReplaceTextOp | SetAttributeOp | RemoveAttributeOp | HideOp | InjectContentOp;

/**
 * Запись подмены: стабильный селектор + операция + флаг активности. `id` — стабильный
 * ключ строки в UI; адресация же ведётся по `selector` (одна активная подмена на
 * селектор — см. `upsertOverride`). `label` — человекочитаемое имя выбранного узла.
 */
export interface DomOverrideEntry {
  readonly id: string;
  readonly selector: string;
  readonly label: string;
  readonly op: DomOverrideOp;
  readonly enabled: boolean;
}

/** Персистентное состояние фичи (слой настроек TASK-005): список подмен. */
export interface DomOverrideSettingsState {
  readonly overrides: readonly DomOverrideEntry[];
}

export const DOM_OVERRIDE_SETTINGS_DEFAULTS: DomOverrideSettingsState = {
  overrides: [],
};
