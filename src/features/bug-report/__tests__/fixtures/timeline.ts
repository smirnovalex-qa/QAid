/** Тестовые входы/события таймлайна действий (TASK-036). */
import type { ActionRecord, ConsoleEntry, TimelineClockAnchor } from '../../types';
import type { TimelineNetworkInput } from '../../logic';

/** Якорь клоков: wall=1_800_000_010_000, perfNow=10_000 (perf.now страницы). */
export const anchor: TimelineClockAnchor = { perfNow: 10_000, wall: 1_800_000_010_000 };

/** Действия пользователя (wall-clock `at`). */
export const actions: ActionRecord[] = [
  { kind: 'click', at: 1_800_000_000_000, target: '[data-testid=open]' },
  {
    kind: 'input',
    at: 1_800_000_001_000,
    target: 'input#email',
    field: 'email',
    detail: 'value hidden',
  },
  {
    kind: 'change',
    at: 1_800_000_002_000,
    target: 'select#country',
    field: 'select',
    detail: 'value: "DE"',
  },
  { kind: 'submit', at: 1_800_000_003_000, target: 'form#login' },
  { kind: 'key', at: 1_800_000_003_500, detail: 'Enter' },
  { kind: 'navigation', at: 1_800_000_004_000, detail: 'https://x.test/next' },
  { kind: 'resize', at: 1_800_000_005_000, detail: '800×600' },
];

/** Консольные записи (wall-clock `at`). */
export const consoleEntries: ConsoleEntry[] = [
  { level: 'error', source: 'console', text: 'TypeError: boom\nat line 1', at: 1_800_000_002_500 },
];

/**
 * Сетевые входы с монотонным `startedAt` (perf.now). При `anchor` выше:
 * at = wall + (startedAt − perfNow) = 1_800_000_010_000 + (8000 − 10000) = 1_800_000_008_000.
 */
export const network: TimelineNetworkInput[] = [
  {
    method: 'GET',
    url: 'https://api.x.test/data?token=secretsecretsecret123',
    status: 200,
    mocked: true,
    durationMs: 12,
    error: null,
    startedAt: 8000,
  },
];
