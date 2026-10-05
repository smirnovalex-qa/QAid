// English strings for the «Settings & presets sync» feature (TASK-029).
const en: Record<string, string> = {
  'feature.settingsSync.title': 'Settings sync',
  'feature.settingsSync.desc':
    'Carries selected settings and presets across your devices via your browser account (chrome.storage.sync). No server of ours.',

  'ss.enable': 'Enable sync',
  'ss.enabledStatus': 'Sync is on',
  'ss.disabledStatus': 'Sync is off',
  'ss.unavailable': 'Sync is unavailable in this environment — settings work locally.',

  'ss.privacyTitle': 'Privacy',
  'ss.privacyWarning':
    'Presets may contain data you entered. Secret sections (storage/cookies snapshots, logs) are never synced.',
  'ss.ack': 'I understand synced presets may contain data I entered',

  'ss.namespaces': 'What to sync',
  'ss.selectHint': 'Pick the spaces to sync. Spaces too large for the quota are disabled.',
  'ss.sensitive': 'May contain entered data',
  'ss.readonly': 'Read-only',

  'ss.syncNow': 'Sync now',
  'ss.lastSync': 'Last sync: {time}',
  'ss.never': 'never',

  'ss.conflictMarker': 'Changed on another device — resolved by last write',
  'ss.quotaExceeded': 'Does not fit the sync quota ({bytes}/{limit} B) — sync disabled',
  'ss.itemsExceeded': 'Sync item count exceeded — sync disabled',

  'ss.disableAndClear': 'Disable and clear sync',
  'ss.confirmDisable':
    'Disable sync and delete synced data from your browser account? Local settings are kept.',
  'ss.confirm': 'Confirm',
  'ss.cancel': 'Cancel',

  'ss.errorGeneric': 'Could not sync',

  'ss.status.pushed': 'pushed',
  'ss.status.pulled': 'pulled',
  'ss.status.equal': 'up to date',
  'ss.status.idle': 'no changes',
  'ss.status.conflict': 'conflict resolved',
  'ss.status.quota': 'over quota',
  'ss.status.error': 'error',
  'ss.status.unavailable': 'unavailable',

  'ss.ns.app': 'Theme, language and general settings',
  'ss.ns.random-numbers': 'Presets: random numbers',
  'ss.ns.random-strings': 'Presets: random strings',
  'ss.ns.forms': 'Presets: forms',
};

export default en;
