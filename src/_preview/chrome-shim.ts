/**
 * DEV-ONLY. In-memory shim of the `chrome.*` surface the UI touches, so the real
 * popup/side-panel surfaces render in a plain browser tab for visual review.
 * NOT part of the extension build (not referenced by the manifest). Imported
 * FIRST by the preview entry so `chrome` exists before any lazy `chrome.*` call.
 */
import { inspectionDemo } from './inspection-demo';

const mem: Record<string, unknown> = {};

const area = {
  get(defaults?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { ...(defaults ?? {}) };
    for (const k of Object.keys(defaults ?? {})) {
      if (k in mem) out[k] = mem[k];
    }
    return Promise.resolve(out);
  },
  set(items: Record<string, unknown>): Promise<void> {
    Object.assign(mem, items);
    return Promise.resolve();
  },
  remove(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete mem[k];
    return Promise.resolve();
  },
  getBytesInUse(): Promise<number> {
    return Promise.resolve(0);
  },
};

const noopEvent = { addListener(): void {}, removeListener(): void {}, hasListener: () => false };

// DEV-ONLY: демо-ответы доменных RPC (envelope), чтобы редизайн Storage было видно
// с наполненными карточками. Отвечаем по `type`, иначе — { ok: true }.
const DAY = Math.floor(Date.now() / 1000) + 86400;
const idbStores: Record<string, unknown[]> = {
  users: [
    {
      keyText: '"u1"',
      keyDisplay: 'u1',
      value: { id: 'u1', email: 'ann@example.com' },
      truncated: false,
    },
    {
      keyText: '"u2"',
      keyDisplay: 'u2',
      value: { id: 'u2', email: 'bob@example.com' },
      truncated: false,
    },
    {
      keyText: '"u3"',
      keyDisplay: 'u3',
      value: { id: 'u3', email: 'cara@example.com' },
      truncated: false,
    },
  ],
  settings: [
    { keyText: '"theme"', keyDisplay: 'theme', value: 'dark', truncated: false },
    { keyText: '"lang"', keyDisplay: 'lang', value: 'en', truncated: false },
  ],
  assets: [{ keyText: null, keyDisplay: '#1 (Blob)', value: '⟨binary⟩', truncated: true }],
};
const storeInfo = (name: string, keyPath: string | null, count: number): unknown => ({
  name,
  keyPath,
  autoIncrement: keyPath === null,
  indexes: [],
  count,
});
function demoResponse(type: string, payload: Record<string, unknown>): unknown {
  // Инспекционные RPC (pick/navigate/collect/…) обслуживает виртуальное DOM-дерево.
  if (type.startsWith('inspection/')) {
    const demo = inspectionDemo(type, payload);
    if (demo !== undefined) return demo;
  }
  switch (type) {
    case 'storage/list':
      return payload.area === 'session'
        ? {
            origin: 'https://example.com',
            items: [
              { key: 'nav.step', value: '3' },
              { key: 'draft', value: '{"title":"Hi","open":true}' },
            ],
          }
        : {
            origin: 'https://example.com',
            items: [
              { key: 'theme', value: 'dark' },
              { key: 'feature.flags', value: '{"beta":true,"rollout":42}' },
              {
                key: 'auth.token',
                value: 'eyJhbGciOiJIUzI1Ni: very long token value here for preview',
              },
              { key: 'retries', value: '7' },
              { key: 'onboarded', value: 'true' },
            ],
          };
    case 'cookies/list':
      return {
        domain: 'example.com',
        cookies: [
          {
            name: 'session_id',
            value: 'a1b2c3d4e5',
            domain: 'example.com',
            path: '/',
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            expirationDate: DAY,
          },
          {
            name: 'consent',
            value: 'all',
            domain: 'example.com',
            path: '/',
            secure: false,
            httpOnly: false,
            sameSite: 'no_restriction',
          },
          {
            name: 'locale',
            value: 'en-US',
            domain: 'example.com',
            path: '/app',
            secure: true,
            httpOnly: false,
            sameSite: 'strict',
            expirationDate: DAY,
          },
        ],
      };
    case 'idb/list':
      return {
        origin: 'https://example.com',
        databases: [
          {
            name: 'app-db',
            version: 2,
            stores: [storeInfo('users', 'id', 3), storeInfo('settings', 'key', 2)],
          },
          { name: 'media-db', version: 1, stores: [storeInfo('assets', null, 1)] },
        ],
      };
    case 'idb/get': {
      const store = String(payload.store);
      const keyPath = store === 'assets' ? null : store === 'settings' ? 'key' : 'id';
      return {
        records: idbStores[store] ?? [],
        truncated: false,
        store: storeInfo(store, keyPath, (idbStores[store] ?? []).length),
      };
    }
    case 'cache/list':
      return {
        origin: 'https://example.com',
        caches: [
          { name: 'v1-static', count: 3 },
          { name: 'api-cache', count: 2 },
        ],
      };
    case 'cache/get':
      return {
        truncated: false,
        entries: [
          {
            reqUrl: 'https://example.com/app.js',
            reqMethod: 'GET',
            status: 200,
            statusText: 'OK',
            ok: true,
            responseType: 'basic',
            contentType: 'application/javascript',
            headers: [['content-type', 'application/javascript']],
            bodyText: 'console.log("app");',
            bodyTruncated: false,
            bodyOmitted: null,
          },
          {
            reqUrl: 'https://example.com/api/user',
            reqMethod: 'GET',
            status: 404,
            statusText: 'Not Found',
            ok: false,
            responseType: 'basic',
            contentType: 'application/json',
            headers: [['content-type', 'application/json']],
            bodyText: '{"error":"not found"}',
            bodyTruncated: false,
            bodyOmitted: null,
          },
        ],
      };
    case 'storage/clear':
    case 'cookies/clear':
    case 'idb/clear':
    case 'cache/clear':
      return { removed: 3 };
    default:
      return { ok: true };
  }
}

