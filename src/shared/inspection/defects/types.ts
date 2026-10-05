/**
 * Общие типы фичи «Детектор дефектов» (TASK-024).
 *
 * Живут отдельным контрактом, чтобы чистая логика (`logic.ts`), DOM-сборщик
 * (`collector.ts`), слой настроек и UI опирались на единый набор типов, а не друг
 * на друга. Всё сериализуемо (пересекает границу content → side panel): DOM-узлы
 * наружу не ходят — только их снимки-описания (`DefectNode`).
 */

/** Тяжесть дефекта: влияет на цвет бейджа и порядок сортировки в отчёте/списке. */
export type DefectSeverity = 'error' | 'warning' | 'info';

/**
 * Сериализуемый снимок одного элемента страницы — вход для чистых правил-детекторов.
 * Никаких DOM-ссылок: сборщик заранее вычисляет всё, что нужно предикатам (доступное
 * имя, уровень заголовка, битость картинки), а сами правила работают только над этой
 * плоской моделью — поэтому тестируются без браузера.
 */
export interface DefectNode {
  /** Имя тега в нижнем регистре (`img`, `a`, `button`, `h1`…). */
  readonly tag: string;
  /** Карта атрибутов элемента (имя → значение). Пустые значения сохраняются как ''. */
  readonly attrs: Readonly<Record<string, string>>;
  /** Явная ARIA-роль (нижний регистр) или `null`, если атрибут `role` отсутствует. */
  readonly role: string | null;
  /**
   * Упрощённое доступное имя: `aria-label` → текст по `aria-labelledby` → `alt`
   * (для `img`) → `title` → `value` (для input-кнопок) → собственный текст. '' если
   * имя определить не удалось.
   */
  readonly accessibleNameHint: string;
  /** Уровень заголовка 1..6 для `h1`..`h6`; `null` для остальных тегов. */
  readonly headingLevel: number | null;
  /**
   * Для `<img>`: измерена ли нулевая ширина (`naturalWidth === 0`) — признак битой
   * загрузки. `null` для не-`img` (факт неприменим).
   */
  readonly naturalWidthZero: boolean | null;
  /** Короткий человекочитаемый селектор `tag#id.class` для подсветки узла на странице. */
  readonly selector: string;
  /** Позиция в порядке обхода (pre-order) — стабильный ключ для контекстных правил. */
  readonly index: number;
}

/** Сериализуемый агрегат страничного скана: снимки узлов + метаданные обхода. */
export interface DefectScanData {
  /** Снимки элементов в порядке обхода. */
  readonly nodes: readonly DefectNode[];
  /** Сколько узлов посещено в пределах бюджета. */
  readonly visited: number;
  /** Бюджет узлов обхода. */
  readonly budget: number;
  /** Достигнут ли бюджет (результат усечён). */
  readonly truncated: boolean;
}

/**
 * Одна находка: сработавшее правило на конкретном узле. Плоская и сериализуемая —
 * годится и для UI-списка, и для строк отчёта (plain/JSON/CSV).
 */
export interface DefectFinding {
  /** Идентификатор сработавшего правила. */
  readonly ruleId: string;
  /** Тяжесть (наследуется от правила). */
  readonly severity: DefectSeverity;
  /** Ключ i18n человекочитаемого названия дефекта (заголовок группы). */
  readonly messageKey: string;
  /** Селектор узла-нарушителя (для `inspection/highlight`). */
  readonly selector: string;
  /** Тег узла-нарушителя. */
  readonly tag: string;
  /** Короткий контекст (доступное имя / значение атрибута) для отображения. */
  readonly snippet: string;
}

/** Персистентное состояние фичи (через слой настроек TASK-005). */
export interface DefectSettingsState {
  /** Идентификаторы ВЫКЛЮЧЕННЫХ правил (по умолчанию все включены). */
  readonly disabledRules: readonly string[];
}

export const DEFECT_SETTINGS_DEFAULTS: DefectSettingsState = { disabledRules: [] };
