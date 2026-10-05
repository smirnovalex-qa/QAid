import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Глобальный setup e2e: гарантирует, что расширение собрано. e2e тестируют
 * артефакт из `dist/`, поэтому без сборки запуск бессмыслен — падаем рано и с
 * понятной подсказкой, а не загадочным «service worker не найден» позже.
 */
export default function globalSetup(): void {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const distManifest = path.resolve(dir, '../../dist/manifest.json');
  if (!existsSync(distManifest)) {
    throw new Error(
      `[e2e] Сборка не найдена: ${distManifest}\n` +
        `      Собери расширение перед e2e: pnpm build`,
    );
  }
}
