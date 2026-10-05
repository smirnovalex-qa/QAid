/**
 * Чистая логика фичи «Формы» (TASK-020).
 *
 * БЕЗ DOM и `chrome.*`: классификатор вида поля по совокупности признаков,
 * генераторы валидных/граничных/пустых/инъекционных значений на ИНЪЕКТИРУЕМОМ
 * `RandomSource` (детерминизм в тестах), правила аудита над сериализованной моделью
 * и построитель отчёта (plain/JSON/CSV). Единственный покрытый почти-на-100% модуль
 * фичи (канон «core ~100%»).
 *
 * Доменные генераторы тест-данных (email/ФИО/адрес/телефон/дата) вынесены в общий
 * слой `@/shared/test-data` (TASK-034) — здесь остаётся лишь ФОРМО-специфичная
 * оркестрация (профили valid/boundary/empty/injection, ограничения maxLength/pattern,
 * наполнительная лексика). Дублей доменной генерации нет.
 */
import { escapeCsvField, toExport } from '@/shared/export/export';
import type { ExportFormat } from '@/shared/export/export';
import { secureRandom } from '@/shared/random';
import type { RandomSource } from '@/shared/random';
import {
  address,
  dateInRange,
  email,
  firstName,
  fullName,
  lastName,
  phone,
  toIsoDate,
} from '@/shared/test-data';
import type {
  AuditIssue,
  AuditSeverity,
  FieldAttrs,
  FieldKind,
  FillProfile,
  FormModel,
} from './types';

// ───────────────────────────── классификация ─────────────────────────────

/** Собирает все текстовые «подсказки» контрола в один нижнерегистровый хэй-стек. */
function hints(attrs: FieldAttrs): string {
  return [attrs.autocomplete, attrs.name, attrs.id, attrs.placeholder, attrs.labelText]
    .filter((v): v is string => v !== null && v !== '')
    .join(' ')
    .toLowerCase();
}

/** Упорядоченные эвристики «подсказки → вид» (первое совпадение выигрывает). */
const HINT_RULES: readonly (readonly [RegExp, FieldKind])[] = [
  [/e-?mail/, 'email'],
  [/phone|tel(?:ephone)?|mobile|\bfax\b/, 'tel'],
  [/first[\s_-]*name|given[\s_-]*name|\bfname\b|\bfirstname\b/, 'first'],
  [/last[\s_-]*name|family[\s_-]*name|surname|\blname\b|\blastname\b/, 'last'],
  [/full[\s_-]*name|\bname\b|username|user[\s_-]*name|\bnickname\b/, 'name'],
  [/address|street|\bcity\b|\bstate\b|\bzip\b|postal/, 'address'],
  [/\bdate\b|\bdob\b|birth|bday/, 'date'],
  [/url|website|\bsite\b|homepage|\blink\b/, 'url'],
  [/amount|\bage\b|\bqty\b|quantity|\bcount\b|\bprice\b|\bnumber\b|\bnum\b/, 'number'],
  [/pass(?:word)?|\bpwd\b/, 'password'],
];

/**
 * Классифицирует поле по совокупности признаков. Приоритет: тег (textarea/select) →
 * явный `input[type]` (email/tel/url/number/date/password/checkbox/radio) → эвристики
 * по autocomplete/name/id/placeholder/label. Для generic `text`/без типа, не давшего
 * совпадения, — `text`; для неизвестного контрола — `unknown`.
 */
export function classifyField(attrs: FieldAttrs): FieldKind {
  if (attrs.tagName === 'textarea') return 'textarea';
  if (attrs.tagName === 'select') return 'select';

  const type = attrs.type ?? 'text';
  switch (type) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'number':
    case 'range':
      return 'number';
    case 'date':
    case 'datetime-local':
    case 'month':
      return 'date';
    case 'password':
      return 'password';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    default:
      break;
  }

  const hay = hints(attrs);
  for (const [re, kind] of HINT_RULES) {
    if (re.test(hay)) return kind;
  }
  // Явный `search`/`text` без семантических подсказок — просто текст.
  return type === 'text' || type === 'search' ? 'text' : 'unknown';
}

