#!/usr/bin/env node
/**
 * Генерирует заметки релиза в stdout: секция текущей версии из `CHANGELOG.md`
 * (ведётся changesets) + блок «Chrome Web Store submission notes» с правами из
 * собранного манифеста и их обоснованием (PRD §9/§13 — least-privilege).
 *
 * Использование: `node scripts/release-notes.mjs > RELEASE_NOTES.md`.
 * Предполагает `pnpm build` заранее (для чтения `dist/manifest.json`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const version = pkg.version;

/** Вырезает секцию `## <version>` из CHANGELOG (changesets-формат). */
function changelogSection() {
  const path = resolve('CHANGELOG.md');
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n');
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.includes(version));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s+/.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

/** Человекочитаемые обоснования всегда-нужных прав (least-privilege, ADR-0013). */
const PERMISSION_RATIONALE = {
  storage: 'локальное сохранение настроек фич (без синхронизации/сети)',
  sidePanel: 'открытие инструментов в боковой панели браузера',
};

function permissionsBlock() {
  const manifestPath = resolve('dist', 'manifest.json');
  if (!existsSync(manifestPath)) {
    return '_Манифест не собран — раздел прав пропущен (запусти `pnpm build`)._';
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const perms = manifest.permissions ?? [];
  const optional = manifest.optional_permissions ?? [];
  const lines = [];
  lines.push('**Постоянные права:**');
  if (perms.length === 0) lines.push('- (нет)');
  for (const p of perms) {
    lines.push(`- \`${p}\` — ${PERMISSION_RATIONALE[p] ?? 'см. DECISIONS.md'}`);
  }
  lines.push('');
  lines.push(
    optional.length === 0
      ? '**Опциональные права:** запрашиваются в рантайме по требованию фич (least-privilege, ADR-0013).'
      : `**Опциональные права:** ${optional.map((p) => `\`${p}\``).join(', ')} — запрашиваются в рантайме.`,
  );
  return lines.join('\n');
}

const changes = changelogSection() ?? '_См. CHANGELOG.md._';

const out = `# QAnvil v${version}

## Изменения

${changes}

---

## Chrome Web Store submission notes

Локально-приватное расширение (Manifest V3): вся обработка — на устройстве, без
сетевых вызовов в ядре (ADR-0007). Артефакт \`qanvil-${version}.zip\` собран из
\`dist/\` без source maps.

${permissionsBlock()}

> Draft-релиз: проверьте артефакт и права перед публикацией в Chrome Web Store.
`;

process.stdout.write(out);
