// English strings for the «Environment emulation» feature (TASK-019).
const en: Record<string, string> = {
  'feature.environment.title': 'Environment emulation',
  'feature.environment.desc':
    'Overrides the active tab’s User-Agent, language, timezone and geolocation, and edits query flags in the URL. Handy for testing localization, geo logic and feature flags without switching devices.',

  // Master toggle and global actions.
  'environment.master.label': 'Emulation enabled',
  'environment.apply': 'Apply',
  'environment.clearAll': 'Clear all',

  // v3 redesign — per-channel cards, site line, summary.
  'environment.currentTab': '· current tab',
  'environment.channel.ua': 'Device (User-Agent)',
  'environment.channel.lang': 'Language',
  'environment.channel.geo': 'Location',
  'environment.channel.tz': 'Time zone',
  'environment.channel.flags': 'Feature flags in URL',
  'environment.offReal': 'Off — real value',
  'environment.allOff': 'Turn all off',
  'environment.summary': '{count} emulations on for this tab',
  'environment.toolStatus': '{count} active',
  'environment.geo.deny': 'Access denied',
  'environment.tzNote':
    'JavaScript dates change; the browser engine may still use your real zone in places.',
  'environment.footerNote':
    'Only this tab is affected. Turning a switch off restores the real value.',

  // Status line.
  'environment.status.on': 'Emulation active',
  'environment.status.off': 'Emulation off',
  'environment.status.applying': 'Applying…',

  // Active overrides summary.
  'environment.overrides.label': 'Active overrides:',
  'environment.overrides.none': 'Nothing overridden',
  'environment.overrides.ua': 'User-Agent',
  'environment.overrides.lang': 'Language',
  'environment.overrides.tz': 'Timezone',
  'environment.overrides.geo': 'Geolocation',
  'environment.overrides.flags': 'Flags: {count}',

  // Section titles.
  'environment.section.ua': 'User-Agent',
  'environment.section.lang': 'Accept-Language',
  'environment.section.tz': 'Timezone',
  'environment.section.geo': 'Geolocation',
  'environment.section.flags': 'Query flags',

  // User-Agent presets.
  'environment.ua.preset.chromeWin': 'Chrome · Windows',
  'environment.ua.preset.safariMac': 'Safari · macOS',
  'environment.ua.preset.safariIos': 'Safari · iOS',
  'environment.ua.preset.chromeAndroid': 'Chrome · Android',
  'environment.ua.preset.googlebot': 'Googlebot',

  // User-Agent controls.
  'environment.ua.select.label': 'User-Agent preset',
  'environment.ua.input.label': 'User-Agent string',
  'environment.ua.input.placeholder': 'Custom User-Agent string',
  'environment.ua.none': '— no override —',
  'environment.ua.custom': 'Custom string',
  'environment.ua.invalid': 'Invalid User-Agent string.',

  // Language presets.
  'environment.lang.preset.enUs': 'English (US)',
  'environment.lang.preset.ruRu': 'Russian (Russia)',
  'environment.lang.preset.deDe': 'German (Germany)',
  'environment.lang.preset.frFr': 'French (France)',
  'environment.lang.preset.jaJp': 'Japanese (Japan)',

  // Accept-Language controls.
  'environment.lang.select.label': 'Language preset',
  'environment.lang.input.label': 'Accept-Language value',
  'environment.lang.input.placeholder': 'e.g. fr-FR,fr;q=0.9,en;q=0.8',
  'environment.lang.none': '— no override —',
  'environment.lang.custom': 'Custom value',
  'environment.lang.invalid': 'Invalid Accept-Language value.',

  // Timezone presets.
  'environment.tz.preset.utc': 'UTC',
  'environment.tz.preset.la': 'Los Angeles',
  'environment.tz.preset.ny': 'New York',
  'environment.tz.preset.london': 'London',
  'environment.tz.preset.paris': 'Paris',
  'environment.tz.preset.moscow': 'Moscow',
  'environment.tz.preset.tokyo': 'Tokyo',

  // Timezone controls.
  'environment.tz.select.label': 'Timezone preset',
  'environment.tz.input.label': 'IANA timezone',
  'environment.tz.input.placeholder': 'e.g. Europe/Paris',
  'environment.tz.none': '— no override —',
  'environment.tz.custom': 'Custom timezone',
  'environment.tz.invalid': 'Unknown IANA timezone.',

  // Geolocation presets.
  'environment.geo.preset.sf': 'San Francisco',
  'environment.geo.preset.ny': 'New York',
  'environment.geo.preset.london': 'London',
  'environment.geo.preset.paris': 'Paris',
  'environment.geo.preset.moscow': 'Moscow',
  'environment.geo.preset.tokyo': 'Tokyo',

  // Geolocation controls.
  'environment.geo.mode.label': 'Mode',
  'environment.geo.mode.off': 'No override',
  'environment.geo.mode.coords': 'Coordinates',
  'environment.geo.mode.error': 'Error',
  'environment.geo.preset.label': 'City',
  'environment.geo.preset.none': '— choose —',
  'environment.geo.latitude': 'Latitude',
  'environment.geo.longitude': 'Longitude',
  'environment.geo.accuracy': 'Accuracy, m',
  'environment.geo.latitude.invalid': 'Latitude must be between −90 and 90.',
  'environment.geo.longitude.invalid': 'Longitude must be between −180 and 180.',
  'environment.geo.accuracy.invalid': 'Accuracy must be a non-negative number.',
  'environment.geo.errorCode.label': 'Error code',
  'environment.geo.errorCode.denied': '1 — permission denied',
  'environment.geo.errorCode.unavailable': '2 — position unavailable',
  'environment.geo.errorCode.timeout': '3 — timeout',

  // Query flags.
  'environment.flags.key': 'Key',
  'environment.flags.value': 'Value',
  'environment.flags.enabled': 'Enabled',
  'environment.flags.keyPlaceholder': 'e.g. feature',
  'environment.flags.valuePlaceholder': 'e.g. on',
  'environment.flags.add': 'Add flag',
  'environment.flags.remove': 'Remove flag',
  'environment.flags.apply': 'Apply to URL',
  'environment.flags.empty': 'No flags yet — add the first one.',
  'environment.flags.applied': 'Tab URL updated.',

  // Errors.
  'environment.error.permissionDenied':
    'Page access was denied. Grant it to override the environment.',
  'environment.error.noTab': 'Could not determine the active tab.',
  'environment.error.noUrl': 'Could not read the active tab’s URL.',
  'environment.error.generic': 'Something went wrong. Please try again.',
};

export default en;
