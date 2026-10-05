import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath } from 'node:url';
import manifest from './src/manifest.config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [preact(), crx({ manifest })],
  build: {
    // 'hidden' — .map файлы генерируются, но без //# sourceMappingURL в бандлах,
    // чтобы не публиковать ссылки на исходники в стор; из zip они исключаются.
    sourcemap: 'hidden',
    target: 'es2022',
    rollupOptions: {
      // Страницы, не декларируемые в манифесте (создаются/открываются в рантайме по
      // URL через `runtime.getURL`), добавляем явными входами сборки — иначе @crxjs их
      // не соберёт. Пути сохраняются относительными.
      //  • offscreen (TASK-037) — невидимый хост `MediaRecorder` для записи БЕЗ микрофона.
      //  • screenRecorder (TASK-037, bugfix 6) — видимая вкладка-рекордер для записи С
      //    микрофоном: `getUserMedia` надёжно работает лишь в своём документе, поэтому мик
      //    пишется в ней, а не в offscreen (`tabs.create`).
      //  • panel (TASK-062) — тело откреплённой плавающей панели, грузится в cross-origin
      //    iframe content-обёртки по `runtime.getURL('src/panel/index.html')`; объявлено
      //    и в `web_accessible_resources` манифеста (чтобы страница могла фреймить его).
      input: {
        offscreen: 'src/offscreen/index.html',
        screenRecorder: 'src/features/screen-recording/recorder-tab/index.html',
        panel: 'src/panel/index.html',
      },
    },
  },
});
