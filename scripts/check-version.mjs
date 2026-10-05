#!/usr/bin/env node
/**
 * Сверяет версию релиза: тег `vX.Y.Z` ↔ `package.json.version` ↔ собранный
 * `dist/manifest.json` (если есть). Единственный источник версии — `package.json`
 * (см. ADR-0019): манифест генерируется из неё при сборке (`manifest.config.ts`),
 * поэтому отдельной «синхронизации» файлов не требуется — только проверка.
 *
 * Использование: `node scripts/check-version.mjs v1.2.3`
 * (в CI — `node scripts/check-version.mjs "$GITHUB_REF_NAME"`).
 *
 * Ненулевой exit при любом рассинхроне — рассинхрон версии в MV3 = отклонение
 * в Chrome Web Store.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Нормализует semver-ядро в Chrome-версию `major.minor.patch` (как toExtensionVersion). */
function toExtensionVersion(semver) {
  const core = semver.split('-')[0] ?? '';
  const parts = core.split('.');
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const token = parts[i] ?? '0';
    if (!/^\d+$/.test(token)) {
      throw new Error(`некорректный компонент версии "${token}" в "${semver}"`);
    }
    out.push(String(Number(token)));
  }
  return out.join('.');
}

function fail(message) {
  console.error(`[check-version] ✗ ${message}`);
  process.exit(1);
}

const rawTag = process.argv[2];
if (!rawTag) fail('не передан тег (аргумент 1). Пример: check-version.mjs v1.2.3');

const tag = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`тег "${rawTag}" не является semver вида vX.Y.Z[-prerelease]`);
}

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
if (pkg.version !== tag) {
  fail(`тег (${tag}) ≠ package.json.version (${pkg.version}). Синхронизируй перед тегированием.`);
}

// Если расширение собрано — сверяем и манифест (version_name = полный semver).
const manifestPath = resolve('dist', 'manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expectedVersion = toExtensionVersion(pkg.version);
  if (manifest.version_name !== pkg.version) {
    fail(
      `dist/manifest.json version_name (${manifest.version_name}) ≠ package.json (${pkg.version})`,
    );
  }
  if (manifest.version !== expectedVersion) {
    fail(`dist/manifest.json version (${manifest.version}) ≠ нормализованная (${expectedVersion})`);
  }
  console.info(
    `[check-version] ✓ ${tag} == package.json == manifest (version ${manifest.version}, name ${manifest.version_name})`,
  );
} else {
  console.info(
    `[check-version] ✓ ${tag} == package.json.version (сборка не найдена — проверка манифеста пропущена)`,
  );
}
