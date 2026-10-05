/**
 * Playwright-фикстуры для e2e поверх собранного MV3-расширения (TASK-011 §4).
 *
 * Расширение грузится в persistent context через `--load-extension`; `extensionId`
 * извлекается из URL зарегистрированного service worker'а. Хелперы `openPopup` /
 * `openSidePanel` открывают HTML-энтрипоинты расширения как обычные страницы и
 * возвращают `Page` для драйва.
 */
import { test as base, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Путь к собранному расширению (tests/e2e/fixtures → корень → dist). */
const EXT_PATH = path.resolve(HERE, '../../../dist');

// MV3 SW не поднимается в headless старой модели. По умолчанию — headed; под CI
// используется xvfb. `E2E_HEADFUL=0` включает новый headless (`--headless=new`).
const HEADFUL = process.env.E2E_HEADFUL !== '0';

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  openPopup: () => Promise<Page>;
  openSidePanel: () => Promise<Page>;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        ...(HEADFUL ? [] : ['--headless=new']),
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // ID берём из URL зарегистрированного MV3 service worker'а.
    let [sw] = context.serviceWorkers();
    sw ??= await context.waitForEvent('serviceworker');
    const extensionId = new URL(sw.url()).host;
    await use(extensionId);
  },

  openPopup: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
      return page;
    });
  },

  openSidePanel: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
      return page;
    });
  },
});

export const expect = test.expect;
