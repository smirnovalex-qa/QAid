/**
 * Общие типы фичи «Формы: автозаполнение + аудит» (TASK-020).
 *
 * Вынесены отдельно, чтобы чистая логика (`logic.ts`), DOM-сборщик (`collector.ts`),
 * content-заполнитель (`filler.ts`), слой настроек и UI опирались на единый контракт,
 * а не друг на друга. Все структуры JSON-сериализуемы (пересекают границу сред
 * content → side panel): DOM-узлы наружу не ходят, только их плоские снимки.
 */

/**
 * Классифицированный «вид» поля формы. Вычисляется чистым `classifyField` по
 * совокупности признаков (`type`/`autocomplete`/`name`/`id`/`placeholder`/label),
 * а не по одному атрибуту — типичная форма редко размечена идеально.
 */
export type FieldKind =
  | 'email'
  | 'tel'
  | 'name'
  | 'first'
  | 'last'
  | 'address'
  | 'date'
  | 'number'
  | 'url'
  | 'password'
  | 'text'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'unknown';

/**
 * Плоский снимок атрибутов контрола, достаточный и для классификации, и для
 * правил аудита. `labelText` — уже ВЫЧИСЛЕННЫЙ доступный ярлык (`<label>`/
 * `aria-label`/`aria-labelledby`), а не `placeholder` (placeholder ярлыком не
 * считается). Всё сериализуемо.
 */
export interface FieldAttrs {
  /** Тег контрола (определяет ветку классификации/заполнения). */
  readonly tagName: 'input' | 'textarea' | 'select';
  /** Значение атрибута `type` для `input` (в нижнем регистре); `null` для textarea/select. */
  readonly type: string | null;
  readonly name: string | null;
  readonly id: string | null;
  readonly autocomplete: string | null;
  readonly placeholder: string | null;
  /** Доступный ярлык (label/aria-label/aria-labelledby) или `null`, если его нет. */
  readonly labelText: string | null;
  /** Атрибут `required`. */
  readonly required: boolean;
  /** `aria-required="true"`. */
  readonly ariaRequired: boolean;
  /** `maxlength` (≥0) или `null`, если не задан. */
  readonly maxLength: number | null;
  /** Атрибут `pattern` или `null`. */
  readonly pattern: string | null;
  readonly disabled: boolean;
  readonly readonly: boolean;
  /** Скрыт ли контрол (type=hidden уже отфильтрован; здесь — display:none/visibility/hidden-атрибут). */
  readonly hidden: boolean;
}

/** Одно поле формы: устойчивый селектор + вычисленный вид + атрибуты. */
export interface FieldModel {
  /** Уникальный (по возможности) CSS-селектор для подсветки/перехода. */
  readonly selector: string;
  /** Классифицированный вид поля. */
  readonly kind: FieldKind;
  /** Плоский снимок атрибутов. */
  readonly attrs: FieldAttrs;
}

/** Краткая сводка по одному `<form>` (для счётчиков в UI). */
export interface FormInfo {
  readonly selector: string;
  readonly fieldCount: number;
}

/** Сериализуемая модель форм страницы: все поля + сводка по формам. */
export interface FormModel {
  readonly fields: readonly FieldModel[];
  readonly forms: readonly FormInfo[];
}

/**
 * Профиль автозаполнения:
 *  - `valid`     — правдоподобные валидные тест-данные (email проходит проверку и т.п.);
 *  - `boundary`  — граничные значения (макс-длина, крупные числа) для проверки лимитов;
 *  - `empty`     — пустые значения (проверка обязательности/валидации пустого);
 *  - `injection` — XSS/SQL тест-строки как ТЕСТ-ДАННЫЕ для проверки экранирования на
 *    собственных стендах (не средство атаки; автосабмит не выполняется).
 */
export type FillProfile = 'valid' | 'boundary' | 'empty' | 'injection';

/** Серьёзность найденной проблемы аудита. */
export type AuditSeverity = 'error' | 'warning' | 'info';

/**
 * Одна проблема аудита формы. `message` — i18n-КЛЮЧ (логика чистая и не локализует);
 * UI переводит его через `t`. `rule` — стабильный идентификатор правила.
 */
export interface AuditIssue {
  /** Идентификатор правила: `label-missing` | `required-missing` | `duplicate-id` | `type-mismatch`. */
  readonly rule: string;
  /** Селектор проблемного поля (для перехода/подсветки). */
  readonly selector: string;
  /** i18n-ключ человекочитаемого сообщения. */
  readonly message: string;
  readonly severity: AuditSeverity;
}

/** Персистентное состояние фичи (namespace `forms`, слой настроек TASK-005). */
export interface FormsSettingsState {
  readonly profile: FillProfile;
}

export const FORMS_SETTINGS_DEFAULTS: FormsSettingsState = {
  profile: 'valid',
};
