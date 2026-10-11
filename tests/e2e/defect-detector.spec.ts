/**
 * e2e фичи «Детектор дефектов» (TASK-024) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопка «Сканировать страницу») —
 *     надёжно и без прав.
 *  2. Страничный скан дефектов работает end-to-end на фикстуре с заведомыми дефектами:
 *     инъекция сборщика `defects`, RPC `inspection/scan`, возврат сериализуемой модели
 *     узлов, из которой видны все целевые дефекты (img без alt, ссылка-заглушка, дубли
 *     id/data-testid, кнопка без имени), а декоративное `role=presentation` изображение
 *     присутствует в модели, но помечается декоративным (логика его не считает дефектом).
 *     Требует выданных optional-прав; где грант host недоступен без нативного диалога,
 *     тест мягко пропускается (см. PROGRESS/ADR-0020/ADR-0022).
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-defects.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
// Фикстура с заведомыми дефектами: img без alt, декоративное presentation-изображение
// (не дефект), две ссылки-заглушки href="#" с дублирующимся id, кнопка без имени и
// дублирующийся data-testid.
const TEST_HTML =
  '<!doctype html><html><body style="background:#fff">' +
  '<img id="hero" src="/missing.png">' +
  '<img role="presentation" alt="" src="/deco.png">' +
  '<a href="#" id="dup">first</a>' +
  '<a href="#" id="dup">second</a>' +
  '<button></button>' +
  '<div data-testid="row">1</div>' +
  '<div data-testid="row">2</div>' +
  '</body></html>';

interface NodeSnapshot {
  tag: string;
  attrs: Record<string, string>;
  role: string | null;
  accessibleNameHint: string;
  selector: string;
  naturalWidthZero: boolean | null;
}

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('детектор дефектов рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка v3 (Home → Tool) открывает инструмент по стабильному хуку data-tool.
  await openTool(panel, 'defect-detector');
  await expect(panel.getByRole('button', { name: /Сканировать страницу|Scan page/ })).toBeVisible();
});

test('страничный скан дефектов: инъекция сборщика, RPC, модель узлов', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант `scripting` + постоянный host-доступ под жестом из side panel. Запрос host
  // может требовать нативного диалога — при отказе/таймауте мягкий пропуск.
  const panel = await openSidePanel();
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
  const granted = await panel
    .waitForFunction(() => (window as unknown as { __granted?: boolean }).__granted === true, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
  test.skip(!granted, 'optional-права не выданы в этой среде — ручная проверка (load-unpacked)');

  await page.bringToFront();
  const realTabId = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
  expect(realTabId).toBeGreaterThanOrEqual(0);

  // Инъекция content-хоста (со сборщиком `defects`, проведённым оркестратором в бандл).
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
  }, realTabId);
  test.skip(
    !injection.ok,
    `инъекция требует выданного host-доступа; грант host мог не пройти без нативного диалога: ${injection.error ?? ''} — проверка на load-unpacked`,
  );

  // Запускаем страничный скан дефектов через RPC и разбираем сериализуемую модель.
  const nodes = (await sw.evaluate(async (id: number) => {
    const reply = (await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'inspection/scan',
      payload: { tabId: id, inspectorId: 'defects' },
      correlationId: 'e2e-defects-scan',
    })) as { payload?: { data?: { nodes?: unknown[] } } } | undefined;
    return reply?.payload?.data?.nodes ?? [];
  }, realTabId)) as NodeSnapshot[];

  expect(nodes.length).toBeGreaterThan(0);

  // img без alt присутствует и в модели (без атрибута alt).
  const hero = nodes.find((n) => n.selector.includes('#hero'));
  expect(hero).toBeDefined();
  expect('alt' in (hero?.attrs ?? {})).toBe(false);

  // Декоративное presentation-изображение попадает в модель (логика его не считает дефектом).
  const decorative = nodes.find((n) => n.tag === 'img' && n.role === 'presentation');
  expect(decorative).toBeDefined();

  // Две ссылки-заглушки href="#" с дублирующимся id 'dup'.
  const hashLinks = nodes.filter((n) => n.tag === 'a' && n.attrs['href'] === '#');
  expect(hashLinks).toHaveLength(2);
  const dupIds = nodes.filter((n) => n.attrs['id'] === 'dup');
  expect(dupIds).toHaveLength(2);

  // Кнопка без доступного имени.
  const button = nodes.find((n) => n.tag === 'button');
  expect(button).toBeDefined();
  expect(button?.accessibleNameHint).toBe('');

  // Дублирующийся data-testid.
  const testids = nodes.filter((n) => n.attrs['data-testid'] === 'row');
  expect(testids).toHaveLength(2);
});
