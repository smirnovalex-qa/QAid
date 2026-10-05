/** Localization catalog for the «Bug-state export» feature (TASK-025) — English. */
export default {
  'feature.bugReport.title': 'Bug-state export',
  'bugReport.desc':
    'Capture the active tab’s bug state into a private Markdown + JSON artifact for your tracker. Nothing is sent anywhere.',

  'bugReport.loading': 'Loading…',

  'bugReport.note.title.label': 'Title',
  'bugReport.note.title.placeholder': 'Short summary of the bug',
  'bugReport.note.steps.label': 'Steps to reproduce',
  'bugReport.note.steps.placeholder': '1. …\n2. …\nExpected / actual',

  'bugReport.sections.legend': 'Sections to include',
  'bugReport.section.environment': 'Environment (UA, viewport, locale, time)',
  'bugReport.section.storage': 'Cookies and storage',
  'bugReport.section.console': 'Console errors/warnings',
  'bugReport.section.network': 'Network summary',
  'bugReport.section.timeline': 'Action timeline (steps to reproduce)',
  'bugReport.section.note': 'Reproduction note',
  'bugReport.section.storage.warning':
    'Storage and cookies may contain secrets (tokens, session ids). Off by default — include consciously; consider masking.',

  'bugReport.mask.label': 'Hide passwords and tokens',
  'bugReport.mask.hint': 'Replaces cookie values, secret-looking storage values and URL tokens.',

  'bugReport.console.arm': 'Arm console capture',
  'bugReport.console.disarm': 'Disarm console capture',
  'bugReport.console.armed': 'Console capture is armed — reproduce the bug, then capture.',
  'bugReport.console.notArmed':
    'Console capture is off — arm it before reproducing to collect logs.',

  'bugReport.network.arm': 'Record network requests',
  'bugReport.network.disarm': 'Stop recording network',
  'bugReport.network.armed': 'Network recording is on — reproduce the bug, then capture.',
  'bugReport.network.notArmed':
    'Network recording is off — turn it on before reproducing (fetch/XHR are only logged while it is on). Coexists with Mock Network.',

  'bugReport.timeline.legend': 'Record steps to reproduce (auto)',
  'bugReport.timeline.start': 'Start recording',
  'bugReport.timeline.stop': 'Stop recording',
  'bugReport.timeline.pause': 'Pause',
  'bugReport.timeline.resume': 'Resume',
  'bugReport.timeline.reset': 'Reset',
  'bugReport.timeline.recording': 'Recording — reproduce the bug, then capture.',
  'bugReport.timeline.paused': 'Recording paused.',
  'bugReport.timeline.notRecording': 'Recording is off — start it before reproducing.',
  'bugReport.timeline.maskInputs.label': 'Mask input values (passwords always hidden)',
  'bugReport.timeline.limit.label': 'Buffer event limit (max 200)',
  'bugReport.timeline.hint':
    'Only significant actions (click/input/submit/navigation/gestures/resize) of the top document are recorded; iframes are not covered. Input values are masked; selectors and text hints may contain sensitive data — review before export. The timeline is attached only when its section is checked.',

  'bugReport.preview.label': 'Preview (Markdown)',
  'bugReport.empty': 'No snapshot yet — fill the note, pick sections and capture.',
  'bugReport.copy': 'Copy Markdown',
  'bugReport.download': 'Download…',
  'bugReport.download.prompt': 'Download the artifact as a .md file to your disk?',
  'bugReport.download.confirm': 'Download',
  'bugReport.download.cancel': 'Cancel',

  'bugReport.captured': 'Bug state captured',
  'bugReport.downloaded': 'Artifact downloaded',
  'bugReport.error.permission': 'Injection permission was declined.',
  'bugReport.error.noTab': 'No active tab.',
  'bugReport.error.generic': 'Could not capture the bug state.',

  // — Phased handoff flow (v3 Capture redesign) —
  'bugReport.intro':
    'Press Start, repeat the problem on the page, then come back. Technical details are collected for you.',
  'bugReport.arm': 'Start bug capture',
  'bugReport.skip': 'Bug already happened?',
  'bugReport.skipHelp': 'Create a report from what is on the page now',
  'bugReport.collects': 'Collects',
  'bugReport.none': 'nothing',
  'bugReport.change': 'Change',
  'bugReport.hide': 'Hide',
  'bugReport.privacy':
    'Nothing is sent anywhere automatically. You choose what goes into the report.',

  // Capture channels (collapsible list).
  'bugReport.channel.steps': 'Clicks and steps',
  'bugReport.channel.steps.help': 'What you clicked, typed and opened',
  'bugReport.channel.console': 'Page errors',
  'bugReport.channel.console.help': 'Errors and warnings from the console',
  'bugReport.channel.network': 'Network requests',
  'bugReport.channel.network.help': 'Taken from “Mock requests” if it is on',
  'bugReport.channel.environment': 'Browser and device',
  'bugReport.channel.environment.help': 'Version, screen size, language, time',
  'bugReport.channel.screenshot': 'Screenshot',
  'bugReport.channel.screenshot.help': 'How the page looked',
  'bugReport.channel.storage.help': 'May contain passwords and tokens',
  'bugReport.channel.dom': 'Page code (HTML)',
  'bugReport.channel.dom.help': 'Structure of the elements',

  // Armed session.
  'bugReport.capturing': 'Capturing',
  'bugReport.reproduceHint':
    'Go to the page and repeat what causes the bug. You can close this panel — the capture keeps going.',
  'bugReport.capture': 'Done — create report',
  'bugReport.cancel': 'Cancel',
  'bugReport.armed.actions': 'actions',
  'bugReport.armed.errors': 'errors',
  'bugReport.armed.requests': 'requests',
  'bugReport.count.steps': 'steps',
  'bugReport.count.console': 'console',
  'bugReport.count.requests': 'requests',

  // Captured report.
  'bugReport.newCapture': 'New capture',
  'bugReport.newReport': 'New',
  'bugReport.whatHappened': 'What happened',
  'bugReport.attached': 'Attached — tap to remove',
  'bugReport.att.actions': 'actions',
  'bugReport.att.errors': 'errors',
  'bugReport.att.requests': 'requests',
  'bugReport.att.env': 'Browser',
  'bugReport.att.screenshot': 'Screenshot',
  'bugReport.att.storage': 'Cookies',
  'bugReport.att.dom': 'HTML',
  'bugReport.secretWarn': 'Cookies may include login tokens. Keep “Hide passwords and tokens” on.',
  'bugReport.capturedBadge': 'captured',
  'bugReport.clip.sub': 'paste anywhere',
  'bugReport.sent.didntOpen': 'Didn’t open?',
  'bugReport.sent.openSuffix': ' is open. Press Enter there to start.',
  'bugReport.downloadShot': 'Download screenshot',

  // Send card.
  'bugReport.send.legend': 'Send to an AI assistant',
  'bugReport.send.sendPrefix': 'Send to ',
  'bugReport.send.sentPrefix': '✓ Sent to ',
  'bugReport.send.opening': 'Opening…',
  'bugReport.send.or': 'Or:',
  'bugReport.copyAsText': 'Copy as text',
  'bugReport.downloadFile': 'Download file',

  // Project collapsible.
  'bugReport.project': 'Project',
  'bugReport.repoLabel': 'Repository',
  'bugReport.folderLabel': 'Project folder on this computer',
  'bugReport.projNote': 'Lets the assistant open the right project. Set once.',

  // Status pill (shell).
  'bugReport.status.capturing': 'capturing',
  'bugReport.status.reportReady': 'report ready',

  // Prefilled note template.
  'bugReport.template.title': 'Checkout button does nothing on click',
  'bugReport.template.body':
    '1. Open /checkout with an item in the cart\n2. Click "Place order"\n\nExpected: go to payment.\nActual: nothing happens.',

  'bugReport.projectOptions': 'Project target & options',
  'bugReport.include': 'Include sections',
  'bugReport.chip.steps': 'Steps',
  'bugReport.chip.console': 'Console',
  'bugReport.chip.network': 'Network',
  'bugReport.chip.storage': 'Storage',
  'bugReport.chip.environment': 'Env',
  'bugReport.chip.screenshot': 'Shot',
  'bugReport.privacyNote':
    'Only selected sections are sent. Nothing hits the network — the deep link opens the agent locally, the full report is written to the repo.',

  // — Agent handoff (TASK-040) —
  'bugReport.handoff.legend': 'Send to agent',
  'bugReport.handoff.consent':
    'Only the sections you selected (with masking) are handed over — locally, nothing is sent to any network. The agent opens with the prompt pre-typed; you press Enter yourself.',
  'bugReport.handoff.target.label': 'Destination',
  'bugReport.handoff.send': 'Send to agent',
  'bugReport.handoff.needArtifact': 'Capture the bug state first, then send it to an agent.',

  'bugReport.handoff.target.clipboard': 'Clipboard (prompt)',
  'bugReport.handoff.target.projectFolder': 'Project folder (full artifact)',

  'bugReport.handoff.msg.copied': 'Prompt copied — paste it into your agent.',
  'bugReport.handoff.msg.copyFailed': 'Could not copy to the clipboard.',
  'bugReport.handoff.msg.fsUnavailable':
    'File System Access is unavailable here — copy the artifact instead.',
  'bugReport.handoff.msg.written': 'Saved to {path} — open it from your agent.',

  'bugReport.handoff.fallback.copyFull': 'Copy full report',
  'bugReport.handoff.fallback.copyPrompt': 'Copy prompt',

  'bugReport.handoff.fs.noDir': 'No project folder chosen yet — pick one first.',
  'bugReport.handoff.fs.denied': 'Write access to the folder was declined.',
  'bugReport.handoff.fs.failed': 'Could not write the artifact to the folder.',

  'bugReport.handoff.project.legend': 'Project target (for deep links)',
  'bugReport.handoff.project.hint':
    'A folder handle does not expose its absolute path, so set the repo/path once. Prefer repo — the agent resolves it to a local clone. If you set an absolute cwd, it must already exist on disk — the terminal variant opens Claude Code there, and a missing path makes the window close instantly. On Windows the “desktop app” variant is the most robust: it opens the Claude GUI (no Windows Terminal needed) and uses the absolute path as its working folder; leave repo/cwd empty to open in the default folder.',
  'bugReport.handoff.project.repo.label': 'Repository (owner/name)',
  'bugReport.handoff.project.repo.placeholder': 'acme/webapp',
  'bugReport.handoff.project.repo.invalid':
    'Use the “owner/name” form (e.g. acme/webapp), or leave empty. Claude Code opens without it.',
  'bugReport.handoff.project.cwd.label': 'Absolute path (optional)',
  'bugReport.handoff.project.cwd.placeholder': '/home/me/projects/webapp',
  'bugReport.handoff.project.cwd.invalid':
    'Must be an absolute path (e.g. C:\\Users\\me\\webapp or /home/me/webapp), no “..”. Required for Cursor.',
  'bugReport.handoff.project.pick': 'Choose project folder…',
  'bugReport.handoff.project.pickHint':
    'Folder picking is reliable in the side panel — in the popup the OS dialog closes the window. Pick your repository root so the report lands at <repo>/.qanvil/bug-reports/latest.md.',
  'bugReport.handoff.project.pickedOn': 'Project folder selected',
  'bugReport.handoff.project.pickedOff': 'No project folder selected',
  'bugReport.handoff.project.forget': 'Forget folder',
  'bugReport.handoff.includeJson.label': 'Include full JSON in the prompt',
  'bugReport.handoff.promptLimit.label': 'Prompt limit (chars)',

  // — Agent targets (TASK-043/044/045) —
  'bugReport.handoff.target.claudeCode': 'Claude Code (terminal)',
  'bugReport.handoff.target.claudeCodeDesktop': 'Claude Code (desktop app)',
  'bugReport.handoff.target.claudeCodeVscode': 'Claude Code (VS Code)',
  'bugReport.handoff.target.cursor': 'Cursor',
  'bugReport.handoff.target.codex': 'Codex',

  'bugReport.handoff.claudeCode.opened':
    'Claude Code is opening — press Enter in its input to run.',
  'bugReport.handoff.claudeCode.openedDesktop':
    'Opening the Claude desktop app with the prompt — press Enter in the Code composer to run.',
  'bugReport.handoff.claudeCode.openedVscode':
    'Opening in VS Code — press Enter in the Claude Code input.',
  'bugReport.handoff.claudeCode.openedNoTarget':
    'Claude Code is opening with the prompt. Your repo/cwd was invalid and ignored — fix it in “Project target” to open inside your project.',
  'bugReport.handoff.claudeCode.needTarget':
    'Set a repo (owner/name) or absolute path in Project target so the agent opens in your project.',
  'bugReport.handoff.cursor.opened':
    'Cursor is opening the report file — reference it with @file in Cursor Chat.',
  'bugReport.handoff.cursor.needPath':
    'cursor://file needs an absolute path — set the project path (cwd) above, or use a copy option below.',
  'bugReport.handoff.codex.opened': 'Codex is opening with the prompt — press Enter to run.',
  'bugReport.handoff.msg.deepLinkFailed':
    'Could not build the deep link — use a copy option below.',

  'bugReport.handoff.fallback.copyCommand': 'Copy shell command',
  'bugReport.handoff.fallback.copyFilePath': 'Copy @file path',

  // — Auto-discovery (TASK-042) —
  'bugReport.discovery.legend': 'Agent auto-discovery (optional)',
  'bugReport.discovery.intro':
    'Generate rule files and MCP config so the agent finds reports on its own (“fix the last bug” without a path). Optional — the deep link + file already work.',
  'bugReport.discovery.rule.heading': 'Rule file — {file}',
  'bugReport.discovery.mcp.heading': 'MCP config — {file}',
  'bugReport.discovery.write': 'Write to project',
  'bugReport.discovery.copy': 'Copy',
  'bugReport.discovery.wrote': 'Written to {path}',
  'bugReport.discovery.writeFailed': 'Could not write to the project folder.',
  'bugReport.discovery.copied': 'Copied to clipboard',
  'bugReport.discovery.needDir':
    'Choose a project folder above to write files (copy always works).',
  'bugReport.discovery.mcpNote':
    'The MCP path needs Node/npx and is optional. The Codex config lives in ~/.codex — copy only.',
  'bugReport.discovery.pathNote':
    'Set the project path (cwd) above to fill the absolute MCP path; otherwise a <path> placeholder is shown.',
};
