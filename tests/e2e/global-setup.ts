import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Глобальный setup e2e.
 *
 * 1. Гарантирует, что расширение собрано. e2e тестируют артефакт из `dist/`, поэтому
 *    без сборки запуск бессмыслен — падаем рано и с понятной подсказкой, а не
 *    загадочным «service worker не найден» позже.
 *
 * 2. Готовит e2e-вариант расширения `dist-e2e/` — копию `dist/` с манифестом, где
 *    host-доступ и `scripting`/`cookies` выданы INSTALL-TIME (а не через runtime
 *    `permissions.request`).
 *
 *    Зачем: `chrome.permissions.request` host-прав поднимает НАТИВНЫЙ диалог Chrome,
 *    который Playwright/CDP принять не могут (это не DOM страницы). В headed-прогоне
 *    (режим CI под xvfb — MV3 SW не живёт в headless) такой диалог роняет вкладку
 *    («Target crashed»), из-за чего permission-gated тесты не «мягко скипались», а
 *    падали по 30s-таймауту. Для УЖЕ выданного права `request(...)` резолвится в
 *    `true` мгновенно и без диалога — поэтому грант-жесты в тестах остаются как есть,
 *    но проходят детерминированно, а фактический сбор/инъекция/RPC реально
 *    проверяются в CI. Продакшн-`dist/` не меняется: права остаются optional там, где
 *    это важно для реального UX (ADR-0020/0022) — e2e-вариант изолирован.
 */

/** Путь к e2e-варианту расширения (его грузит фикстура). */
export const E2E_EXT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist-e2e',
);

export default function globalSetup(): void {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(dir, '../../dist');
  const distManifest = path.join(dist, 'manifest.json');
  if (!existsSync(distManifest)) {
    throw new Error(
      `[e2e] Сборка не найдена: ${distManifest}\n` +
        `      Собери расширение перед e2e: pnpm build`,
    );
  }

  // Пересобираем e2e-вариант с нуля, чтобы он не отставал от свежего `dist`.
  if (existsSync(E2E_EXT_DIR)) rmSync(E2E_EXT_DIR, { recursive: true, force: true });
  cpSync(dist, E2E_EXT_DIR, { recursive: true });

  const e2eManifestPath = path.join(E2E_EXT_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(e2eManifestPath, 'utf8')) as {
    permissions?: string[];
    optional_permissions?: string[];
    host_permissions?: string[];
    optional_host_permissions?: string[];
  };

  // Промотируем optional-права, которые тесты запрашивают под жестом, в install-time:
  // `request(...)` для уже выданного права резолвится без нативного диалога. Права,
  // которые нужно удержать optional для негативных кейсов, сюда НЕ добавляем.
  const PROMOTE_PERMS = ['scripting', 'cookies'];
  const PROMOTE_HOSTS = ['*://*/*', '<all_urls>'];

  const perms = new Set([...(manifest.permissions ?? []), ...PROMOTE_PERMS]);
  const optPerms = new Set(manifest.optional_permissions ?? []);
  for (const p of PROMOTE_PERMS) optPerms.delete(p); // нельзя одновременно в permissions и optional
  const hosts = new Set([...(manifest.host_permissions ?? []), ...PROMOTE_HOSTS]);

  manifest.permissions = [...perms];
  manifest.optional_permissions = [...optPerms];
  manifest.host_permissions = [...hosts];
  manifest.optional_host_permissions = [];

  writeFileSync(e2eManifestPath, JSON.stringify(manifest, null, 2));
}
