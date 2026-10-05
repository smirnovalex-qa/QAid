/**
 * English strings for the shared DOM-hierarchy navigator (TASK-052). Lives in the UI
 * layer because `HierarchyNav`/`useInspectedNode` are shared across every `inspector-*`
 * feature — one catalog, no per-feature duplication.
 */
const en: Record<string, string> = {
  // Shared node-inspection flow (used by the `useInspectedNode` hook).
  'inspection.error.permissionDenied':
    'Access to pages was declined. Grant it to use the inspector on any tab.',
  'inspection.error.noTab': 'Could not determine the active tab.',
  'inspection.error.generic': 'Something went wrong. Please try again.',
  'inspection.error.cancelled': 'Selection cancelled.',

  // DOM-hierarchy navigator.
  'inspection.nav.breadcrumb': 'DOM path',
  'inspection.nav.controls': 'Hierarchy navigation',
  'inspection.nav.parent': 'Parent',
  'inspection.nav.child': 'First child',
  'inspection.nav.prevSibling': 'Previous sibling',
  'inspection.nav.nextSibling': 'Next sibling',
  'inspection.nav.position': '{index} of {count}',
  'inspection.nav.goTo': 'Go to {selector}',
  'inspection.nav.current': 'current node',
  'inspection.nav.truncated': 'part of the path is hidden',
  'inspection.nav.hint': '↑ parent · ↓ child · ←/→ siblings · Esc to exit',
  // Inspected-element header.
  'inspection.node.size': '{width} × {height}',
  'inspection.node.sizeLabel': 'Rendered size',
  'inspection.node.children': '{count} children',
  'inspection.node.copySelector': 'Copy selector',

  // Box-model diagram (shared by the Element inspector and the ruler).
  'inspection.box.title': 'Box model',
  'inspection.box.margin': 'margin',
  'inspection.box.border': 'border',
  'inspection.box.padding': 'padding',
  'inspection.box.content': 'content',
};

export default en;
