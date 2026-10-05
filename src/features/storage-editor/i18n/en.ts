// English strings for the «Browser state: storage/cookies editor» feature (TASK-017).
const en: Record<string, string> = {
  'feature.storageEditor.title': 'Storage & cookies',
  'feature.storageEditor.desc':
    'View, edit and delete cookies, localStorage and sessionStorage for the active tab. Export or import a snapshot, or wipe the domain state in one click.',

  'storage.tab.cookies': 'Cookies',
  'storage.tab.local': 'Local storage',
  'storage.tab.session': 'Session storage',
  'storage.tab.indexeddb': 'IndexedDB',
  'storage.tab.cache': 'Cache Storage',

  'storage.currentTab': '· current tab',
  'storage.load': 'Load',
  'storage.reload': 'Reload',
  'storage.cancel': 'Cancel',
  'storage.origin': 'Origin',
  'storage.domain': 'Domain',
  'storage.search': 'Filter by key',
  'storage.searchCookie': 'Filter by name',

  'storage.empty': 'Nothing loaded yet — click Load.',
  'storage.noEntries': 'No entries for this area.',
  'storage.noCookies': 'No cookies for this domain.',
  'storage.noResults': 'Nothing matches the current filter.',

  'storage.key': 'Key',
  'storage.value': 'Value',
  'storage.name': 'Name',
  'storage.path': 'Path',
  'storage.expires': 'Expires',
  'storage.sameSite': 'SameSite',
  'storage.secure': 'Secure',
  'storage.httpOnly': 'HttpOnly',
  'storage.session': 'Session',
  'storage.attributes': 'Attributes',

  'storage.add': 'Add',
  'storage.addEntry': 'Add entry',
  'storage.addCookie': 'Add cookie',
  'storage.save': 'Save',
  'storage.remove': 'Delete',
  'storage.copy': 'Copy',
  'storage.prettyJson': 'Format JSON',

  // Redesign — browse/edit cards
  'storage.add.key': 'Key',
  'storage.add.record': 'Record',
  'storage.add.cookie': 'Cookie',
  'storage.newKey': 'Key',
  'storage.newKey.cookie': 'Cookie name',
  'storage.keyPlaceholder': 'my.key',
  'storage.keyPlaceholder.cookie': 'session_id',
  'storage.valuePlaceholder': 'string or JSON…',
  'storage.responseBody': 'Response body',
  'storage.wipeAll': 'Clear all',
  'storage.emptyFilter': 'Nothing matches your filter',
  'storage.emptyAdd': 'Empty — add your first entry',
  'storage.summary.keys': 'keys',
  'storage.summary.cookies': 'cookies',
  'storage.summary.records': 'records',
  'storage.summary.responses': 'responses',

  'storage.clearArea': 'Clear area',
  'storage.clearCookies': 'Clear cookies',
  'storage.quickWipe': 'Quick wipe',
  'storage.quickWipeHint': 'Clear localStorage, sessionStorage and cookies for this domain.',

  // Redesign — two-step "clear all data for this site"
  'storage.clearAll': 'Clear all data for this site',
  'storage.clearAllConfirm': 'Yes, clear all site data',
  'storage.clearWarn':
    'Deletes cookies, storage, IndexedDB and cache for this site. You will be logged out.',
  'storage.wipeToast': 'Deleted {count} items.',

  // Redesign — snapshot grid (export / import)
  'storage.snapshotSave': 'Save snapshot',
  'storage.snapshotLoad': 'Load snapshot',

  'storage.export': 'Export snapshot',
  'storage.import': 'Import snapshot',
  'storage.importPlaceholder': 'Paste an exported snapshot (JSON) here…',
  'storage.importPreview': 'Preview import',
  'storage.importApply': 'Apply import',
  'storage.importInvalid': 'Not a valid snapshot (JSON).',
  'storage.diff': 'Adds {added}, changes {changed}, {removed} not in import',

  'storage.confirm': 'Confirm',
  'storage.confirmWipe':
    'Delete ALL localStorage, sessionStorage and cookies for this domain? This cannot be undone.',
  'storage.confirmClearArea': 'Delete every entry in this area? This cannot be undone.',
  'storage.confirmClearCookies': 'Delete every cookie for this domain? This cannot be undone.',
  'storage.confirmImport': 'Apply this snapshot to the current tab?',

  'storage.report.wiped': 'Wiped {count} entries.',
  'storage.report.cleared': 'Cleared {count} entries.',
  'storage.report.removed': 'Deleted.',
  'storage.report.saved': 'Saved.',
  'storage.report.imported': 'Imported {count} entries.',

  'storage.httpOnlyNote': 'HttpOnly cookies are editable here — unavailable to page JS.',
  'storage.cookiesDenied':
    'Cookie access was declined. Grant the “cookies” permission to view and edit cookies. Storage tabs keep working.',
  'storage.grantCookies': 'Grant cookie access',

  'storage.error.permissionDenied': 'Access to pages was declined. Grant it to read tab storage.',
  'storage.error.noTab': 'Could not read this tab (privileged or restricted page).',
  'storage.error.invalidCookie': 'Cookie attributes are invalid: {reasons}.',
  'storage.error.generic': 'Something went wrong. Please try again.',

  // IndexedDB (TASK-031)
  'storage.idb.noDatabases': 'No IndexedDB databases for this domain.',
  'storage.idb.noStores': 'This database has no object stores.',
  'storage.idb.noRecords': 'No records in this store.',
  'storage.idb.keyPath': 'Key',
  'storage.idb.truncated': 'Data truncated by budget — editing is disabled for truncated records.',
  'storage.idb.deleteDb': 'Delete database',
  'storage.idb.clearStore': 'Clear store',
  'storage.idb.wipe': 'Clear all IndexedDB',
  'storage.idb.wipeHint': 'Delete every IndexedDB database for this domain.',
  'storage.idb.badValue': 'Value must be valid JSON.',
  'storage.idb.confirmDeleteDb': 'Delete the entire “{db}” database? This cannot be undone.',
  'storage.idb.confirmClearStore': 'Clear every record in store “{store}”? This cannot be undone.',
  'storage.idb.confirmWipe':
    'Delete ALL IndexedDB databases for this domain? This cannot be undone.',

  // Cache Storage (TASK-031)
  'storage.cache.noCaches': 'No Cache Storage caches for this domain.',
  'storage.cache.noEntries': 'No entries in this cache.',
  'storage.cache.deleteCache': 'Delete cache',
  'storage.cache.wipe': 'Clear all Cache Storage',
  'storage.cache.wipeHint': 'Delete every Cache Storage cache for this domain.',
  'storage.cache.confirmDeleteCache': 'Delete the entire “{cache}” cache? This cannot be undone.',
  'storage.cache.confirmWipe':
    'Delete ALL Cache Storage caches for this domain? This cannot be undone.',
  'storage.cache.omitted.binary': 'Binary body — not shown.',
  'storage.cache.omitted.too-large': 'Body too large — not shown.',
  'storage.cache.omitted.opaque': 'Opaque (cross-origin) response — body unavailable.',
  'storage.cache.omitted.empty': 'Empty body.',
  'storage.cache.omitted.error': 'Could not read the body.',
  'storage.cache.omitted.none': 'No response.',

  'storage.reason.name-empty': 'name is required',
  'storage.reason.domain-empty': 'domain is required',
  'storage.reason.path-slash': 'path must start with “/”',
  'storage.reason.samesite-invalid': 'invalid SameSite',
  'storage.reason.expires-invalid': 'invalid expiry date',
  'storage.reason.samesite-none-insecure': 'SameSite=None requires Secure',
};

export default en;