const chromeShim = {
  storage: {
    local: area,
    sync: area,
    session: area,
    onChanged: noopEvent,
  },
  runtime: {
    id: 'preview',
    getURL: (p: string): string => p,
    getManifest: () => ({ version: '0.0.0' }),
    onMessage: noopEvent,
    onConnect: noopEvent,
    sendMessage: (raw: unknown): Promise<unknown> => {
      const env = raw as {
        type?: string;
        payload?: Record<string, unknown>;
        correlationId?: string;
      };
      if (typeof env.type !== 'string') return Promise.resolve(undefined);
      const reply = {
        type: env.type,
        payload: demoResponse(env.type, env.payload ?? {}),
        correlationId: env.correlationId,
      };
      // DEV: реальный `inspection/pickLive` резолвится на КЛИКЕ пользователя по странице.
      // В превью кликов нет — пейсим ответы таймером, чтобы живой режим («Осматриваю…» +
      // пошаговое проваливание с пересчётом профиля) был ВИДЕН на preview.html.
      if (env.type === 'inspection/pickLive') {
        return new Promise((resolve) => setTimeout(() => resolve(reply), 1100));
      }
      return Promise.resolve(reply);
    },
    connect: () => ({ postMessage(): void {}, onMessage: noopEvent, onDisconnect: noopEvent }),
    lastError: undefined,
  },
  windows: { getCurrent: (): Promise<{ id: number }> => Promise.resolve({ id: 1 }) },
  sidePanel: { open: (): Promise<void> => Promise.resolve() },
  tabs: {
    query: (): Promise<unknown[]> =>
      Promise.resolve([{ id: 1, active: true, url: 'https://example.com/' }]),
  },
  permissions: {
    request: (): Promise<boolean> => Promise.resolve(true),
    contains: (): Promise<boolean> => Promise.resolve(true),
    onAdded: noopEvent,
    onRemoved: noopEvent,
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeShim;
// `webextension-polyfill` (используется в src/platform) промисифицирует chrome.* через
// колбэки — наш promise-based шим с этим бы завис. Плоский объект в globalThis.browser
// полифилл берёт как есть (он уже promise-based), поэтому отдаём тот же шим и туда.
(globalThis as unknown as { browser: unknown }).browser = chromeShim;