// ───────────────────────────── генерация ─────────────────────────────

/** Ограничения на генерируемое значение (из атрибутов поля). */
export interface GenerateConstraints {
  readonly maxLength?: number | null;
  readonly pattern?: string | null;
}

/** Лексика для URL-хоста (только строчные латинские — под ожидаемый формат `https://<word>.com`). */
const URL_WORDS = ['example', 'test', 'mail', 'demo', 'sample'] as const;
const WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'tempor',
] as const;

/** XSS/SQL тест-строки — для проверки экранирования на собственных стендах. */
const INJECTION_STRINGS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "' OR '1'='1",
  "'; DROP TABLE users;--",
  '{{7*7}}',
  '${7*7}',
  '<svg/onload=alert(1)>',
] as const;

/** Небазовый элемент массива через инъектируемый RNG (массив непустой у вызова). */
function pick<T>(arr: readonly T[], rng: RandomSource): T {
  // Вызывается только для непустых литеральных массивов — индекс всегда валиден.
  return arr[rng.below(arr.length)] as T;
}

/** Строка из `len` случайных десятичных цифр. */
function digits(len: number, rng: RandomSource): string {
  let out = '';
  for (let i = 0; i < len; i += 1) out += String(rng.below(10));
  return out;
}

/** Целое в `[min, max]` включительно. */
function intInRange(min: number, max: number, rng: RandomSource): number {
  if (max <= min) return min;
  return min + rng.below(max - min + 1);
}

/** Границы правдоподобной даты рождения/события (совместимо с прежним поведением). */
const DATE_FROM = new Date(Date.UTC(1970, 0, 1));
const DATE_TO = new Date(Date.UTC(2005, 11, 31));

/**
 * Пытается удовлетворить ПРОСТОЙ `pattern` вида `\d{n}` / `[0-9]{n}` / `\d{n,m}`
 * (в т.ч. с якорями `^…$`) — генерит `n` цифр. Любой более сложный паттерн — `null`
 * (значение по виду поля тогда используется как есть).
 */
function satisfyPattern(pattern: string, rng: RandomSource): string | null {
  const m = /^\^?(?:\\d|\[0-9\])\{(\d+)(?:,(\d+))?\}\$?$/.exec(pattern.trim());
  if (!m) return null;
  const min = Number.parseInt(m[1] ?? '', 10);
  if (Number.isNaN(min) || min <= 0) return null;
  return digits(Math.min(min, 40), rng);
}

/** Валидное значение по виду поля (без учёта профиля/ограничений). */
function validFor(kind: FieldKind, rng: RandomSource): string {
  switch (kind) {
    case 'email':
      return email(rng);
    case 'tel':
      return phone('US', rng);
    case 'first':
      return firstName('en', rng);
    case 'last':
      return lastName('en', rng);
    case 'name':
      return fullName('en', rng);
    case 'address':
      return address('en', rng);
    case 'date':
      return toIsoDate(dateInRange(DATE_FROM, DATE_TO, rng));
    case 'number':
      return String(intInRange(1, 1000, rng));
    case 'url':
      return `https://${pick(URL_WORDS, rng)}.com`;
    case 'password':
      // Смешанные классы символов — проходит типичные политики (≥12, буквы/цифры/спецсимвол).
      return `Aa1!${digits(6, rng)}${pick(WORDS, rng)}`;
    case 'text':
      return `${pick(WORDS, rng)} ${pick(WORDS, rng)}`;
    case 'textarea':
      return `${pick(WORDS, rng)} ${pick(WORDS, rng)} ${pick(WORDS, rng)} ${pick(WORDS, rng)}.`;
    case 'select':
    case 'checkbox':
    case 'radio':
    case 'unknown':
      return '';
  }
}

