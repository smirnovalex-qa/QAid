/**
 * Оболочка popup — тонкая обёртка над единой поверхностью `QASurface`
 * (редизайн: Board/Catalog + tool-view). Та же поверхность, что и side panel,
 * адаптивна по ширине; здесь фиксируется вариант `popup`. Инструменты с
 * `requiresPanel` в transient-popup рендерят fallback «открыть side panel»
 * (см. `QASurface`, ADR-0025).
 */
import type { JSX } from 'preact';
import { QASurface } from './QASurface';

export function PopupShell(): JSX.Element {
  return <QASurface variant="popup" />;
}
