/**
 * Оболочка side panel — тонкая обёртка над единой поверхностью `QASurface`
 * (редизайн: Board/Catalog + tool-view). Поверхность одна для popup и side panel,
 * адаптивна по ширине; здесь фиксируется вариант `sidepanel`.
 */
import type { JSX } from 'preact';
import { QASurface } from './QASurface';

export function SidePanelShell(): JSX.Element {
  return <QASurface variant="sidepanel" />;
}