/** Обрезает строку до `maxLength`, если он задан и меньше длины. */
function clampLen(value: string, maxLength: number | null | undefined): string {
  if (maxLength !== null && maxLength !== undefined && maxLength > 0 && value.length > maxLength) {
    return value.slice(0, maxLength);
  }
  return value;
}

/** Граничное значение: строка ровно на `maxLength` (или дефолт 64) символов. */
function boundaryFor(
  kind: FieldKind,
  rng: RandomSource,
  maxLength: number | null | undefined,
): string {
  const target = maxLength !== null && maxLength !== undefined && maxLength > 0 ? maxLength : 64;
  if (kind === 'number') return digits(Math.min(target, 15), rng);
  // Начинаем с валидной «основы», добиваем до целевой длины наполнителем того же класса.
  const base = validFor(kind, rng) || 'a';
  if (base.length >= target) return base.slice(0, target);
  const fillChar = kind === 'email' ? 'a' : 'x';
  return (base + fillChar.repeat(target)).slice(0, target);
}

/**
 * Генерирует значение поля под вид и профиль на инъектируемом `rng` (дефолт —
 * криптостойкий `secureRandom`; тесты передают детерминированный источник).
 * Для `checkbox`/`radio` возвращает `boolean`, иначе строку. Учитывает `maxLength`
 * и простой цифровой `pattern`.
 */
export function generateValue(
  kind: FieldKind,
  profile: FillProfile,
  rng: RandomSource = secureRandom,
  constraints: GenerateConstraints = {},
): string | boolean {
  const isBool = kind === 'checkbox' || kind === 'radio';

  if (profile === 'empty') return isBool ? false : '';

  if (isBool) {
    // boundary/valid/injection — «включено»; empty уже обработан выше.
    return true;
  }

  if (profile === 'injection') {
    return clampLen(pick(INJECTION_STRINGS, rng), constraints.maxLength);
  }

  if (profile === 'boundary') {
    return boundaryFor(kind, rng, constraints.maxLength);
  }

  // profile === 'valid'
  if (
    constraints.pattern !== null &&
    constraints.pattern !== undefined &&
    constraints.pattern !== ''
  ) {
    const byPattern = satisfyPattern(constraints.pattern, rng);
    if (byPattern !== null) return clampLen(byPattern, constraints.maxLength);
  }
  return clampLen(validFor(kind, rng), constraints.maxLength);
}

// ───────────────────────────── аудит ─────────────────────────────

/** Виды, ожидающие конкретный `input[type]` (иначе несовпадение типа). */
const EXPECTED_INPUT_TYPE: Partial<Record<FieldKind, string>> = {
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
};

/** Ожидаемый `input[type]` для семантического вида (иначе `null`). */
function expectedInputType(kind: FieldKind): string | null {
  return EXPECTED_INPUT_TYPE[kind] ?? null;
}

/** Похоже ли, что поле обязательно «по виду» (звёздочка/слово «required» в ярлыке). */
function looksRequired(attrs: FieldAttrs): boolean {
  const label = `${attrs.labelText ?? ''} ${attrs.placeholder ?? ''}`.toLowerCase();
  return label.includes('*') || /required|обязательн/.test(label);
}

/**
 * Правила аудита над сериализованной моделью формы (чистая функция — тестируется без
 * DOM). Находит: поля без доступного ярлыка; обязательные «по виду», но без
 * `required`/`aria-required`; дубли `id`; несовпадение `type` ↔ семантического вида.
 */
