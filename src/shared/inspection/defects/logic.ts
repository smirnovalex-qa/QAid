/**
 * Чистая логика фичи «Детектор дефектов» (TASK-024).
 *
 * БЕЗ DOM и `chrome.*`: реестр правил-детекторов (чистые предикаты над
 * сериализованной моделью узла `DefectNode`), построитель кросс-узлового контекста
 * (дубли `id`/`data-testid`, нарушения порядка заголовков), агрегатор находок,
 * группировка по правилу и построитель отчёта (plain/JSON/CSV). Добавить правило =
 * добавить чистый предикат в `DEFECT_RULES`, не трогая сборщик и UI. Это покрытый
 * почти-на-100% модуль фичи (канон «core ~100%»).
 */
import { escapeCsvField, toExport } from '@/shared/export/export';
import type { ExportFormat } from '@/shared/export/export';
import type { DefectFinding, DefectNode, DefectSeverity } from './types';

export type { DefectSeverity } from './types';

/** Кросс-узловой контекст: то, что нельзя решить по одному узлу изолированно. */
export interface DefectContext {
  /** Значения `id`, встретившиеся более одного раза. */
  readonly duplicateIds: ReadonlySet<string>;
  /** Непустые значения `data-testid`, встретившиеся более одного раза. */
  readonly duplicateTestIds: ReadonlySet<string>;
  /** Индексы узлов-заголовков, чей уровень «перепрыгнул» предыдущий (напр. h1→h3). */
  readonly headingOrderViolations: ReadonlySet<number>;
}

/** Правило-детектор: чистый предикат над узлом и кросс-узловым контекстом. */
export interface DefectRule {
  readonly id: string;
  readonly severity: DefectSeverity;
  /** Ключ i18n человекочитаемого названия дефекта. */
  readonly messageKey: string;
  readonly predicate: (node: DefectNode, ctx: DefectContext) => boolean;
}

/** Тримленное значение атрибута (или '' если отсутствует). */
function attr(node: DefectNode, name: string): string {
  return (node.attrs[name] ?? '').trim();
}

/** Есть ли у узла атрибут (даже с пустым значением). */
function hasAttr(node: DefectNode, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(node.attrs, name);
}

/** Декоративное ли изображение: `role=presentation`/`none` или `aria-hidden=true`. */
function isDecorative(node: DefectNode): boolean {
  return (
    node.role === 'presentation' || node.role === 'none' || attr(node, 'aria-hidden') === 'true'
  );
}

/** Является ли узел кнопкой (нативной, ARIA-ролью или input-кнопкой). */
function isButtonLike(node: DefectNode): boolean {
  if (node.tag === 'button' || node.role === 'button') return true;
  if (node.tag === 'input') {
    const type = attr(node, 'type').toLowerCase();
    return type === 'button' || type === 'submit' || type === 'reset';
  }
  return false;
}

/**
 * Реестр правил MVP (расширяемый). Порядок задаёт стабильную сортировку внутри
 * равной тяжести. Каждый предикат чист: читает только поля узла и контекст.
 */
