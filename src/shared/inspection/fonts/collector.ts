/**
 * Сборщик инспектора шрифтов (TASK-016) — чистый модуль без саморегистрации.
 *
 * Обходит видимые текст-несущие элементы поддерева с бюджетом узлов и снимает
 * шрифтовые характеристики. Ключевая тонкость: эффективное семейство — первое
 * РЕАЛЬНО применённое из цепочки `font-family` (проверяется `document.fonts.check`),
 * а не первое перечисленное. Источник каждого семейства определяется сопоставлением
 * с загруженными `FontFace` (status `loaded`); для веб-шрифтов best-effort
 * извлекаются URL/format из `@font-face` в `styleSheets`. Доступ к `cssRules`
 * межоригинных таблиц бросает `SecurityError` — обёрнут в try/catch и деградирует
 * без URL. Отсутствие `document.fonts` — деградация до источника `unknown`.
 *
 * Модуль НЕ импортирует `@/content/**` и НЕ вызывает `registerInspector`: оркестратор
 * зарегистрирует `(root) => collectFonts(root)` в content-хосте отдельно.
 */
import { walk } from '@/shared/inspection/dom';
import { canonicalFamily, normalizeFamily, stripQuotes } from './logic';
import type { FontSample, FontsScanData, LoadedFontFace } from './types';

/** Идентификатор сборщика в реестре инспекторов content-хоста. */
export const FONTS_INSPECTOR_ID = 'fonts';

/** Бюджет узлов обхода (PRD: до ~10k без лага). */
const NODE_BUDGET = 10000;

/** Максимум символов образца-текста (локальный сниппет для превью). */
const SAMPLE_TEXT_MAX = 80;

/** Тип текстового узла DOM (`Node.TEXT_NODE`). */
const TEXT_NODE = 3;

/**
 * Родовые CSS-семейства и системные псевдонимы: браузер всегда их «имеет», поэтому
 * при определении эффективного семейства они считаются доступными без `check`.
 */
const GENERIC_FAMILIES: ReadonlySet<string> = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
]);

/** Источник вычисленных стилей (инъектируется для тестов). */
type StyleReader = (el: Element) => CSSStyleDeclaration;
const defaultGetStyle: StyleReader = (el) => getComputedStyle(el);

/** Возвращает `document.fonts`, если API доступен и пригоден; иначе `null`. */
function getFontFaceSet(): FontFaceSet | null {
  if (typeof document === 'undefined') return null;
  // `Document.fonts` типизирован как обязательный, но в среде без реализации
  // (старый движок/jsdom) физически отсутствует — читаем через опциональный каст.
  const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
  return fonts ?? null;
}

/** Родовое семейство/системный псевдоним (всегда доступно у браузера). */
function isGeneric(family: string): boolean {
  return GENERIC_FAMILIES.has(family.toLowerCase());
}

/** Проверяет доступность конкретного семейства заданного размера через `document.fonts`. */
function fontAvailable(fonts: FontFaceSet, size: string, family: string): boolean {
  if (isGeneric(family)) return true;
  const escaped = family.replaceAll('"', '\\"');
  const shorthand = `${size === '' ? '16px' : size} "${escaped}"`;
  try {
    return fonts.check(shorthand);
  } catch {
    // Некорректный shorthand/среда без реализации — считаем недоступным, не роняем сбор.
    return false;
  }
}

/**
 * Определяет эффективное семейство: первое из цепочки, реально доступное браузеру.
 * Без `document.fonts` — деградация до первого в списке. Если ничего не доступно —
 * последнее в цепочке (обычно родовой fallback), к которому браузер и откатится.
 */
function pickEffectiveFamily(
  fonts: FontFaceSet | null,
  chain: readonly string[],
  size: string,
): string {
  if (chain.length === 0) return '';
  const first = chain[0] ?? '';
  if (fonts === null) return first;
  for (const family of chain) {
    if (fontAvailable(fonts, size, family)) return family;
  }
  return chain[chain.length - 1] ?? first;
}

/** Best-effort URL/format веб-шрифта из `@font-face`. */
interface FaceSource {
  url: string | null;
  format: string | null;
}

/** Извлекает первый `url(...)` и `format(...)` из значения дескриптора `src`. */
function parseSrc(src: string): FaceSource {
  const urlMatch = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(src);
  const formatMatch = /format\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(src);
  return { url: urlMatch?.[2] ?? null, format: formatMatch?.[2] ?? null };
}

