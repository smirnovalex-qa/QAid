// English strings for the Element inspector (computed profile, TASK-013 → TASK-054).
const en: Record<string, string> = {
  'feature.inspectorProbe.title': 'Element inspector',
  'feature.inspectorProbe.desc':
    'Pick an element on the active tab and read its computed properties — typography, color and contrast, box model, layout — plus the CSS rules that matched it and which one won the cascade, recalculated as you walk the DOM hierarchy.',

  'inspection.instructions':
    'Click “Inspect”, then move the cursor over the page — elements light up under it. Click one to drill into it; keep clicking to go deeper. Press Esc to stop.',
  'inspection.pick': 'Pick element',
  'inspection.cancel': 'Cancel',
  'inspection.result': 'Element profile',
  'inspection.picked': 'Element picked',

  // Live cursor inspection (TASK-056): the pick button becomes a live-mode toggle.
  'inspection.live.start': 'Inspect',
  'inspection.live.inspecting': 'Inspecting…',
  'inspection.live.stop': 'Esc to stop',
  'inspection.live.hint': 'Click elements to drill inside · ↑ parent · ←/→ siblings · Esc to exit',

  // Computed-profile panel (TASK-054).
  'inspection.probe.attributes': 'Attributes',
  'inspection.probe.geometry': 'Box',
  'inspection.probe.contrast': 'Text/background contrast',
  'inspection.probe.approximate': 'approximate (gradient/image background)',
  'inspection.probe.wcag.pass': 'pass',
  'inspection.probe.wcag.fail': 'fail',
  'inspection.probe.filter': 'Filter',
  'inspection.probe.filter.placeholder': 'Filter by property or value…',
  'inspection.probe.copyGroup': 'Copy',
  'inspection.probe.noMatch': 'No properties match the filter.',

  // v3 «Inspect the page» — element inspector.
  'inspection.probe.pick': 'Pick an element',
  'inspection.probe.stop': 'Stop picking',
  'inspection.probe.pickHint':
    'Hover over the page to highlight. Click to select, click again to go deeper.',
  'inspection.probe.intro':
    'Pick an element to read its box model, styles and the CSS rules behind it.',
  'inspection.probe.pickingStatus': 'picking',
  'inspection.probe.tab.props': 'Properties',
  'inspection.probe.tab.rules': 'CSS rules',

  // Matched CSS rules / cascade (TASK-055).
  'inspection.probe.rules.title': 'Rules / Cascade',
  'inspection.probe.rules.empty': 'No author CSS rules match this element.',
  'inspection.probe.rules.inline': 'element style',
  'inspection.probe.rules.inlineSource': 'inline',
  'inspection.probe.rules.styleSheet': 'style sheet',
  'inspection.probe.rules.specificity': 'Specificity {a},{b},{c}',
  'inspection.probe.rules.setBy': 'set by {selector}',
  'inspection.probe.rules.cors':
    '{count} external style sheet(s) could not be read (cross-origin / CORS); their rules are not shown.',
  'inspection.probe.rules.truncated': 'Too many CSS rules on this page — the list was truncated.',

  // Property group headings (ids mirror the curated catalog).
  'inspection.probe.group.typography': 'Typography',
  'inspection.probe.group.color': 'Color & background',
  'inspection.probe.group.boxModel': 'Box model',
  'inspection.probe.group.borders': 'Borders & outline',
  'inspection.probe.group.layout': 'Layout & positioning',
  'inspection.probe.group.flexGrid': 'Flex / Grid',
  'inspection.probe.group.effects': 'Effects & interaction',

  'inspection.error.permissionDenied':
    'Access to pages was declined. Grant it to use the inspector on any tab.',
  'inspection.error.noTab': 'Could not determine the active tab.',
  'inspection.error.privilegedPage':
    'The inspector is not available on this page (a browser system page or the extension store).',
  'inspection.error.permission':
    'No access to this page. Click “Pick element” again and allow access when prompted.',
  'inspection.error.injectionFailed': 'Failed to inject the inspector into the page.',
  'inspection.error.generic': 'Something went wrong. Please try again.',
};

export default en;
