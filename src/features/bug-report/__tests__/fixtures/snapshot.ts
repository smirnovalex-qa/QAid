/** Тестовые части и артефакт «состояния бага» (TASK-025). */
import type {
  ArtifactParts,
  ConsoleEntry,
  EnvironmentPart,
  MetaPart,
  NetworkPart,
  NotePart,
  StorageSnapshot,
} from '../../types';

export const meta: MetaPart = {
  url: 'https://example.test/app?token=supersecretvalue123&page=2',
  title: 'Example App',
};

export const environment: EnvironmentPart = {
  userAgent: 'Mozilla/5.0 (Test) AppleWebKit/537.36',
  language: 'en-US',
  languages: ['en-US', 'en'],
  platform: 'Linux x86_64',
  viewport: { width: 1280, height: 720 },
  screen: { width: 1920, height: 1080 },
  devicePixelRatio: 2,
  locale: 'en-US',
  timeZone: 'Europe/Berlin',
  isoTime: '2026-09-05T10:00:00.000Z',
  online: true,
  cookieEnabled: true,
};

export const storage: StorageSnapshot = {
  cookies: [
    {
      name: 'session',
      value: 'abc123def456',
      domain: 'example.test',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    },
  ],
  local: [
    { key: 'theme', value: 'dark' },
    { key: 'authToken', value: 'zzz' },
    { key: 'plain', value: 'eyJhbGciOi.eyJzdWIiOiJ.abcdefghij' },
  ],
  session: [{ key: 'step', value: '1' }],
};

export const consoleEntries: ConsoleEntry[] = [
  { level: 'error', source: 'console', text: 'TypeError: x is undefined', at: 1_800_000_000_000 },
  { level: 'warn', source: 'console', text: 'deprecated api', at: 1_800_000_001_000 },
  { level: 'error', source: 'onerror', text: 'Uncaught boom\nat line 1', at: 1_800_000_002_000 },
];

export const network: NetworkPart = {
  available: true,
  total: 2,
  failed: 1,
  mocked: 1,
  entries: [
    {
      method: 'GET',
      url: 'https://api.example.test/data?apikey=abcdef123456&q=1',
      status: 200,
      mocked: true,
      source: 'fetch',
      durationMs: 12,
      error: null,
    },
    {
      method: 'POST',
      url: 'https://api.example.test/save',
      status: 500,
      mocked: false,
      source: 'xhr',
      durationMs: 40,
      error: null,
    },
  ],
};

export const note: NotePart = {
  title: 'Save button crashes',
  steps: '1. Open app\n2. Click save',
};

export const fullParts: ArtifactParts = {
  meta,
  environment,
  storage,
  console: consoleEntries,
  network,
  note,
};