export const DEFECT_RULES: readonly DefectRule[] = [
  {
    id: 'img-alt',
    severity: 'error',
    messageKey: 'defect.rule.imgAlt',
    // <img> без alt / с пустым alt, кроме декоративных (role=presentation/none, aria-hidden).
    predicate: (node) =>
      node.tag === 'img' &&
      !isDecorative(node) &&
      (!hasAttr(node, 'alt') || attr(node, 'alt') === ''),
  },
  {
    id: 'img-broken',
    severity: 'error',
    messageKey: 'defect.rule.imgBroken',
    // Битая загрузка: есть src, но naturalWidth===0.
    predicate: (node) =>
      node.tag === 'img' && node.naturalWidthZero === true && attr(node, 'src') !== '',
  },
  {
    id: 'button-no-name',
    severity: 'error',
    messageKey: 'defect.rule.buttonNoName',
    // Кнопка без доступного имени (ни текста, ни aria-label/title/value).
    predicate: (node) => isButtonLike(node) && node.accessibleNameHint === '',
  },
  {
    id: 'id-duplicate',
    severity: 'error',
    messageKey: 'defect.rule.idDuplicate',
    predicate: (node, ctx) => {
      const id = attr(node, 'id');
      return id !== '' && ctx.duplicateIds.has(id);
    },
  },
  {
    id: 'testid-empty',
    severity: 'warning',
    messageKey: 'defect.rule.testidEmpty',
    predicate: (node) => hasAttr(node, 'data-testid') && attr(node, 'data-testid') === '',
  },
  {
    id: 'testid-duplicate',
    severity: 'warning',
    messageKey: 'defect.rule.testidDuplicate',
    predicate: (node, ctx) => {
      const id = attr(node, 'data-testid');
      return id !== '' && ctx.duplicateTestIds.has(id);
    },
  },
  {
    id: 'link-no-href',
    severity: 'warning',
    messageKey: 'defect.rule.linkNoHref',
    // <a> без атрибута href — не является ссылкой (нефокусируема, невалидна для навигации).
    predicate: (node) => node.tag === 'a' && !hasAttr(node, 'href'),
  },
  {
    id: 'link-js-void',
    severity: 'warning',
    messageKey: 'defect.rule.linkJsVoid',
    predicate: (node) =>
      node.tag === 'a' && attr(node, 'href').toLowerCase().startsWith('javascript:'),
  },
  {
    id: 'link-hash',
    severity: 'info',
    messageKey: 'defect.rule.linkHash',
    // href="#" — ссылка-заглушка (скролл наверх / перехватываемый JS-обработчик).
    predicate: (node) => node.tag === 'a' && attr(node, 'href') === '#',
  },
  {
    id: 'heading-order',
    severity: 'info',
    messageKey: 'defect.rule.headingOrder',
    predicate: (node, ctx) =>
      node.headingLevel !== null && ctx.headingOrderViolations.has(node.index),
  },
];

/** Быстрый доступ к правилу по id (для UI-тумблеров и заголовков групп). */
export const DEFECT_RULES_BY_ID: ReadonlyMap<string, DefectRule> = new Map(
  DEFECT_RULES.map((r) => [r.id, r]),
);

/**
 * Строит кросс-узловой контекст из списка узлов (в порядке обхода). Дубли `id`/
 * `data-testid` — по частоте; нарушения порядка заголовков — по «перепрыгиванию»
 * уровня относительно предыдущего заголовка (первый заголовок сравнивается с 0,
 * так что старт не с `h1` тоже считается пропуском).
 */
export function buildContext(nodes: readonly DefectNode[]): DefectContext {
  const idCounts = new Map<string, number>();
  const testIdCounts = new Map<string, number>();
  const headingOrderViolations = new Set<number>();

  let prevHeadingLevel = 0;
  for (const node of nodes) {
    const id = (node.attrs.id ?? '').trim();
    if (id !== '') idCounts.set(id, (idCounts.get(id) ?? 0) + 1);

    const testId = (node.attrs['data-testid'] ?? '').trim();
    if (testId !== '') testIdCounts.set(testId, (testIdCounts.get(testId) ?? 0) + 1);

    if (node.headingLevel !== null) {
      if (node.headingLevel > prevHeadingLevel + 1) headingOrderViolations.add(node.index);
      prevHeadingLevel = node.headingLevel;
    }
  }

  const duplicatesOf = (counts: Map<string, number>): Set<string> => {
    const out = new Set<string>();
    for (const [value, count] of counts) {
      if (count > 1) out.add(value);
    }
    return out;
  };

  return {
    duplicateIds: duplicatesOf(idCounts),
    duplicateTestIds: duplicatesOf(testIdCounts),
    headingOrderViolations,
  };
}

/** Короткий контекст находки (доступное имя / значение атрибута) для отображения. */
function findingSnippet(node: DefectNode, ruleId: string): string {
  if (ruleId === 'link-no-href' || ruleId === 'link-js-void' || ruleId === 'link-hash') {
    const href = (node.attrs.href ?? '').trim();
    return href !== '' ? href : node.accessibleNameHint;
  }
  if (ruleId === 'testid-empty' || ruleId === 'testid-duplicate') {
    return (node.attrs['data-testid'] ?? '').trim();
  }
  if (ruleId === 'id-duplicate') return (node.attrs.id ?? '').trim();
  return node.accessibleNameHint;
}

/** Опции детекции: набор ВЫКЛЮЧЕННЫХ правил (по умолчанию все включены). */
export interface DetectOptions {
  readonly disabled?: ReadonlySet<string>;
}

