// English strings for the «Color palette» inspector feature (TASK-015).
const en: Record<string, string> = {
  'feature.palette.title': 'Color palette',
  'feature.palette.desc':
    'Collect every color used on the page (text, background, borders, shadows, SVG), with frequency and a “where used” list. Copy as HEX/RGB/HSL, export.',

  'palette.scan': 'Scan page',
  'palette.scanning': 'Scanning…',
  'palette.cancel': 'Cancel',
  'palette.eyedropper': 'Eyedropper',
  'palette.instructions':
    'Click “Scan page” to collect the active tab’s palette. “Eyedropper” picks the colors of a single element.',

  // v3 «Inspect the page» — shared scan empty-state + meta bar.
  'scan.scanThis': 'Scan this page',
  'scan.scanning': 'Scanning…',
  'scan.permNote': 'The first scan asks for access to this site. Nothing on the page is changed.',
  'scan.again': 'Scan again',
  'scan.meta.palette': '{count} colors',

  'palette.scanIntro':
    'Collects every color used on the page — text, backgrounds, borders, shadows, icons.',
  'palette.palHint': 'Tap a color to copy it.',
  'palette.pickFromPage': 'Pick from page',
  'palette.highlight': 'Highlight on page',

  'palette.format': 'Format',
  'palette.format.hex': 'HEX',
  'palette.format.rgb': 'RGB',
  'palette.format.hsl': 'HSL',

  'palette.sort': 'Sort',
  'palette.sort.frequency': 'By frequency',
  'palette.sort.hue': 'By hue',
  'palette.sort.lightness': 'By lightness',

  'palette.export': 'Export',
  'palette.export.plain': 'Text',
  'palette.export.json': 'JSON',
  'palette.export.csv': 'CSV',
  'palette.export.output': 'Palette export',

  'palette.empty': 'The palette is empty — run a scan.',
  'palette.summary': 'Colors: {colors} · Elements: {elements}',
  'palette.count': 'Used: {count}',
  'palette.whereUsed': 'Where used',
  'palette.whereUsed.show': 'Show usage',
  'palette.whereUsed.hide': 'Hide usage',
  'palette.usage.more': '+{count} more',
  'palette.swatch.aria': 'Color {value}, used {count} times. Click to copy.',
  'palette.picked': 'Color picked with the eyedropper',

  'palette.error.permissionDenied':
    'Access to pages was declined. Grant it to collect the palette on any tab.',
  'palette.error.noTab': 'Could not determine the active tab.',
  'palette.error.eyedropper': 'Could not read a color with the eyedropper.',
  'palette.error.generic': 'Something went wrong. Please try again.',
};

export default en;
