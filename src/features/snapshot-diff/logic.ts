/**
 * Чистый diff-движок фичи «Snapshot-diff» (TASK-028).
 *
 * БЕЗ DOM и `chrome.*`: работает только над сериализуемой моделью снимка
 * (`Snapshot`/`SnapshotNode` из shared-слоя). Сопоставляет узлы двух снимков по
 * стабильному ключу идентичности, классифицирует added/removed/changed и считает
 * пер-свойственные изменения стилей/атрибутов/текста. Плюс фильтрация без
 * пересбора и рендер отчёта (JSON/Markdown). Это покрытый почти-на-100% модуль
 * фичи (канон «core ~100%»).
 *
 * Ключ решает качество дифа: т.к. узлы с `data-testid`/`id` несут стабильный ключ,
 * их переупорядочивание НЕ даёт ложной лавины added/removed, а точечное изменение
 * затрагивает ровно один узел (см. векторные тесты).
 */
import type { Snapshot, SnapshotNode } from '@/shared/inspection/snapshot/types';

/** Ссылка на узел в отчёте (без тяжёлой модели): ключ, тег, селектор. */
export interface NodeRef {
  readonly key: string;
  readonly tag: string;
  readonly selector: string;
}

/** Изменение одного свойства (стиль или текст): было → стало. */
export interface PropChange {
  readonly prop: string;
  readonly before: string;
  readonly after: string;
}

/** Изменение одного атрибута: `null` со стороны, где атрибут отсутствует. */
export interface AttrChange {
  readonly name: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** Изменённый узел: присутствует в обоих снимках, но чем-то отличается. */
export interface ChangedNode {
  readonly key: string;
  readonly tag: string;
  /** Селектор из снимка B (актуальная страница) — для подсветки. */
  readonly selector: string;
  readonly styleChanges: readonly PropChange[];
  readonly attrChanges: readonly AttrChange[];
  /** Изменение собственного текста или `null`, если текст не менялся. */
  readonly textChange: { readonly before: string; readonly after: string } | null;
}

/** Сводка дифа по категориям (для заголовка UI и отчёта). */
export interface DiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  /** Всего изменённых свойств-стилей по всем узлам. */
  readonly styleProps: number;
  /** Всего изменённых атрибутов по всем узлам. */
  readonly attrProps: number;
  /** Сколько узлов сменили собственный текст. */
  readonly textNodes: number;
}

/** Результат сравнения двух снимков. */
export interface DiffResult {
  readonly added: readonly NodeRef[];
  readonly removed: readonly NodeRef[];
  readonly changed: readonly ChangedNode[];
  readonly summary: DiffSummary;
}

/** Проекция узла в ссылку для отчёта. */
function toRef(node: SnapshotNode): NodeRef {
  return { key: node.key, tag: node.tag, selector: node.selector };
}

/** Индексирует узлы снимка по стабильному ключу (последний выигрывает — ключи уникальны). */
function indexByKey(snapshot: Snapshot): Map<string, SnapshotNode> {
  const map = new Map<string, SnapshotNode>();
  for (const node of snapshot.nodes) map.set(node.key, node);
  return map;
}

/** Пер-свойственный диф двух карт стилей (объединение ключей, сравнение значений). */
function diffStyles(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): PropChange[] {
  const out: PropChange[] = [];
  const props = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const prop of [...props].sort()) {
    const a = before[prop] ?? '';
    const b = after[prop] ?? '';
    if (a !== b) out.push({ prop, before: a, after: b });
  }
  return out;
}

/** Пер-атрибутный диф двух карт (added/removed/changed по имени атрибута). */
function diffAttrs(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): AttrChange[] {
  const out: AttrChange[] = [];
  const names = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const name of [...names].sort()) {
    const hasA = Object.prototype.hasOwnProperty.call(before, name);
    const hasB = Object.prototype.hasOwnProperty.call(after, name);
    const a = before[name] ?? '';
    const b = after[name] ?? '';
    if (hasA && hasB) {
      if (a !== b) out.push({ name, before: a, after: b });
    } else if (hasA) {
      out.push({ name, before: a, after: null });
    } else {
      out.push({ name, before: null, after: b });
    }
  }
  return out;
}

/**
 * Сравнивает два снимка. Сопоставление — по стабильному ключу: ключ есть только в
 * B → added; только в A → removed; в обоих, но есть отличие → changed (со списком
 * изменённых стилей/атрибутов и, при наличии, текста). Порядок added/removed —
 * как в исходных снимках; changed — в порядке узлов снимка B.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): DiffResult {
  const beforeByKey = indexByKey(before);
  const afterByKey = indexByKey(after);

  const removed: NodeRef[] = [];
  for (const node of before.nodes) {
    if (!afterByKey.has(node.key)) removed.push(toRef(node));
  }

  const added: NodeRef[] = [];
  const changed: ChangedNode[] = [];
  let styleProps = 0;
  let attrProps = 0;
  let textNodes = 0;

  for (const node of after.nodes) {
    const prev = beforeByKey.get(node.key);
    if (prev === undefined) {
      added.push(toRef(node));
      continue;
    }
    const styleChanges = diffStyles(prev.styles, node.styles);
    const attrChanges = diffAttrs(prev.attrs, node.attrs);
    const textChange = prev.text !== node.text ? { before: prev.text, after: node.text } : null;

    if (styleChanges.length === 0 && attrChanges.length === 0 && textChange === null) {
      continue;
    }
    styleProps += styleChanges.length;
    attrProps += attrChanges.length;
    if (textChange !== null) textNodes += 1;
    changed.push({
      key: node.key,
      tag: node.tag,
      selector: node.selector,
      styleChanges,
      attrChanges,
      textChange,
    });
  }

  return {
    added,
    removed,
    changed,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      styleProps,
      attrProps,
      textNodes,
    },
  };
}

/** Фильтр отображаемых изменений (без пересбора снимков). */
export type DiffFilter = 'all' | 'structure' | 'styles' | 'text';

