/**
 * e2e фичи «Snapshot-diff» (TASK-028) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопки «Снять A/B») — надёжно
 *     и без прав.
 *  2. Сквозной путь снимка/дифа: снимок A → мутация фикстуры (смена текста +
 *     добавление узла) → снимок B → диф показывает ожидаемое изменение. Инъекция
 *     сборщика `snapshot`, RPC `inspection/scan`, возврат сериализуемой модели.
 *     Диф считается по стабильному ключу прямо в тесте (движок покрыт юнит-тестами).
 *     Требует выданных optional-прав; где грант host недоступен без нативного
 *     диалога, тест мягко пропускается (см. PROGRESS/ADR-0020/ADR-0022).
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-snapshot.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const TEST_HTML =
  '<!doctype html><html><body style="background:#fff">' +
  '<h1 id="title" data-testid="title">Before</h1>' +
  '<p data-testid="body">stable</p>' +
  '</body></html>';

interface SnapNode {
  key: string;
  tag: string;
  selector: string;
  text: string;
}

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

/** Грант scripting + host под жестом из side panel; false — если среда требует диалога. */
async function grant(panel: import('@playwright/test').Page): Promise<boolean> {
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
  return panel
    .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
}

/** Снимает страницу через RPC `inspection/scan` с inspectorId `snapshot`. */
async function scan(sw: Worker, tabId: number, correlationId: string): Promise<SnapNode[]> {
  return (await sw.evaluate(
    async ({ id, cid }: { id: number; cid: string }) => {
      const reply = (await chrome.tabs.sendMessage(id, {
        __qatb__: true,
        type: 'inspection/scan',
        payload: { tabId: id, inspectorId: 'snapshot' },
        correlationId: cid,
      })) as { payload?: { data?: { nodes?: unknown[] } } } | undefined;
      return reply?.payload?.data?.nodes ?? [];
    },
    { id: tabId, cid: correlationId },
  )) as SnapNode[];
}

test('snapshot-diff рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await panel.getByRole('button', { name: /Снимки DOM|DOM snapshots/ }).click();
  await expect(panel.getByRole('button', { name: /Снять A|Capture A/ })).toBeVisible();
});

test('снимок A → мутация → снимок B → диф показывает изменение', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  const panel = await openSidePanel();
  const granted = await grant(panel);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const tabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(tabId).toBeGreaterThanOrEqual(0);

  const injection = await sw.evaluate(async (id: number) => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: id },
        files: ['content-inspection.js'],
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, tabId);
  test.skip(
    !injection.ok,
    `инъекция требует выданного host-доступа; грант мог не пройти без нативного диалога: ${injection.error ?? ''} — проверка на load-unpacked`,
  );

  // Снимок A.
  const snapA = await scan(sw, tabId, 'e2e-snapshot-a');
  expect(snapA.length).toBeGreaterThan(0);

  // Мутация фикстуры: меняем текст заголовка и добавляем новый узел.
  await page.evaluate(() => {
    const h1 = document.querySelector('[data-testid="title"]');
    if (h1 !== null) h1.textContent = 'After';
    const p = document.createElement('p');
    p.setAttribute('data-testid', 'added');
    p.textContent = 'new node';
    document.body.appendChild(p);
  });

  // Снимок B.
  const snapB = await scan(sw, tabId, 'e2e-snapshot-b');

  // Диф по стабильному ключу: заголовок сменил текст, добавлен узел testid=added.
  const aByKey = new Map(snapA.map((n) => [n.key, n]));
  const bByKey = new Map(snapB.map((n) => [n.key, n]));

  const titleA = aByKey.get('testid=title');
  const titleB = bByKey.get('testid=title');
  expect(titleA?.text).toBe('Before');
  expect(titleB?.text).toBe('After');

  // Стабильный узел не «изменился» (нет ложной лавины).
  expect(aByKey.get('testid=body')?.text).toBe(bByKey.get('testid=body')?.text);

  // Добавленный узел есть в B, но не в A.
  expect(aByKey.has('testid=added')).toBe(false);
  expect(bByKey.has('testid=added')).toBe(true);
  expect(bByKey.get('testid=added')?.text).toBe('new node');
});
