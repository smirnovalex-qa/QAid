// English strings for the «Defect detector» feature (TASK-024).
const en: Record<string, string> = {
  'feature.defects.title': 'Defect detector',
  'feature.defects.desc':
    'Scan the active tab for common markup, accessibility and testability defects: images without alt, broken images, placeholder links, empty or duplicate data-testid, duplicate ids, nameless buttons and heading order jumps. Click a row to highlight the node on the page.',

  'defects.instructions':
    'Click “Scan page” to run every enabled detector across the active tab. Toggle rules below — results update instantly, no rescan needed.',
  'defects.scan': 'Scan page',
  'defects.rescan': 'Rescan',
  'defects.cancel': 'Cancel',

  'defects.rules': 'What to check',

  // v3 «Inspect the page» — shared scan empty-state + meta bar.
  'scan.scanThis': 'Scan this page',
  'scan.scanning': 'Scanning…',
  'scan.permNote': 'The first scan asks for access to this site. Nothing on the page is changed.',
  'scan.again': 'Scan again',
  'scan.meta.defects': '{count} issues',

  'defects.scanIntro':
    'Looks for common problems: images without alt, broken images, empty links and buttons, fields without labels.',
  'defects.filter.error': 'Errors',
  'defects.filter.warning': 'Warnings',
  'defects.filter.info': 'Tips',
  'defects.show': 'Show',
  'defects.rulesSummary': '{on} of {total} on',
  'defects.noneForFilter': 'No issues match the selected severities.',

  'defects.summary': '{errors} errors, {warnings} warnings, {infos} notes',
  'defects.total': '{total} issues',
  'defects.truncated': 'Showing {visited} of budget {budget} nodes',
  'defects.clean': 'No defects found on the page.',
  'defects.noResults': 'No defects match the enabled rules.',
  'defects.list': 'Defect findings',
  'defects.highlightHint': 'Highlight on page',
  'defects.notFound': 'Node no longer on the page.',

  'defects.severity.error': 'Error',
  'defects.severity.warning': 'Warning',
  'defects.severity.info': 'Note',

  'defects.export': 'Export',
  'defects.export.plain': 'Plain',
  'defects.export.json': 'JSON',
  'defects.export.csv': 'CSV',

  'defect.rule.imgAlt': 'Image without alt text',
  'defect.rule.imgBroken': 'Broken image (failed to load)',
  'defect.rule.buttonNoName': 'Button without an accessible name',
  'defect.rule.idDuplicate': 'Duplicate id',
  'defect.rule.testidEmpty': 'Empty data-testid',
  'defect.rule.testidDuplicate': 'Duplicate data-testid',
  'defect.rule.linkNoHref': 'Link without href',
  'defect.rule.linkJsVoid': 'Link with javascript: href',
  'defect.rule.linkHash': 'Placeholder link (href="#")',
  'defect.rule.headingOrder': 'Heading level jump',

  'defects.error.permissionDenied': 'Access to pages was declined. Grant it to scan any tab.',
  'defects.error.noTab': 'Could not determine the active tab.',
  'defects.error.generic': 'Something went wrong. Please try again.',
};

export default en;
