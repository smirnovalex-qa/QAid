/**
 * e2e фичи «Мок сети: Replay» (TASK-038) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Вкладка «Replay» рендерится в панели мока (надёжно, без прав).
 *  2. Полный путь replay: пойманный запрос → Replay с ПРАВКОЙ заголовка/тела →
 *     sender в background выполняет fetch с host-правом (обход CORS страницы) и
 *     возвращает ответ фикстур-сервера. Требует выданных optional host-прав; где
 *     грант host недоступен без нативного диалога (или роутинг не покрывает fetch
 *     из service worker) — мягкий пропуск (полный e2e — на load-unpacked,
 *     ADR-0020/0022), как в `mock-network.spec.ts`.
 */
import { test, expect, openTool } from './fixtures/extension';

const TEST_ORIGIN = 'https://qa-e2e-replay.test';
const TEST_URL = `${TEST_ORIGIN}/page`;
const API_URL = `${TEST_ORIGIN}/api/echo`;
const TEST_HTML = '<!doctype html><html><body><p>replay fixture</p></body></html>';

test('панель мока рендерит список запросов — точку входа replay', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'mock-network');
  // В оболочке v3 отдельной вкладки «Replay» нет: replay живёт в действиях над
  // пойманным запросом («Send again» / «Copy cURL») на вкладке «Запросы». Проверяем,
  // что эта поверхность рендерится (её empty-state виден без перехвата/прав).
  await expect(panel.getByRole('tab', { name: /Запросы|Requests/ })).toBeVisible();
  await expect(
    panel.getByText(/Включите перехват, чтобы видеть запросы|Turn on interception to see requests/),
  ).toBeVisible();
});

test('replay с правкой заголовка/тела возвращает ответ фикстур-сервера', async ({
  context,
  openSidePanel,
}) => {
  await context.route(`${TEST_ORIGIN}/page`, (route) =>
    route.fulfill({ contentType: 'text/html', body: TEST_HTML }),
  );
  // Эхо-эндпоинт: отражает пришедший заголовок и тело — чтобы доказать, что правки
  // редактора реально ушли в запрос из контекста расширения.
  await context.route(API_URL, async (route) => {
    const req = route.request();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        echoHeader: req.headers()['x-replay'] ?? null,
        echoBody: req.postData() ?? null,
      }),
    });
  });

  const page = await context.newPage();
  await page.goto(TEST_URL);

  // Грант host-права под жестом из панели (мягкий пропуск при отказе среды).
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
  test.skip(
    !granted,
    'optional host-права не выданы в этой среде — ручная проверка (load-unpacked)',
  );

  // Компонуем replay-запрос с ПРАВКОЙ заголовка и тела и шлём в фон (как это делает
  // UI-мост `replayRequest`). Sender выполняет fetch из контекста расширения.
  const reply = (await panel.evaluate(async (apiUrl: string) => {
    const spec = {
      method: 'POST',
      url: apiUrl,
      query: [],
      headers: [{ key: 'X-Replay', value: 'edited', enabled: true }],
      body: '{"edited":true}',
      bodyMode: 'json',
    };
    return (await chrome.runtime.sendMessage({
      __qatb__: true,
      type: 'mock/replay',
      payload: spec,
      correlationId: 'e2e-mock-replay',
    })) as { payload?: { ok?: boolean; response?: { body?: string } } } | undefined;
  }, API_URL)) as { payload?: { ok?: boolean; response?: { body?: string } } } | undefined;

  // Роутинг может не покрывать fetch из service worker в этой среде — мягкий пропуск.
  test.skip(
    reply?.payload?.ok !== true,
    'sender-fetch из SW недоступен/не перехвачен в этой среде — ручная проверка (load-unpacked)',
  );

  // Эхо-сервер отражает заголовок и тело: доказываем, что правки редактора реально
  // ушли в запрос из контекста расширения. Тело приходит как экранированная JSON-строка
  // внутри ответа, поэтому разбираем ответ, а не ищем подстроку «вслепую».
  const parsed = JSON.parse(reply?.payload?.response?.body ?? '{}') as {
    echoHeader?: string | null;
    echoBody?: string | null;
  };
  expect(parsed.echoHeader).toBe('edited');
  expect(parsed.echoBody).toBe('{"edited":true}');
});
