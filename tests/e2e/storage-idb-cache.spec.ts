/**
 * e2e под-фичи «IndexedDB / Cache Storage в редакторе состояния» (TASK-031) поверх
 * собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Табы IndexedDB и Cache Storage регистрируются и рендерятся в side panel —
 *     надёжно и без прав.
 *  2. Правка IndexedDB активной вкладки применяется реально: инъекция content-хоста
 *     (с idb-мостом, проведённым оркестратором в бандл), RPC `idb/set`, затем чтение
 *     базы на странице подтверждает запись.
 *  3. Удаление записи Cache Storage применяется реально: RPC `cache/remove`, затем
 *     `caches.match` на странице подтверждает удаление.
 *
 * Пути 2–3 требуют host-грантов под жестом; где грант недоступен без нативного
 * диалога — мягкий пропуск (как в storage-editor.spec). Сквозная логика сериализации
 * покрыта юнит-тестами (`idb/logic`, `cache/logic`).
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';
import { withPermissionTimeout } from './fixtures/permission-timeout';

const TEST_ORIGIN = 'https://qa-e2e-idbcache.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body style="background:#fff"><p>idb/cache fixture</p></body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

/** Грант `scripting`+host под жестом из side panel; `false` → нет гранта (soft-skip). */
async function grantScripting(panel: import('@playwright/test').Page): Promise<boolean> {
  await panel.evaluate(() => {
    const btn = document.createElement('button');
    btn.id = '__e2e_grant__';
    btn.addEventListener('click', () => {
      void chrome.permissions
        .request({ permissions: ['scripting'], origins: ['*://*/*'] })
        .then((ok) => ((window as unknown as { __granted?: boolean }).__granted = ok))
        .catch(() => ((window as unknown as { __granted?: boolean }).__granted = false));
    });
    document.body.appendChild(btn);
  });
  await panel.locator('#__e2e_grant__').click();
  const grantRes = await withPermissionTimeout(
    () =>
      panel
        .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
          timeout: 8000,
        })
        .then(() => true),
    { label: 'permission grant', budgetMs: 6000 },
  );
  return grantRes.ok;
}

/** Инъекция инспекционного content-бандла (с idb/cache-хостами) в вкладку. */
async function inject(sw: Worker, tabId: number): Promise<boolean> {
  const res = await withPermissionTimeout(
    () =>
      sw.evaluate(async (id: number) => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: id },
            files: ['content-inspection.js'],
          });
          return { ok: true as const };
        } catch (e) {
          return { ok: false as const, error: String(e) };
        }
      }, tabId),
    { label: 'инъекция content-хоста' },
  );
  return res.ok && (res.value?.ok ?? false);
}

test('табы IndexedDB и Cache рендерятся в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'storage-editor');
  await expect(panel.getByRole('tab', { name: /IndexedDB/ })).toBeVisible();
  await expect(panel.getByRole('tab', { name: /Cache Storage/ })).toBeVisible();
});

test('правка IndexedDB применяется на странице через RPC', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  // Заводим базу 'e2e' со store 'kv' (in-line ключ 'id') на странице.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('e2e', 1);
        open.onupgradeneeded = (): void => {
          open.result.createObjectStore('kv', { keyPath: 'id' });
        };
        open.onsuccess = (): void => {
          open.result.close();
          resolve();
        };
        open.onerror = (): void => {
          reject(new Error('open failed'));
        };
      }),
  );

  const sw = await serviceWorker(context);
  const panel = await openSidePanel();
  test.skip(
    !(await grantScripting(panel)),
    'optional-права не выданы — ручная проверка (load-unpacked)',
  );

  await page.bringToFront();
  const tabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(tabId).toBeGreaterThanOrEqual(0);
  test.skip(!(await inject(sw, tabId)), 'инъекция требует host-доступа — ручная проверка');

  // Пишем запись через RPC idb/set (content-target) и читаем её на странице.
  await sw.evaluate(async (id: number) => {
    await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'idb/set',
      payload: { tabId: id, db: 'e2e', store: 'kv', value: JSON.stringify({ id: 'a', v: 1 }) },
      correlationId: 'e2e-idb-set',
    });
  }, tabId);

  const stored = await page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        const open = indexedDB.open('e2e', 1);
        open.onsuccess = (): void => {
          const tx = open.result.transaction('kv', 'readonly');
          const get = tx.objectStore('kv').get('a');
          get.onsuccess = (): void => {
            const rec = get.result as { v?: number } | undefined;
            open.result.close();
            resolve(rec?.v ?? null);
          };
          get.onerror = (): void => resolve(null);
        };
        open.onerror = (): void => resolve(null);
      }),
  );
  expect(stored).toBe(1);
});

test('удаление записи Cache Storage применяется на странице через RPC', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  // Кладём запись в кэш 'e2e' на странице.
  await page.evaluate(async (origin: string) => {
    const cache = await caches.open('e2e');
    await cache.put(
      `${origin}/x`,
      new Response('hi', { headers: { 'content-type': 'text/plain' } }),
    );
  }, TEST_ORIGIN);

  const sw = await serviceWorker(context);
  const panel = await openSidePanel();
  test.skip(
    !(await grantScripting(panel)),
    'optional-права не выданы — ручная проверка (load-unpacked)',
  );

  await page.bringToFront();
  const tabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  test.skip(!(await inject(sw, tabId)), 'инъекция требует host-доступа — ручная проверка');

  // Удаляем запись через RPC cache/remove и подтверждаем на странице.
  await sw.evaluate(
    async (args: { id: number; origin: string }) => {
      await chrome.tabs.sendMessage(args.id, {
        __qatb__: true,
        type: 'cache/remove',
        payload: { tabId: args.id, cache: 'e2e', reqUrl: `${args.origin}/x` },
        correlationId: 'e2e-cache-remove',
      });
    },
    { id: tabId, origin: TEST_ORIGIN },
  );

  const match = await page.evaluate(async (origin: string) => {
    const cache = await caches.open('e2e');
    const hit = await cache.match(`${origin}/x`);
    return hit ? 'present' : 'gone';
  }, TEST_ORIGIN);
  expect(match).toBe('gone');
});
