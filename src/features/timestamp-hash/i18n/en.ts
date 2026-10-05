// English strings for the «Time, hash & UUID» feature (v3 design).
const en: Record<string, string> = {
  'feature.tsh.title': 'Time, hash & UUID',
  'tsh.tabs': 'Tool type',
  'tsh.tab.time': 'Time',
  'tsh.tab.hash': 'Hash',
  'tsh.tab.uuid': 'UUID',

  'tsh.clickCopy': 'click to copy',
  'tsh.copy': 'Copy',
  'tsh.copyAll': 'Copy all',
  'tsh.copiedN': 'Copied {n}',

  // Time
  'tsh.time.input': 'Unix time or date',
  'tsh.now': 'Now',
  'tsh.detect.s': 'Read as Unix seconds',
  'tsh.detect.ms': 'Read as Unix milliseconds',
  'tsh.detect.iso': 'Read as a date',
  'tsh.detect.err': 'Can’t read this value',
  'tsh.row.unixS': 'Unix, seconds',
  'tsh.row.unixMs': 'Unix, ms',
  'tsh.row.iso': 'ISO 8601 UTC',
  'tsh.row.relative': 'Relative',
  'tsh.zone.label': 'Time zone',
  'tsh.diff.title': 'Difference between two dates',
  'tsh.diff.from': 'From',
  'tsh.diff.to': 'To',
  'tsh.diff.empty': 'Enter two dates',
  'tsh.unit.d': 'd',
  'tsh.unit.h': 'h',
  'tsh.unit.m': 'm',
  'tsh.unit.s': 's',
  'tsh.unit.ms': 'ms',

  // Hash
  'tsh.hash.input': 'Text',
  'tsh.hash.algo': 'Algorithm',
  'tsh.md5.warn': 'MD5 is outdated and unsafe. Use it only to compare with old systems.',

  // UUID
  'tsh.uuid.count': 'How many',
  'tsh.uuid.generate': 'Generate UUID v4',
  'tsh.uuid.meta': '{n} UUID v4',
};

export default en;
