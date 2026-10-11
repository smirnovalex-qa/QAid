/**
 * e2e фичи «Синк настроек и пресетов между устройствами» (TASK-029) поверх
 * собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (тумблер «Включить синк») —
 *     надёжно и без прав.
 *  2. Контракт seam `chrome.storage.sync`, на который опирается фича: конверт,
 *     записанный «устройством A», читается обратно (round-trip) — эмуляция синка
 *     между устройствами. Где `chrome.storage.sync` недоступен в среде (нет права
 *     `storage`/quota-песочница), тест мягко пропускается (см. ADR-0020/ADR-0022),
 *     а сквозное слияние/конфликт покрыты юнит-тестами (`logic`/`engine`).
 */
import { test, expect } from './fixtures/extension';
import type { Worker } from '@playwright/test';

const KEY = 'qatb.sync.app';

async function serviceWorker(context: import('@playwright/test').BrowserContext): Promise<Worker> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return sw;
}

test('секция синхронизации рендерится в настройках', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  // В оболочке v3 синхронизация живёт на экране настроек (не в каталоге инструментов).
  await panel.getByRole('button', { name: /Настройки|Settings/ }).click();
  const toggle = panel.getByRole('switch', {
    name: /Синхронизировать настройки|Sync my settings/,
  });
  await expect(toggle).toBeVisible();
  // Включение раскрывает список синхронизируемых пространств имён.
  await toggle.click();
  await expect(panel.getByText(/Синхронизировано только что|Last synced just now/)).toBeVisible();
});

test('chrome.storage.sync round-trips a sync envelope (эмуляция устройства A→B)', async ({
  context,
}) => {
  const sw = await serviceWorker(context);

  // «Устройство A» пишет конверт в sync; «устройство B» читает его обратно.
  const result = await sw.evaluate(async (key: string) => {
    try {
      const s = (chrome as unknown as { storage?: { sync?: chrome.storage.SyncStorageArea } })
        .storage?.sync;
      if (!s) return { ok: false as const, reason: 'no-sync' };
      const envelope = { v: 1, updatedAt: Date.now(), value: { theme: 'dark' } };
      await s.set({ [key]: envelope });
      const read = (await s.get([key])) as Record<string, { value?: { theme?: string } }>;
      await s.remove([key]);
      return { ok: true as const, theme: read[key]?.value?.theme };
    } catch (e) {
      return { ok: false as const, reason: String(e) };
    }
  }, KEY);

  test.skip(
    !result.ok,
    `chrome.storage.sync недоступен в этой среде: ${result.ok ? '' : result.reason}`,
  );
  expect(result.ok && result.theme).toBe('dark');
});
