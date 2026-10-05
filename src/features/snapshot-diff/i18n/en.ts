// English strings for the «Snapshot-diff» feature (TASK-028).
const en: Record<string, string> = {
  'feature.snapshotDiff.title': 'DOM snapshots (before/after)',
  'feature.snapshotDiff.desc':
    'Capture serializable snapshots of the active tab’s DOM structure, key computed styles, text and attributes, then see a structured diff of two states: added, removed and changed nodes with per-property differences. Click a row to highlight the node on the page.',

  'snapshotDiff.instructions':
    'Capture state “A”, perform an action on the page, then capture “B” — the diff appears below. Filters change what is shown without recapturing.',
  'snapshotDiff.captureA': 'Capture A',
  'snapshotDiff.captureB': 'Capture B',
  'snapshotDiff.recaptureA': 'Recapture A',
  'snapshotDiff.recaptureB': 'Recapture B',
  'snapshotDiff.cancel': 'Cancel',
  'snapshotDiff.clear': 'Reset',

  'snapshotDiff.stateA': 'Snapshot A',
  'snapshotDiff.stateB': 'Snapshot B',
  'snapshotDiff.captured': '{count} nodes captured',
  'snapshotDiff.notCaptured': 'not captured',
  'snapshotDiff.truncated': 'Captured {visited} of budget {budget} nodes',
  'snapshotDiff.needBoth': 'Capture both states (A and B) to see the diff.',
  'snapshotDiff.noChanges': 'No differences between the snapshots.',
  'snapshotDiff.noneForFilter': 'No changes match the selected filter.',

  'snapshotDiff.filter': 'Filter',
  'snapshotDiff.filter.all': 'All',
  'snapshotDiff.filter.structure': 'Structure',
  'snapshotDiff.filter.styles': 'Styles',
  'snapshotDiff.filter.text': 'Text',

  // v3 «Inspect the page» — compare page states.
  'snapshotDiff.diffIntro':
    'Take a snapshot, do something on the page (e.g. submit a form), then take a second one. You’ll see exactly what changed.',
  'snapshotDiff.step1': 'Step 1',
  'snapshotDiff.step2': 'Step 2',
  'snapshotDiff.before': 'Before',
  'snapshotDiff.after': 'After',
  'snapshotDiff.tileTaken': 'Taken {time} · {count} elements',
  'snapshotDiff.tileEmpty': 'Tap to take',
  'snapshotDiff.saved': 'Snapshot saved',
  'snapshotDiff.startOver': 'Start over',
  'snapshotDiff.rowAdded': 'added',
  'snapshotDiff.rowRemoved': 'removed',

  'snapshotDiff.summary': '{added} added, {removed} removed, {changed} changed',
  'snapshotDiff.section.added': 'Added nodes',
  'snapshotDiff.section.removed': 'Removed nodes',
  'snapshotDiff.section.changed': 'Changed nodes',
  'snapshotDiff.change.text': 'text',
  'snapshotDiff.change.attr': 'attr {name}',
  'snapshotDiff.change.style': 'style {prop}',
  'snapshotDiff.empty': '∅',
  'snapshotDiff.highlightHint': 'Highlight on page',
  'snapshotDiff.notFound': 'Node no longer on the page.',

  'snapshotDiff.export': 'Export',
  'snapshotDiff.export.json': 'JSON',
  'snapshotDiff.export.markdown': 'Markdown',

  'snapshotDiff.error.permissionDenied':
    'Access to pages was declined. Grant it to capture any tab.',
  'snapshotDiff.error.noTab': 'Could not determine the active tab.',
  'snapshotDiff.error.generic': 'Something went wrong. Please try again.',
};

export default en;
