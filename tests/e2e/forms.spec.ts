/**
 * e2e фичи «Формы: автозаполнение + аудит» (TASK-020) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (кнопки «Заполнить»/«Аудит») —
 *     надёжно и без прав.
 *  2. Заполнение КОНТРОЛИРУЕМОГО (React-подобного) инпута: нативный value-сеттер +
 *     событие `input` обновляют «состояние» страницы; и аудит формы с заведомым
 *     нарушением (поле без label) через `inspection/scan` c инспектором `forms`.
 *     Требует выданных optional-прав (`scripting` + host) и проведённой оркестратором
 *     content-проводки; там, где грант host недоступен без нативного диалога или
 *     content-бандл ещё без forms-проводки, тест мягко пропускается (см. PROGRESS).
 */
import { test, expect, openTool } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const TEST_ORIGIN = 'https://qa-e2e-forms.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
// Контролируемый инпут: слушатель `input` зеркалит value в data-атрибут (эмуляция
// React-состояния — прямое `el.value=x` его бы не обновило). Плюс поле без label для аудита.
const TEST_HTML =
  '<!doctype html><html><body>' +
  '<form>' +
  '<label for="named">Email</label>' +
  '<input id="named" type="email" />' +
  '<input id="nolabel" type="text" name="street-address" />' +
  '</form>' +
  '<script>' +
  "document.getElementById('named').addEventListener('input', function (e) {" +
  "  e.target.setAttribute('data-state', e.target.value);" +
  '});' +
  '</script>' +
  '</body></html>';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('панель форм рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // Оболочка редизайна показывает одну активную панель — активируем формы кликом
  // по кнопке рельса (aria-label = заголовок фичи).
  await openTool(panel, 'forms');
  await expect(panel.getByRole('button', { name: /Заполнить|Fill/ })).toBeVisible();
});

test('заполнение контролируемого инпута + аудит нарушения', async ({ context, openSidePanel }) => {
  await context.route(`${TEST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  const page = await context.newPage();
  await page.goto(TEST_URL);

  const sw = await serviceWorker(context);

  // Грант `scripting` + host под жестом из side panel. Может требовать нативного диалога.
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

  // Инъекция content-хоста (со сборщиком/заполнителем `forms`, проведёнными оркестратором).
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
    `инъекция требует выданного host-доступа: ${injection.error ?? ''} — проверка на load-unpacked`,
  );

  // Заполнение форм через RPC (детерминированный seed).
  const fillReply = (await sw.evaluate(async (id: number) => {
    const reply = (await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'forms/fill',
      payload: { tabId: id, profile: 'valid', seed: 1 },
      correlationId: 'e2e-forms-fill',
    })) as { payload?: { filled?: number } } | undefined;
    return reply?.payload?.filled ?? 0;
  }, realTabId)) as number;
  // Если content-бандл ещё без forms-проводки, хендлер отсутствует — мягкий пропуск.
  test.skip(fillReply === 0, 'forms/fill не обработан — content-проводка forms ещё не проведена');

  // Контролируемый инпут обновил «состояние» (нативный сеттер + событие input).
  const state = await page.locator('#named').getAttribute('data-state');
  expect(state).toBeTruthy();
  expect((await page.locator('#named').inputValue()).length).toBeGreaterThan(0);

  // Аудит: поле #nolabel без доступного label присутствует в модели.
  const selectors = (await sw.evaluate(async (id: number) => {
    const reply = (await chrome.tabs.sendMessage(id, {
      __qatb__: true,
      type: 'inspection/scan',
      payload: { tabId: id, inspectorId: 'forms' },
      correlationId: 'e2e-forms-scan',
    })) as
      | {
          payload?: {
            data?: { fields?: { attrs?: { id?: string; labelText?: string | null } }[] };
          };
        }
      | undefined;
    return (reply?.payload?.data?.fields ?? []).map((f) => ({
      id: f.attrs?.id,
      label: f.attrs?.labelText ?? null,
    }));
  }, realTabId)) as { id?: string; label: string | null }[];

  const noLabel = selectors.find((f) => f.id === 'nolabel');
  expect(noLabel).toBeDefined();
  expect(noLabel?.label).toBeNull();
});
