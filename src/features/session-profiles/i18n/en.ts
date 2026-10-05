// English strings for the «Session profiles: auth hot-swap» feature (TASK-047).
const en: Record<string, string> = {
  'feature.sessionProfiles.title': 'Session profiles',
  'feature.sessionProfiles.desc':
    'Save named session profiles per site and hot-swap authorization state (cookies + localStorage + sessionStorage). Local-first, secrets masked by default. One active session per site — no isolated parallel sessions.',

  // v3 redesign — site line, save, profile cards, swap confirm, vault switch
  'sessionProfiles.currentTab': '· current tab',
  'sessionProfiles.saveLogin': 'Save current login as profile',
  'sessionProfiles.saveLoginHelp': 'Saves cookies (including HttpOnly) and storage for this site.',
  'sessionProfiles.cardMeta': 'Saved {date} · {cookies} cookies, {keys} keys',
  'sessionProfiles.details': 'Details',
  'sessionProfiles.swapReload': 'Switch and reload page',
  'sessionProfiles.swap.replace': 'Replace completely (recommended)',
  'sessionProfiles.swap.replaceHelp': 'Removes the current login first, so nothing mixes',
  'sessionProfiles.swap.apply': 'Only add on top',
  'sessionProfiles.swap.applyHelp': 'Keeps current data, writes the profile over it',
  'sessionProfiles.protect': 'Protect with a password',
  'sessionProfiles.protectHelp':
    'Encrypts profiles on this computer. You’ll enter the password once per browser session.',
  'sessionProfiles.footerNote':
    'Profiles stay only on this computer and are never synced. One active login per site at a time.',

  // Toolbar / actions
  'sessionProfiles.load': 'Load',
  'sessionProfiles.reload': 'Reload',
  'sessionProfiles.cancel': 'Cancel',
  'sessionProfiles.save': 'Save',
  'sessionProfiles.confirm': 'Confirm',
  'sessionProfiles.capture': 'Capture current session',
  'sessionProfiles.create': 'Save profile',
  'sessionProfiles.switch': 'Switch',
  'sessionProfiles.edit': 'Edit',
  'sessionProfiles.duplicate': 'Duplicate',
  'sessionProfiles.delete': 'Delete',
  'sessionProfiles.export': 'Export',
  'sessionProfiles.import': 'Import profile',
  'sessionProfiles.importPreview': 'Preview import',
  'sessionProfiles.reveal': 'Reveal',
  'sessionProfiles.mask': 'Mask',

  // Fields
  'sessionProfiles.name': 'Profile name',
  'sessionProfiles.namePlaceholder': 'e.g. Admin, Guest, QA user…',
  'sessionProfiles.snapshotJson': 'Session data (JSON: cookies + storage)',
  'sessionProfiles.importPlaceholder': 'Paste an exported profile (JSON) here…',

  // Labels / sections
  'sessionProfiles.scope': 'Site',
  'sessionProfiles.active': 'Active',
  'sessionProfiles.otherSites': 'Other sites',
  'sessionProfiles.empty':
    'No profiles for this site yet — capture the current session to create one.',
  'sessionProfiles.emptyOther': 'No profiles saved for other sites.',
  'sessionProfiles.cookies': 'Cookies',
  'sessionProfiles.local': 'localStorage',
  'sessionProfiles.session': 'sessionStorage',
  'sessionProfiles.summary.cookies': '{count} cookies',
  'sessionProfiles.summary.local': '{count} local',
  'sessionProfiles.summary.session': '{count} session',

  // Swap mode
  'sessionProfiles.mode.label': 'Swap mode',
  'sessionProfiles.mode.replace': 'Replace (prune)',
  'sessionProfiles.mode.apply': 'Apply only',

  // Notes
  'sessionProfiles.localTrustNote':
    'Profiles are stored locally and unencrypted (local-trust). Anyone with access to this browser profile can read them. Enable “Protect with a master password” to encrypt them at rest.',

  // Vault — optional at-rest encryption (TASK-050)
  'sessionProfiles.vault.status.disabled': 'Encryption off',
  'sessionProfiles.vault.status.locked': '🔒 Locked',
  'sessionProfiles.vault.status.unlocked': '🔓 Unlocked',
  'sessionProfiles.vault.enable': 'Protect with a master password',
  'sessionProfiles.vault.enableConfirm': 'Enable encryption',
  'sessionProfiles.vault.lock': 'Lock',
  'sessionProfiles.vault.unlock': 'Unlock',
  'sessionProfiles.vault.disable': 'Turn off protection',
  'sessionProfiles.vault.disableConfirm': 'Turn off & decrypt',
  'sessionProfiles.vault.disableWarn':
    'This decrypts all profiles back to plain text — they will be readable again by anyone with access to this browser profile.',
  'sessionProfiles.vault.rekey': 'Re-key',
  'sessionProfiles.vault.rekeyConfirm': 'Re-key now',
  'sessionProfiles.vault.rekeyWarn':
    'This vault uses older key-derivation settings. Re-keying re-encrypts all profiles with the current parameters.',
  'sessionProfiles.vault.password': 'Master password',
  'sessionProfiles.vault.confirm': 'Confirm password',
  'sessionProfiles.vault.currentPassword': 'Current master password',
  'sessionProfiles.vault.threatNote':
    'Encrypts stored data at rest only — it protects a stolen copy of your storage, not an unlocked session. Malware or another extension on your machine, or anyone watching while the vault is unlocked, can still read your secrets, and switching a profile writes its tokens out in plain text.',
  'sessionProfiles.vault.noRecovery':
    'No recovery: if you forget the master password, the encrypted profiles cannot be restored (zero-knowledge, no backdoor).',
  'sessionProfiles.vault.autoLock': 'Auto-lock after (minutes)',
  'sessionProfiles.vault.autoLockHint': 'Between 1 and 240 minutes.',
  'sessionProfiles.vault.understand':
    'I understand there is no recovery — a forgotten password means the encrypted profiles are lost for good.',
  'sessionProfiles.vault.show': 'Show',
  'sessionProfiles.vault.hide': 'Hide',
  'sessionProfiles.vault.showPassword': 'Show password',
  'sessionProfiles.vault.hidePassword': 'Hide password',
  'sessionProfiles.vault.advanced': 'Vault options',
  'sessionProfiles.vault.lockedEmpty': 'No profiles for this site.',
  'sessionProfiles.vault.corrupt':
    'Some profiles could not be decrypted (data may be corrupted or tampered with).',
  'sessionProfiles.vault.needUnlock': 'Unlock the vault first.',
  'sessionProfiles.vault.exportWarn':
    'Export “{name}” as an UNENCRYPTED file? The copied JSON contains secrets in plain text.',
  'sessionProfiles.vault.strength.weak': 'Password strength: weak — use a longer passphrase.',
  'sessionProfiles.vault.strength.fair': 'Password strength: fair.',
  'sessionProfiles.vault.strength.strong': 'Password strength: strong.',
  'sessionProfiles.vault.report.enabled': 'Encryption enabled. Profiles are now encrypted at rest.',
  'sessionProfiles.vault.report.disabled':
    'Encryption turned off. Profiles are stored unencrypted again.',
  'sessionProfiles.vault.report.rekeyed': 'Re-keyed with current parameters.',
  'sessionProfiles.vault.report.unlocked': 'Vault unlocked.',
  'sessionProfiles.vault.report.locked': 'Vault locked.',
  'sessionProfiles.vault.err.no-vault': 'No vault is configured.',
  'sessionProfiles.vault.err.already-enabled': 'Encryption is already enabled.',
  'sessionProfiles.vault.err.wrong-password': 'Wrong password.',
  'sessionProfiles.vault.err.locked': 'The vault is locked.',
  'sessionProfiles.vault.err.decrypt-failed':
    'Decryption failed — the data may be corrupted or tampered with.',
  'sessionProfiles.vault.err.invalid-snapshot': 'Decrypted data is not a valid session snapshot.',
  'sessionProfiles.vault.err.empty': 'Enter a master password.',
  'sessionProfiles.vault.err.mismatch': 'Passwords do not match.',
  'sessionProfiles.cookiesNote':
    'Cookie access was declined — only localStorage and sessionStorage are captured and swapped. Grant the “cookies” permission to include cookies.',
  'sessionProfiles.scopeMismatch.origin':
    'This profile was saved on a different origin (same domain). Cookies will apply, but web storage belongs to another origin — apply with care.',
  'sessionProfiles.scopeMismatch.domain':
    'This profile was saved on a different site (different domain). It likely will not apply cleanly here.',

  // Confirmations
  'sessionProfiles.confirmSwap':
    'Swap the session on this tab? Predicted: {applied} written, {removed} removed. The tab will reload.',
  'sessionProfiles.confirmDelete': 'Delete the profile “{name}”? This cannot be undone.',
  'sessionProfiles.confirmImport': 'Import and save the profile “{name}”?',
  'sessionProfiles.diff': 'Adds {added}, changes {changed}, {removed} not in this profile',

  // Reports
  'sessionProfiles.report.captured': 'Captured the current session.',
  'sessionProfiles.report.swapped': 'Swapped: {applied} written, {removed} removed.',
  'sessionProfiles.report.saved': 'Saved.',
  'sessionProfiles.report.deleted': 'Deleted.',
  'sessionProfiles.report.duplicated': 'Duplicated.',
  'sessionProfiles.report.imported': 'Imported.',

  // Errors
  'sessionProfiles.error.noTab': 'Could not read this tab (privileged or restricted page).',
  'sessionProfiles.error.noScope':
    'This page is not a web site (http/https) — session profiles do not apply.',
  'sessionProfiles.error.permissionDenied':
    'Access to pages was declined. Grant it to capture and swap sessions.',
  'sessionProfiles.error.generic': 'Something went wrong. Please try again.',
  'sessionProfiles.error.invalidCookie': 'Cookie attributes are invalid: {reasons}.',
  'sessionProfiles.error.invalidSnapshot': 'Session data is not a valid snapshot (JSON).',
  'sessionProfiles.error.importInvalid': 'Not a valid session profile (JSON).',

  // Cookie validation reasons (self-contained, not shared with storage-editor)
  'sessionProfiles.reason.name-empty': 'name is required',
  'sessionProfiles.reason.domain-empty': 'domain is required',
  'sessionProfiles.reason.path-slash': 'path must start with “/”',
  'sessionProfiles.reason.samesite-invalid': 'invalid SameSite',
  'sessionProfiles.reason.expires-invalid': 'invalid expiry date',
  'sessionProfiles.reason.samesite-none-insecure': 'SameSite=None requires Secure',
};

export default en;
