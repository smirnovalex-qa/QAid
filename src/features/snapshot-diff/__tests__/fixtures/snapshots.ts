/**
 * Синтетические снимки для векторных тестов diff-движка (TASK-028). Строятся без
 * DOM — прямо конструируем сериализуемую модель, чтобы проверять чистую логику.
 */
import type { Snapshot, SnapshotNode } from '@/shared/inspection/snapshot/types';

/** Опции построения узла (частичные — остальное дефолтится). */
export interface NodeSpec {
  key: string;
  tag?: string;
  path?: string;
  selector?: string;
  attrs?: Record<string, string>;
  styles?: Record<string, string>;
  text?: string;
}

/** Строит один узел снимка из спеки. */
export function node(spec: NodeSpec): SnapshotNode {
  return {
    key: spec.key,
    path: spec.path ?? `path=${spec.key}`,
    tag: spec.tag ?? 'div',
    selector: spec.selector ?? spec.key,
    attrs: spec.attrs ?? {},
    styles: spec.styles ?? {},
    text: spec.text ?? '',
  };
}

/** Строит снимок из списка спек узлов. */
export function snapshot(specs: readonly NodeSpec[]): Snapshot {
  const nodes = specs.map(node);
  return { nodes, visited: nodes.length, budget: 10000, truncated: false };
}