/** Есть ли у diff-результата хоть одно изменение. */
export function isEmptyDiff(diff: DiffResult): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

/** Отфильтрованное представление дифа (подмножество, релевантное фильтру). */
export interface FilteredDiff {
  readonly added: readonly NodeRef[];
  readonly removed: readonly NodeRef[];
  readonly changed: readonly ChangedNode[];
}

/**
 * Возвращает подмножество дифа под выбранный фильтр — чистая проекция уже
 * посчитанного `DiffResult` (UI переключает фильтры без повторного скана):
 *  - `all`       — всё;
 *  - `structure` — только added/removed (структурные различия);
 *  - `styles`    — узлы с изменениями стилей (в них оставлены только styleChanges);
 *  - `text`      — узлы со сменой собственного текста (только textChange).
 */
export function selectChanges(diff: DiffResult, filter: DiffFilter): FilteredDiff {
  switch (filter) {
    case 'all':
      return { added: diff.added, removed: diff.removed, changed: diff.changed };
    case 'structure':
      return { added: diff.added, removed: diff.removed, changed: [] };
    case 'styles':
      return {
        added: [],
        removed: [],
        changed: diff.changed
          .filter((c) => c.styleChanges.length > 0)
          .map((c) => ({ ...c, attrChanges: [], textChange: null })),
      };
    case 'text':
      return {
        added: [],
        removed: [],
        changed: diff.changed
          .filter((c) => c.textChange !== null)
          .map((c) => ({ ...c, styleChanges: [], attrChanges: [] })),
      };
  }
}

/** Сериализует диф в JSON с отступом (типы сохранены, человекочитаемо). */
export function toJSONReport(diff: DiffResult): string {
  return JSON.stringify(diff, null, 2);
}

/** Экранирует ячейку Markdown-таблицы/строки (труба и перевод строки). */
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Отображает пустую строку как `∅` для читаемости отчёта. */
function orEmpty(value: string | null): string {
  return value === null || value === '' ? '∅' : value;
}

/**
 * Рендерит диф в Markdown: заголовок-сводка и секции Added / Removed / Changed
 * (в изменённых — вложенные пункты по стилям/атрибутам/тексту). Детерминированно.
 */
export function toMarkdownReport(diff: DiffResult): string {
  const s = diff.summary;
  const lines: string[] = [];
  lines.push('# Snapshot diff');
  lines.push('');
  lines.push(
    `**Added:** ${String(s.added)} · **Removed:** ${String(s.removed)} · ` +
      `**Changed:** ${String(s.changed)} (styles ${String(s.styleProps)}, ` +
      `attrs ${String(s.attrProps)}, text ${String(s.textNodes)})`,
  );
  lines.push('');

  if (diff.added.length > 0) {
    lines.push('## Added');
    for (const n of diff.added) lines.push(`- \`${mdCell(n.selector)}\` (${mdCell(n.tag)})`);
    lines.push('');
  }
  if (diff.removed.length > 0) {
    lines.push('## Removed');
    for (const n of diff.removed) lines.push(`- \`${mdCell(n.selector)}\` (${mdCell(n.tag)})`);
    lines.push('');
  }
  if (diff.changed.length > 0) {
    lines.push('## Changed');
    for (const c of diff.changed) {
      lines.push(`### \`${mdCell(c.selector)}\` (${mdCell(c.tag)})`);
      if (c.textChange !== null) {
        lines.push(
          `- text: \`${mdCell(orEmpty(c.textChange.before))}\` → ` +
            `\`${mdCell(orEmpty(c.textChange.after))}\``,
        );
      }
      for (const a of c.attrChanges) {
        lines.push(
          `- attr \`${mdCell(a.name)}\`: \`${mdCell(orEmpty(a.before))}\` → ` +
            `\`${mdCell(orEmpty(a.after))}\``,
        );
      }
      for (const st of c.styleChanges) {
        lines.push(
          `- style \`${mdCell(st.prop)}\`: \`${mdCell(orEmpty(st.before))}\` → ` +
            `\`${mdCell(orEmpty(st.after))}\``,
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

/** Рендер отчёта по формату (используется UI-кнопками экспорта). */
export function buildDiffReport(diff: DiffResult, format: 'json' | 'markdown'): string {
  return format === 'json' ? toJSONReport(diff) : toMarkdownReport(diff);
}