/** Является ли правило `@font-face` (`CSSRule.FONT_FACE_RULE === 5`, с fallback по имени). */
function isFontFaceRule(rule: CSSRule): boolean {
  const type = (rule as { type?: number }).type;
  if (type === 5) return true;
  return rule.constructor.name === 'CSSFontFaceRule';
}

/**
 * Собирает карту `каноническое семейство → URL/format` из `@font-face` во всех
 * таблицах стилей. Межоригинные/недоступные таблицы (`SecurityError` на `cssRules`)
 * пропускаются — деградация без URL, не роняя сбор.
 */
function collectFaceSources(): Map<string, FaceSource> {
  const map = new Map<string, FaceSource>();
  if (typeof document === 'undefined') return map;
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules; // межоригинный доступ бросает SecurityError
    } catch {
      rules = null; // межоригинная таблица — недоступно, продолжаем
    }
    if (rules === null) continue;
    for (const rule of rules) {
      if (!isFontFaceRule(rule)) continue;
      const style = (rule as CSSFontFaceRule).style;
      const family = canonicalFamily(style.getPropertyValue('font-family'));
      if (family === '' || map.has(family)) continue;
      map.set(family, parseSrc(style.getPropertyValue('src')));
    }
  }
  return map;
}

/** Собирает загруженные (`status === 'loaded'`) шрифты с их URL/format. */
function collectFaces(fonts: FontFaceSet, sources: Map<string, FaceSource>): LoadedFontFace[] {
  const faces: LoadedFontFace[] = [];
  fonts.forEach((face) => {
    if (face.status !== 'loaded') return;
    const family = stripQuotes(face.family);
    const src = sources.get(family.toLowerCase()) ?? { url: null, format: null };
    faces.push({
      family,
      weight: face.weight,
      style: face.style,
      url: src.url,
      format: src.format,
    });
  });
  return faces;
}

/** Прямой (не унаследованный) текст элемента: конкатенация его текстовых узлов. */
function directText(el: Element): string {
  let text = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === TEXT_NODE) text += node.textContent ?? '';
  });
  return text.replace(/\s+/g, ' ').trim();
}

/** Короткий локальный образец-текст (без подгрузки — конфиденциальность/сеть). */
function sampleText(el: Element): string {
  const text = directText(el);
  return text.length > SAMPLE_TEXT_MAX ? `${text.slice(0, SAMPLE_TEXT_MAX)}...` : text;
}

/** Простой селектор `tag#id.class...` для последующей подсветки узла на странице. */
function buildSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  const classes = Array.from(el.classList)
    .map((cls) => `.${cls}`)
    .join('');
  return tag + (id !== null && id !== '' ? `#${id}` : '') + classes;
}

/**
 * Собирает шрифтовой профиль поддерева `root`. Обходит видимые текст-несущие
 * элементы, читает `font-family`/`font-size`/`font-weight`/`font-style`/
 * `line-height`/`letter-spacing`, определяет эффективное семейство и место
 * использования. Оверлей инспектора (`data-qatb-overlay`) исключается из обхода.
 * Результат JSON-сериализуем. `getStyle` инъектируется для тестов.
 */
export function collectFonts(
  root: Element,
  getStyle: StyleReader = defaultGetStyle,
): FontsScanData {
  const fonts = getFontFaceSet();
  const fontsApiAvailable = fonts !== null;
  const sources = fontsApiAvailable ? collectFaceSources() : new Map<string, FaceSource>();
  const faces = fonts !== null ? collectFaces(fonts, sources) : [];
  const loadedFamilies = Array.from(new Set(faces.map((f) => f.family.toLowerCase())));

  const elements = walk(root, {
    budget: NODE_BUDGET,
    exclude: (el) => el.hasAttribute('data-qatb-overlay'),
    getStyle,
  });

  const samples: FontSample[] = [];
  for (const el of elements) {
    if (!hasDirectText(el)) continue;
    const style = getStyle(el);
    const chain = normalizeFamily(style.fontFamily);
    const family = pickEffectiveFamily(fonts, chain, style.fontSize);
    samples.push({
      selector: buildSelector(el),
      family,
      fallbackChain: chain,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      text: sampleText(el),
    });
  }

  return { samples, loadedFamilies, faces, fontsApiAvailable };
}

/** Есть ли у элемента непустой прямой текст (то есть он несёт видимый текст). */
function hasDirectText(el: Element): boolean {
  return directText(el) !== '';
}
