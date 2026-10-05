// English strings for the «Forms: autofill + audit» feature (TASK-020).
const en: Record<string, string> = {
  'feature.forms.title': 'Forms',
  'feature.forms.desc':
    'Fill forms on the active tab with realistic test data (framework events included) and audit them for accessibility and correctness. Click an issue to jump to the field.',

  'forms.instructions':
    'Pick a profile, then Fill or Clear the active tab. Run Audit to list accessibility/correctness issues — click a row to highlight the field.',

  'forms.profile': 'Profile',
  'forms.profile.valid': 'Valid',
  'forms.profile.boundary': 'Max length',
  'forms.profile.empty': 'Empty and spaces',
  'forms.profile.injection': 'Injections',
  'forms.profile.injectionHint':
    'XSS/SQL test strings — test data to verify escaping on your own environments, not an attack. Forms are never auto-submitted.',

  // v3 redesign — data-type cards, site line, fill + check
  'forms.currentTab': '· current tab',
  'forms.dataType': 'What data to fill',
  'forms.profileHelp.valid': 'Realistic names, emails, phones',
  'forms.profileHelp.boundary': 'Fills every field to its limit',
  'forms.profileHelp.empty': 'Checks required-field errors',
  'forms.profileHelp.injection': 'Tests escaping. Use only on your test servers',
  'forms.fillOnPage': 'Fill forms on this page',
  'forms.filling': 'Filling…',
  'forms.noSubmit': 'The form is not submitted — press Submit yourself.',
  'forms.checkTitle': 'Check forms for problems',
  'forms.check': 'Check',
  'forms.checkAgain': 'Check again',
  'forms.show': 'Show',
  'forms.auditHelp':
    'Finds fields without labels, missing “required”, duplicate ids and wrong field types.',

  'forms.fill': 'Fill',
  'forms.clear': 'Clear',
  'forms.audit': 'Audit',
  'forms.cancel': 'Cancel',

  'forms.filled': 'Filled {count} field(s)',
  'forms.cleared': 'Cleared {count} field(s)',

  'forms.auditSummary': 'Fields {fields} · forms {forms} · issues {issues}',
  'forms.auditCounts': 'Errors {error}, warnings {warning}',
  'forms.noIssues': 'No issues found.',
  'forms.issues': 'Audit issues',
  'forms.highlightHint': 'Highlight field on page',
  'forms.notFound': 'Field no longer on the page.',

  'forms.audit.labelMissing': 'Field has no accessible label',
  'forms.audit.requiredMissing': 'Looks required but has no required/aria-required',
  'forms.audit.duplicateId': 'Duplicate id on the page',
  'forms.audit.typeMismatch': 'Input type does not match the detected field kind',

  'forms.severity.error': 'Error',
  'forms.severity.warning': 'Warning',
  'forms.severity.info': 'Info',

  'forms.export': 'Export',
  'forms.export.plain': 'Plain',
  'forms.export.json': 'JSON',
  'forms.export.csv': 'CSV',

  'forms.error.permissionDenied': 'Access to pages was declined. Grant it to fill or audit tabs.',
  'forms.error.noTab': 'Could not determine the active tab.',
  'forms.error.generic': 'Something went wrong. Please try again.',
};

export default en;
