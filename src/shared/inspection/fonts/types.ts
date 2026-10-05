/**
 * Общие типы фичи «Инспектор: шрифты» (TASK-016).
 *
 * Живут отдельным контрактом, чтобы чистая логика (`logic.ts`), сборщик
 * (`collector.ts`), слой настроек и UI зависели от единого набора типов, а не
 * друг от друга. Всё сериализуемо (пересекает границу content → UI): DOM-узлы
 * наружу не ходят, только их снимки-описания.
 */

/** Источник семейства: веб-шрифт (`@font-face`), локальный/системный или неизвестный. */
export type FontSource = 'web' | 'local' | 'unknown';

/** Порядок сортировки списка семейств (персистится). */
export type FontsSort = 'count' | 'name';

/**
 * Снимок шрифтового профиля одного текст-несущего элемента. `family` — уже
 * эффективное (реально применённое) семейство, а не первое в списке; полная
 * цепочка — в `fallbackChain`. `text` — короткий локальный образец со страницы.
 */
export interface FontSample {
  readonly selector: string;
  readonly family: string;
  readonly fallbackChain: readonly string[];
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly fontStyle: string;
  readonly lineHeight: string;
  readonly letterSpacing: string;
  readonly text: string;
}

/**
 * Описание загруженного `FontFace` (status `loaded`). `url`/`format` — best-effort
 * из `@font-face` в `styleSheets`; при межоригинных/недоступных таблицах
 * деградируют до `null` (недоступно), не роняя сбор.
 */
export interface LoadedFontFace {
  readonly family: string;
  readonly weight: string;
  readonly style: string;
  readonly url: string | null;
  readonly format: string | null;
}

/** Сериализуемый агрегат сборщика: сырые сэмплы + сведения о загруженных шрифтах. */
export interface FontsScanData {
  readonly samples: readonly FontSample[];
  /** Канонические (lowercase) имена загруженных семейств — данные для классификатора. */
  readonly loadedFamilies: readonly string[];
  readonly faces: readonly LoadedFontFace[];
  /** Доступен ли `document.fonts`; при `false` источник деградирует до `unknown`. */
  readonly fontsApiAvailable: boolean;
}

/** Одно место использования семейства (для раздела «где используется»). */
export interface FontUsageLocation {
  readonly selector: string;
  readonly text: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly fontStyle: string;
}

/** Агрегат по семейству: частота, наборы применяемых размеров/весов/начертаний, места. */
export interface FontUsage {
  readonly family: string;
  readonly source: FontSource;
  readonly count: number;
  readonly sizes: readonly string[];
  readonly weights: readonly string[];
  readonly styles: readonly string[];
  readonly usages: readonly FontUsageLocation[];
}

/** Персистентное состояние фичи (через слой настроек TASK-005). */
export interface FontsState {
  readonly sort: FontsSort;
}

export const FONTS_DEFAULTS: FontsState = { sort: 'count' };
