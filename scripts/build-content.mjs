/**
 * Отдельная сборка инъектируемых по требованию content-бандлов (TASK-013/ADR-0020,
 * TASK-062).
 *
 * Почему отдельно от основной сборки @crxjs: эти хосты инъектируются по требованию через
 * `chrome.scripting.executeScript({ files: [...] })`, а не статическим `content_scripts`.
 * `executeScript` грузит файл как классический (не-module) скрипт — значит он обязан быть
 * самодостаточным IIFE без внешних import'ов. @crxjs выдаёт ESM-чанки с хешированными путями
 * (для module-энтрипойнтов), что для такой инъекции непригодно. Поэтому каждый хост
 * собирается здесь в единый IIFE `dist/<fileName>` со стабильным именем, совпадающим с
 * константой в соответствующем background-менеджере (`INSPECTION_CONTENT_SCRIPT`,
 * `PANEL_CONTENT_SCRIPT`).
 *
 * `emptyOutDir: false` — чтобы не затирать основной результат @crxjs; запускается
 * после `vite build`.
 */
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const srcAlias = fileURLToPath(new URL('../src', import.meta.url));

/** Самодостаточные IIFE-энтрипойнты: исходник → стабильное имя бандла в dist/. */
const ENTRYPOINTS = [
  {
    entry: 'content/inspection/index.ts',
    fileName: 'content-inspection.js',
    name: '__qatbInspectionHost',
  },
  {
    entry: 'content/panel/index.ts',
    fileName: 'content-panel.js',
    name: '__qatbPanelHost',
  },
];

for (const { entry, fileName, name } of ENTRYPOINTS) {
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: { '@': srcAlias } },
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'es2022',
      minify: true,
      sourcemap: false,
      lib: {
        entry: fileURLToPath(new URL(`../src/${entry}`, import.meta.url)),
        formats: ['iife'],
        name,
        fileName: () => fileName,
      },
    },
  });
  console.log(`✓ content host bundled → dist/${fileName}`);
}
