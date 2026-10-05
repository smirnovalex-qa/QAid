/**
 * Расчёт специфичности CSS-селектора по алгоритму CSS Selectors Level 3 (TASK-055) —
 * чистый модуль без `@/content/**`/`preact`/`chrome.*` (fitness §12.1/§12.2/§12.5).
 *
 * Специфичность — кортеж `(a, b, c)`:
 *  - `a` — число id-селекторов (`#id`);
 *  - `b` — классы, атрибуты (`[..]`), псевдоклассы (`:hover`);
 *  - `c` — типы (`div`) и псевдоэлементы (`::before`); универсальный `*` — ноль.
 * Функциональные псевдоклассы: `:not()/:is()/:has()` берут специфичность самого
 * специфичного аргумента; `:where()` — всегда ноль.
 *
 * ВАЖНО: это нужно ТОЛЬКО для упорядочивания правил внутри каскада. Источник истины
 * о совпадении — `element.matches(selectorText)` в сборщике, а не этот парсер;
 * приближение на экзотическом/новом селекторе меняет лишь порядок внутри равной
 * группы, но не корректность показа. Поэтому парсер устойчив к незнакомому вводу
 * (не бросает), а не формально полон.
 */

/** Специфичность как кортеж `(a, b, c)` (id · классы/атрибуты/псевдоклассы · типы/псевдоэлементы). */
export type Specificity = readonly [a: number, b: number, c: number];

/** Наследие CSS2: эти псевдоэлементы пишутся с одним двоеточием, но считаются как `c`. */
const LEGACY_PSEUDO_ELEMENTS: ReadonlySet<string> = new Set([
  'before',
  'after',
  'first-line',
  'first-letter',
]);

/** Складывает две специфичности покомпонентно. */
function add(x: Specificity, y: Specificity): Specificity {
  return [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
}

/**
 * Сравнивает специфичности как числа по основанию «бесконечность»: `>0` — `x`
 * специфичнее, `<0` — `y`, `0` — равны. Для сортировок/выбора победителя.
 */
export function compareSpecificity(x: Specificity, y: Specificity): number {
  if (x[0] !== y[0]) return x[0] - y[0];
  if (x[1] !== y[1]) return x[1] - y[1];
  return x[2] - y[2];
}

/** Возвращает более специфичную из двух (для `:is()/:not()` и списков селекторов). */
function max(x: Specificity, y: Specificity): Specificity {
  return compareSpecificity(x, y) >= 0 ? x : y;
}

const ZERO: Specificity = [0, 0, 0];

/** Имя-символ CSS-идентификатора: ASCII-буквы/цифры/`_`/`-` или любой не-ASCII. */
function isNameChar(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) > 0x7f;
}

/** Старт имени CSS-идентификатора: ASCII-буква/`_` или любой не-ASCII. */
function isNameStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch) || ch.charCodeAt(0) > 0x7f;
}

/** Пропускает идентификатор (имя класса/id/типа/псевдо), учитывая `\`-экранирование. */
function skipName(s: string, i: number): number {
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (isNameChar(ch)) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

/** Пропускает строковый литерал в кавычках, возвращает индекс после закрывающей кавычки. */
function skipString(s: string, i: number): number {
  const quote = s.charAt(i);
  i += 1;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Пропускает атрибутный селектор `[...]`, возвращает индекс после `]`. */
function skipBrackets(s: string, i: number): number {
  i += 1; // '['
  let depth = 1;
  while (i < s.length && depth > 0) {
    const ch = s.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(s, i);
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
    i += 1;
  }
  return i;
}

/** Индекс `)`, парной `(` в позиции `i` (учёт вложенности и строк). */
function matchParen(s: string, i: number): number {
  let depth = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(s, i);
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return s.length;
}

/**
 * Делит список селекторов верхнего уровня по запятой, игнорируя запятые внутри
 * `()`/`[]`/строк (напр. `:is(a, b)`). Пустые части отбрасываются.
 */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < selector.length) {
    const ch = selector.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(selector, i);
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(selector.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** Считает специфичность ОДНОГО комплексного селектора (без запятых верхнего уровня). */
function scan(selector: string): Specificity {
  let spec: Specificity = ZERO;
  let i = 0;
  const n = selector.length;

  while (i < n) {
    const ch = selector.charAt(i);

    if (ch === '#') {
      i = skipName(selector, i + 1);
      spec = add(spec, [1, 0, 0]);
    } else if (ch === '.') {
      i = skipName(selector, i + 1);
      spec = add(spec, [0, 1, 0]);
    } else if (ch === '[') {
      i = skipBrackets(selector, i);
      spec = add(spec, [0, 1, 0]);
    } else if (ch === ':') {
      i += 1;
      let pseudoElement = false;
      if (selector.charAt(i) === ':') {
        pseudoElement = true;
        i += 1;
      }
      const start = i;
      i = skipName(selector, i);
      const name = selector.slice(start, i).toLowerCase();

      if (selector.charAt(i) === '(') {
        const end = matchParen(selector, i);
        const arg = selector.slice(i + 1, end);
        i = end + 1;
        if (name === 'where') {
          // :where() не вносит специфичности.
        } else if (name === 'not' || name === 'is' || name === 'has') {
          const inner = splitSelectorList(arg).map(scan).reduce(max, ZERO);
          spec = add(spec, inner);
        } else {
          // Прочие функциональные псевдоклассы (`:nth-child(...)` и т.п.) — как псевдокласс.
          spec = add(spec, [0, 1, 0]);
        }
      } else if (pseudoElement || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        spec = add(spec, [0, 0, 1]);
      } else {
        spec = add(spec, [0, 1, 0]);
      }
    } else if (ch === '*') {
      i += 1; // универсальный — ноль
    } else if (ch === '|') {
      i += 1; // разделитель пространства имён (`*|el`, `|el`) — не считается
    } else if (
      ch === '>' ||
      ch === '+' ||
      ch === '~' ||
      ch === ' ' ||
      ch === '\t' ||
      ch === '\n' ||
      ch === '\r'
    ) {
      i += 1; // комбинатор/пробел
    } else if (isNameStart(ch)) {
      i = skipName(selector, i);
      // `ns|type`: имя перед `|` — префикс пространства имён, не тип; тип прочитается следом.
      if (
        selector.charAt(i) === '|' &&
        selector.charAt(i + 1) !== '|' &&
        selector.charAt(i + 1) !== '='
      ) {
        i += 1;
        continue;
      }
      spec = add(spec, [0, 0, 1]);
    } else {
      i += 1; // незнакомый символ — безопасно пропускаем (порядок, не корректность)
    }
  }

  return spec;
}

/**
 * Специфичность селектора. Для списка (`a, .b, #c`) возвращает специфичность самой
 * специфичной части — согласуется с тем, как браузер выбирает победивший селектор
 * списка. Чистая и детерминированная; не бросает на незнакомом вводе.
 */
export function computeSpecificity(selector: string): Specificity {
  const parts = splitSelectorList(selector);
  if (parts.length === 0) return ZERO;
  return parts.map(scan).reduce(max, ZERO);
}
