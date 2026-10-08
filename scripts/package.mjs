#!/usr/bin/env node
/**
 * Упаковка расширения в zip для Chrome Web Store.
 *
 * Публикует содержимое `dist/`, исключая source maps (`*.map` раскрыли бы
 * исходники в сторе — их держим только как отладочный артефакт CI).
 * Предполагает предварительный `pnpm build`; вызывается через `pnpm package`
 * (= `pnpm build && node scripts/package.mjs`).
 *
 * Результат: `dist-zip/qaid-<version>.zip`.
 */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import archiver from 'archiver';

const distDir = resolve('dist');
if (!existsSync(distDir)) {
  console.error('[package] dist/ не найден — сначала выполните `pnpm build`.');
  process.exit(1);
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const outDir = resolve('dist-zip');
await mkdir(outDir, { recursive: true });
const outFile = resolve(outDir, `qaid-${pkg.version}.zip`);

const output = createWriteStream(outFile);
const archive = archiver('zip', { zlib: { level: 9 } });

const done = new Promise((resolvePromise, rejectPromise) => {
  output.on('close', resolvePromise);
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') console.warn('[package]', err.message);
    else rejectPromise(err);
  });
  archive.on('error', rejectPromise);
});

archive.pipe(output);
// Содержимое dist/, без source maps.
archive.glob('**/*', { cwd: distDir, ignore: ['**/*.map'] });
await archive.finalize();
await done;

console.info(`[package] packaged: ${outFile} (${String(archive.pointer())} bytes)`);
