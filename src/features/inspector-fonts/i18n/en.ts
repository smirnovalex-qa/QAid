// English strings for the «Font inspector» feature (TASK-016).
const en: Record<string, string> = {
  'feature.fonts.title': 'Font inspector',
  'feature.fonts.desc':
    'Collect the fonts used on the active tab: families, sizes, weights and source (web font or system). Inspect a single element with the picker.',

  'fonts.scan': 'Scan page',
  'fonts.inspect': 'Inspect element',
  'fonts.cancel': 'Cancel',
  'fonts.instructions':
    'Click “Scan page” to collect every font, or “Inspect element” to pick a specific node. Press Esc to cancel picking.',
  'fonts.picked': 'Fonts collected',

  'fonts.sort': 'Sort',
  'fonts.sort.count': 'By frequency',
  'fonts.sort.name': 'By name',

  'fonts.source.web': 'web font',
  'fonts.source.local': 'system',
  'fonts.source.unknown': 'unknown',

  // v3 «Inspect the page» — shared scan empty-state + meta bar.
  'scan.scanThis': 'Scan this page',
  'scan.scanning': 'Scanning…',
  'scan.permNote': 'The first scan asks for access to this site. Nothing on the page is changed.',
  'scan.again': 'Scan again',
  'scan.meta.fonts': '{count} font families',

  'fonts.scanIntro': 'Lists the fonts the page really uses and where each one comes from.',
  'fonts.badge.web': 'Web font',
  'fonts.badge.local': 'System',
  'fonts.badge.unknown': 'Unknown',
  'fonts.sampleText': 'The quick brown fox — Съешь же ещё',
  'fonts.fontNote':
    'Samples use fonts already on your computer. The extension doesn’t download fonts.',

  'fonts.count': 'uses: {count}',
  'fonts.families': 'Families',
  'fonts.empty': 'No fonts collected yet.',
  'fonts.noText': 'No text elements found on the page.',
  'fonts.apiUnavailable':
    'The document.fonts API is unavailable — the font source cannot be determined (shown as “unknown”).',

  'fonts.sizes': 'Sizes',
  'fonts.weights': 'Weights',
  'fonts.styles': 'Styles',
  'fonts.usedIn': 'Used in',
  'fonts.highlight': 'Highlight on page',
  'fonts.notFound': 'Element not found on the page.',

  'fonts.profile': 'Element profile',
  'fonts.profile.applied': 'Applied family',
  'fonts.profile.chain': 'font-family chain',
  'fonts.profile.size': 'Size',
  'fonts.profile.weight': 'Weight',
  'fonts.profile.style': 'Style',
  'fonts.profile.lineHeight': 'Line height',
  'fonts.profile.letterSpacing': 'Letter spacing',
  'fonts.preview': 'Preview',
  'fonts.previewText': 'The quick brown fox jumps over the lazy dog 0123',

  'fonts.face.url': 'URL',
  'fonts.face.format': 'Format',
  'fonts.face.urlUnavailable': 'unavailable',

  'fonts.export.format': 'Export format',
  'fonts.export.plain': 'Text',
  'fonts.export.json': 'JSON',
  'fonts.export.csv': 'CSV',
  'fonts.export.copy': 'Copy report',

  'fonts.error.permissionDenied':
    'Access to pages was declined. Grant it to use the inspector on any tab.',
  'fonts.error.noTab': 'Could not determine the active tab.',
  'fonts.error.generic': 'Something went wrong. Please try again.',
};

export default en;
