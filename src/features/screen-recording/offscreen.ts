/**
 * Хост рекордера в offscreen-документе для записи БЕЗ микрофона (TASK-037, ADR-0045).
 *
 * `MediaRecorder` недоступен в service worker, поэтому запись экрана/окна/вкладки со
 * звуком системы ведётся здесь, в невидимом offscreen-документе (нативный пикер
 * `getDisplayMedia` он показать умеет, а вот системный промпт `getUserMedia` — НЕТ). С
 * ревизии 2026-09-22 (bugfix 6) запись С МИКРОФОНОМ сюда НЕ приходит: она идёт в видимой
 * вкладке-рекордере (`recorder-tab/`), где `getUserMedia` реально получает грант в своём
 * же документе. Offscreen обслуживает только путь без микрофона.
 *
 * Контекст общается с UI ТОЛЬКО по `BroadcastChannel` (same-origin, structured clone
 * переносит `Blob`) — вне шины `chrome.runtime`, что снимает MV3-гонку мультилистенеров.
 * Вниз приходят команды `start`/`stop`/`pause`/`resume`; вверх уходят события
 * `state`/`progress`/`blob`/`error`. Сама сессия записи — в общем оркестраторе
 * (`session.ts`), одном для offscreen и вкладки-рекордера.
 *
 * Экспорта нет: модуль регистрирует свой bootstrap в generic-реестре offscreen
 * (`registerOffscreen`), а фактический запуск (`BroadcastChannel` и слушатели) — только
 * из `bootOffscreen()` в точке входа offscreen-документа. При импорте фичи в SW/UI (через
 * барель `@/features`) регистрация лишь кладёт функцию в массив и ничего не исполняет.
 */
import { RECORDING_CHANNEL } from './types';
import type { RecorderCommand, RecorderEvent } from './types';
import { createRecordingSession } from './session';
import { registerOffscreen } from '@/offscreen/registry';

/**
 * Ставит слушатель `BroadcastChannel` и ведёт единственную сессию записи через общий
 * оркестратор. Создаётся только в offscreen-документе (см. заголовок).
 */
function boot(): void {
  const channel = new BroadcastChannel(RECORDING_CHANNEL);
  const session = createRecordingSession((evt: RecorderEvent): void => {
    channel.postMessage(evt);
  });

  channel.onmessage = (event: MessageEvent): void => {
    const cmd = event.data as RecorderCommand;
    switch (cmd.cmd) {
      case 'start':
        session.start({
          systemAudio: cmd.systemAudio,
          mic: cmd.mic,
          maxDurationMs: cmd.maxDurationMs,
        });
        break;
      case 'stop':
        session.stop();
        break;
      case 'pause':
        session.pause();
        break;
      case 'resume':
        session.resume();
        break;
    }
  };
}

registerOffscreen(boot);
