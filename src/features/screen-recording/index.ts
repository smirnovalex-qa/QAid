/**
 * Дескриптор фичи «Запись экрана с аудио» (TASK-037) + саморегистрация (ADR-0011).
 *
 * Запись ведёт offscreen-документ (`MediaRecorder` недоступен в service worker);
 * привилегированные операции (добыть `streamId`, поднять offscreen, бейдж) — в
 * `background.ts` как штатные background-хендлеры; управление рекордером и доставка
 * `Blob` — по `BroadcastChannel` (ADR-0045). i18n домешивается через `mergeCatalog`;
 * контракты `screenrec/*` вносятся в протокол через `messages`.
 *
 * `category: 'utils'` (PRD §7.8). `requiresPanel`: сессия записи опирается на живую
 * поверхность (таймер/предпросмотр/скачивание) — transient-popup закрывается при
 * взаимодействии со страницей/пикером, поэтому popup показывает fallback «открыть в
 * side panel» (ADR-0025); в списках фича видна на обеих поверхностях.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import { screenRecordingMessages } from './messages';
import './offscreen'; // side-effect: регистрация offscreen-bootstrap'а (ADR-0045)
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'screen-recording',
  title: 'feature.screenRecording.title',
  category: 'utils',
  surface: 'both',
  requiresPanel: true,
  order: 210,
  icon: glyphIcon('⏺'),
  load: () => import('./ui').then((m) => m.ScreenRecordingPanel),
  messages: screenRecordingMessages,
  // `screenRecordingHandlers` (offscreen/вкладка-рекордер оркестрация) подключаются из
  // background-барели (`@/features/background`), не из UI-дескриптора (F6 TASK-046,
  // ADR-0047). Offscreen-bootstrap регистрируется отдельным side-effect выше.
});