/**
 * Прогоняет все включённые правила по всем узлам, возвращает плоский список находок
 * в порядке «узел за узлом, правило за правилом». Контекст строится один раз.
 */
export function detectDefects(
  nodes: readonly DefectNode[],
  options: DetectOptions = {},
): DefectFinding[] {
  const ctx = buildContext(nodes);
  const disabled = options.disabled;
  const out: DefectFinding[] = [];
  for (const node of nodes) {
    for (const rule of DEFECT_RULES) {
      if (disabled?.has(rule.id) === true) continue;
      if (!rule.predicate(node, ctx)) continue;
      out.push({
        ruleId: rule.id,
        severity: rule.severity,
        messageKey: rule.messageKey,
        selector: node.selector,
        tag: node.tag,
        snippet: findingSnippet(node, rule.id),
      });
    }
  }
  return out;
}

/** Ранг тяжести для сортировки (error выше warning выше info). */
const SEVERITY_RANK: Readonly<Record<DefectSeverity, number>> = { error: 0, warning: 1, info: 2 };

/** Числовой ранг тяжести (меньше — важнее). */
export function severityRank(severity: DefectSeverity): number {
  return SEVERITY_RANK[severity];
}

/** Группа находок одного правила (для списка с счётчиками). */
export interface DefectGroup {
  readonly ruleId: string;
  readonly severity: DefectSeverity;
  readonly messageKey: string;
  readonly count: number;
  readonly items: readonly DefectFinding[];
}

/**
 * Группирует находки по правилу и сортирует группы по тяжести, затем по числу
 * находок (убыв.), затем по id правила — детерминированный порядок для UI и снапшотов.
 */
export function groupFindings(findings: readonly DefectFinding[]): DefectGroup[] {
  const byRule = new Map<string, DefectFinding[]>();
  for (const finding of findings) {
    const bucket = byRule.get(finding.ruleId);
    if (bucket === undefined) byRule.set(finding.ruleId, [finding]);
    else bucket.push(finding);
  }

  const groups: DefectGroup[] = [];
  for (const [ruleId, items] of byRule) {
    const first = items[0];
    if (first === undefined) continue;
    groups.push({
      ruleId,
      severity: first.severity,
      messageKey: first.messageKey,
      count: items.length,
      items,
    });
  }

  groups.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    if (a.count !== b.count) return b.count - a.count;
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });
  return groups;
}

/** Сводка находок по тяжести. */
export interface DefectSummary {
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
}

/** Считает находки по тяжести. */
export function summarize(findings: readonly DefectFinding[]): DefectSummary {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const finding of findings) {
    if (finding.severity === 'error') errors += 1;
    else if (finding.severity === 'warning') warnings += 1;
    else infos += 1;
  }
  return { total: findings.length, errors, warnings, infos };
}

/** Плоская строка отчёта — сериализуемая проекция находки. */
export interface DefectReportRow {
  readonly rule: string;
  readonly severity: DefectSeverity;
  readonly selector: string;
  readonly tag: string;
  readonly snippet: string;
}

/** Порядок и заголовки колонок отчёта — единый источник правды для CSV/plain. */
const REPORT_COLUMNS = ['rule', 'severity', 'selector', 'tag', 'snippet'] as const;

/** Строит строки отчёта из находок (тяжесть/правило уже вшиты в находку). */
export function toReportRows(findings: readonly DefectFinding[]): DefectReportRow[] {
  return findings.map((f) => ({
    rule: f.ruleId,
    severity: f.severity,
    selector: f.selector,
    tag: f.tag,
    snippet: f.snippet,
  }));
}

/** Значения строки в порядке колонок (для табличных форматов). */
function rowValues(row: DefectReportRow): string[] {
  return [row.rule, row.severity, row.selector, row.tag, row.snippet];
}

/**
 * Собирает отчёт в выбранном формате:
 *  - `json`  — массив строк-объектов с отступом (человекочитаемо, типы сохранены);
 *  - `csv`   — RFC 4180, поля через `escapeCsvField` (анти-инъекция);
 *  - `plain` — по строке на находку `severity selector — rule`, через `toExport`.
 */
export function buildReport(rows: readonly DefectReportRow[], format: ExportFormat): string {
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
        { rows: rows.map((r) => `${r.severity} ${r.selector} — ${r.rule}`) },
        'plain',
      );
  }
}