export function auditForm(model: FormModel): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Индекс частоты id — для правила дублей.
  const idCounts = new Map<string, number>();
  for (const f of model.fields) {
    const id = f.attrs.id;
    if (id !== null && id !== '') idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  for (const f of model.fields) {
    const a = f.attrs;

    // 1. Нет доступного ярлыка (placeholder ярлыком не считается).
    if (a.labelText === null || a.labelText.trim() === '') {
      issues.push({
        rule: 'label-missing',
        selector: f.selector,
        message: 'forms.audit.labelMissing',
        severity: 'error',
      });
    }

    // 2. Обязательное «по виду», но без required/aria-required.
    if (looksRequired(a) && !a.required && !a.ariaRequired) {
      issues.push({
        rule: 'required-missing',
        selector: f.selector,
        message: 'forms.audit.requiredMissing',
        severity: 'warning',
      });
    }

    // 3. Дубль id.
    if (a.id !== null && a.id !== '' && (idCounts.get(a.id) ?? 0) > 1) {
      issues.push({
        rule: 'duplicate-id',
        selector: f.selector,
        message: 'forms.audit.duplicateId',
        severity: 'error',
      });
    }

    // 4. Несовпадение type ↔ вида (вид семантичен, а тип остался generic `text`).
    const expected = expectedInputType(f.kind);
    if (
      expected !== null &&
      a.tagName === 'input' &&
      (a.type === null || a.type === 'text' || a.type === 'search') &&
      a.type !== expected
    ) {
      issues.push({
        rule: 'type-mismatch',
        selector: f.selector,
        message: 'forms.audit.typeMismatch',
        severity: 'warning',
      });
    }
  }

  return issues;
}

/** Сводка аудита по серьёзности. */
export interface AuditSummary {
  readonly total: number;
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

/** Считает проблемы по серьёзности. */
export function summarizeAudit(issues: readonly AuditIssue[]): AuditSummary {
  let error = 0;
  let warning = 0;
  let info = 0;
  for (const i of issues) {
    if (i.severity === 'error') error += 1;
    else if (i.severity === 'warning') warning += 1;
    else info += 1;
  }
  return { total: issues.length, error, warning, info };
}

// ───────────────────────────── отчёт ─────────────────────────────

/** Плоская строка отчёта аудита. `message` уже локализован вызывающим. */
export interface AuditReportRow {
  readonly rule: string;
  readonly selector: string;
  readonly severity: AuditSeverity;
  readonly message: string;
}

const REPORT_COLUMNS = ['rule', 'selector', 'severity', 'message'] as const;

/**
 * Строит строки отчёта из проблем. `translate` (по умолчанию — тождество) локализует
 * ключ `message`; логика остаётся чистой (перевод инъектируется).
 */
export function toAuditReportRows(
  issues: readonly AuditIssue[],
  translate: (key: string) => string = (k) => k,
): AuditReportRow[] {
  return issues.map((i) => ({
    rule: i.rule,
    selector: i.selector,
    severity: i.severity,
    message: translate(i.message),
  }));
}

function rowValues(row: AuditReportRow): string[] {
  return [row.rule, row.selector, row.severity, row.message];
}

/**
 * Собирает отчёт аудита в выбранном формате: `json` (массив объектов), `csv`
 * (RFC 4180 + анти-инъекция через `escapeCsvField`) или `plain` (по строке на проблему).
 */
export function buildAuditReport(rows: readonly AuditReportRow[], format: ExportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(rows, null, 2);
    case 'csv': {
      const header = REPORT_COLUMNS.map((c) => escapeCsvField(c)).join(',');
      const body = rows.map((r) =>
        rowValues(r)
          .map((v) => escapeCsvField(v))
          .join(','),
      );
      return [header, ...body].join('\r\n');
    }
    case 'plain':
      return toExport(
        { rows: rows.map((r) => `${r.severity.toUpperCase()} ${r.selector} — ${r.message}`) },
        'plain',
      );
  }
}

/**
 * Детерминированный источник случайности из целочисленного seed (mulberry32).
 * ТОЛЬКО для воспроизводимости (seeded-заполнение/тесты) — не для криптостойкости;
 * допускаем лёгкий modulo-bias ради простоты (в проде используется `secureRandom`).
 */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  const nextUint = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    below: (n) => (n <= 1 ? 0 : nextUint() % n),
    float: () => nextUint() / 2 ** 32,
  };
}
