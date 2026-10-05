// English strings for the «Mock: DOM override by picking» feature (TASK-023).
const en: Record<string, string> = {
  'feature.domOverride.title': 'DOM override by picking',
  'feature.domOverride.desc':
    'Cosmetically overrides the picked element: replace text, set/remove an attribute, hide it, or inject long placeholder text. Overrides are replayed on page changes. This is NOT a network mock — only the DOM changes, no requests.',

  // «Cosmetic, not network» badge.
  'domOverride.cosmeticNote': 'Cosmetic DOM override — the network is not touched.',

  // Element picking.
  'domOverride.pick': 'Pick element',
  'domOverride.repick': 'Pick another',
  'domOverride.selector': 'Selector',
  'domOverride.pickedNone': '— none picked —',

  // Operation.
  'domOverride.section.form': 'Override setup',
  'domOverride.op.label': 'Operation',
  'domOverride.op.replace-text': 'Replace text',
  'domOverride.op.set-attribute': 'Set attribute',
  'domOverride.op.remove-attribute': 'Remove attribute',
  'domOverride.op.hide': 'Hide element',
  'domOverride.op.inject-content': 'Inject long text',

  // Operation form fields.
  'domOverride.field.text': 'Text',
  'domOverride.field.attrName': 'Attribute name',
  'domOverride.field.attrValue': 'Attribute value',
  'domOverride.field.injectText': 'Seed unit',
  'domOverride.field.injectPlaceholder': 'e.g. Lorem ipsum dolor sit amet',
  'domOverride.field.repeat': 'Repeats',

  // Actions.
  'domOverride.add': 'Apply override',
  'domOverride.update': 'Update override',
  'domOverride.clearAll': 'Clear all',
  'domOverride.cancel': 'Cancel',
  'domOverride.remove': 'Remove',
  'domOverride.active.enabled': 'Enabled',

  // Active overrides list.
  'domOverride.active.title': 'Active overrides',
  'domOverride.active.empty': 'No overrides yet — pick an element and apply an operation.',

  // Status.
  'domOverride.status.applied': 'Overrides applied: {count}',

  // Errors.
  'domOverride.error.pickFirst': 'Pick an element on the page first.',
  'domOverride.error.invalidOp': 'Invalid operation: {reasons}',
  'domOverride.error.permissionDenied': 'Page access was denied. Grant it to apply overrides.',
  'domOverride.error.noTab': 'Could not determine the active tab.',
  'domOverride.error.cancelled': 'Picking cancelled.',
  'domOverride.error.generic': 'Something went wrong. Please try again.',

  // Operation invalidity reasons.
  'domOverride.reason.attr-name-empty': 'attribute name is empty',
  'domOverride.reason.attr-name-invalid': 'invalid attribute name',
  'domOverride.reason.repeat-invalid': 'repeat count must be positive',

  // — v3 redesign (Edit page content screen) —
  'feature.domOverride.intro':
    'Change how the page looks without touching the server: edit text, hide blocks, test long content.',
  'domOverride.pickCta': 'Pick an element',
  'domOverride.picking': 'Click an element on the page…',
  'domOverride.act.text': 'Change text',
  'domOverride.act.long': 'Very long text',
  'domOverride.act.hide': 'Hide',
  'domOverride.act.empty': 'Make empty',
  'domOverride.act.label': 'What to change',
  'domOverride.field.newText': 'New text',
  'domOverride.applyCta': 'Apply',
  'domOverride.changes.title': 'Active changes',
  'domOverride.changes.empty': 'No changes yet',
  'domOverride.changes.note':
    'Changes come back when you reload the page. Only what you picked is touched.',
  'domOverride.changes.clearAll': 'Clear all',
  'domOverride.desc.textPrefix': 'text → ',
  'domOverride.desc.emptied': 'emptied',
  'domOverride.desc.hidden': 'hidden',
  'domOverride.desc.long': 'long text',
  'domOverride.status.mirror': '{n} changes',
};

export default en;
