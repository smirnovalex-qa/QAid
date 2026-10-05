// English strings for the «WCAG contrast inspector» feature (TASK-014).
const en: Record<string, string> = {
  'feature.contrast.title': 'WCAG contrast',
  'feature.contrast.desc':
    'Scan the active tab for text/background pairs that fail WCAG 2.1 contrast (AA/AAA). Click a row to highlight the node on the page.',

  'contrast.instructions':
    'Click “Scan page” to measure text contrast across the active tab. Filtering is instant — no rescan needed.',
  'contrast.scan': 'Scan page',
  'contrast.rescan': 'Rescan',
  'contrast.cancel': 'Cancel',

  'contrast.mode': 'Scope',
  'contrast.mode.page': 'Whole page',
  'contrast.mode.element': 'Inspect element',
  'contrast.inspect': 'Inspect element',
  'contrast.reinspect': 'Pick another',

  'contrast.level': 'Level',
  'contrast.level.aa': 'AA',
  'contrast.level.aaa': 'AAA',
  'contrast.textType': 'Text',
  'contrast.textType.all': 'Any',
  'contrast.textType.normal': 'Normal',
  'contrast.textType.large': 'Large',
  'contrast.onlyFails': 'Only failures',

  // v3 «Inspect the page» — shared scan empty-state + meta bar.
  'scan.scanThis': 'Scan this page',
  'scan.scanning': 'Scanning…',
  'scan.permNote': 'The first scan asks for access to this site. Nothing on the page is changed.',
  'scan.again': 'Scan again',
  'scan.meta.contrast': '{count} text elements',

  'contrast.scanIntro':
    'Checks every visible text on the page against WCAG 2.1 and shows what is hard to read.',
  'contrast.onlyFail': 'Only problems',
  'contrast.tile.fail': 'fail',
  'contrast.tile.pass': 'pass',
  'contrast.tile.approx': 'on images',
  'contrast.badge.pass': 'Pass',
  'contrast.badge.fail': 'Fail',
  'contrast.badge.approx': 'Approx.',

  'contrast.summary': 'Passed {pass}, failed {fail} of {total}',
  'contrast.truncated': 'Showing {visited} of budget {budget} nodes',
  'contrast.empty': 'No results yet — run a scan.',
  'contrast.noResults': 'Nothing matches the current filter.',
  'contrast.results': 'Contrast violations',
  'contrast.list': 'Contrast results',

  'contrast.ratio': 'Ratio',
  'contrast.required': 'Required',
  'contrast.large': 'large',
  'contrast.approximate': 'Approx.',
  'contrast.pass': 'Pass',
  'contrast.fail': 'Fail',
  'contrast.fg': 'Text color',
  'contrast.bg': 'Background color',
  'contrast.highlightHint': 'Highlight on page',

  'contrast.export': 'Export',
  'contrast.export.plain': 'Plain',
  'contrast.export.json': 'JSON',
  'contrast.export.csv': 'CSV',
  'contrast.notFound': 'Node no longer on the page.',

  'contrast.error.permissionDenied': 'Access to pages was declined. Grant it to scan any tab.',
  'contrast.error.noTab': 'Could not determine the active tab.',
  'contrast.error.generic': 'Something went wrong. Please try again.',
};

export default en;
