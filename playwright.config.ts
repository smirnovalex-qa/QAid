import { defineConfig } from '@playwright/test';

/**
 * Playwright-конфиг для e2e поверх **собранного** расширения (TASK-011 §4).
 *
 * Тесты драйвят артефакт из `dist/`, а не исходники, поэтому перед запуском
 * обязателен `pnpm build` (в CI — отдельный шаг). Наличие сборки проверяет
 * `tests/e2e/global-setup.ts` и падает с понятным сообщением, если её нет.
 *
 * MV3 грузится только в persistent context с `--load-extension`; чистый headless
 * старой модели не поднимает service worker расширения. Рабочий режим —
 * headed (в CI под `xvfb`) либо новый headless (`--headless=new`). Переключается
 * переменной `E2E_HEADFUL` (см. `tests/e2e/fixtures/extension.ts`).
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/e2e/global-setup.ts',
  // Расширение живёт в одном persistent context — параллелизм по воркерам недопустим.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-extension' }],
});
