/**
 * Скрипт вкладки-рекордера (TASK-037, ревизия 2026-09-22 bugfix 6).
 *
 * Здесь запись С МИКРОФОНОМ ведётся В СВОЁМ ЖЕ документе — единственный надёжный способ:
 * `getUserMedia` отдаёт грант тому контексту, который сам его запросил под жестом; грант
 * из отдельной вкладки в offscreen НЕ пробрасывается (корень бага «Доступ отклонён»).
 * Клик «Начать» даёт transient activation для `getDisplayMedia` (пикер поверхности), затем
 * `capture.ts` запрашивает микрофон (`getUserMedia`) — в этой же вкладке промпт реально
 * показывается. Сессию ведёт общий оркестратор (`session.ts`), события уходят в side panel
 * по `BroadcastChannel`; команды `stop`/`pause`/`resume` из панели принимаются оттуда же.
 *
 * Страница самодостаточна: без `@/i18n`/реестра фич и без платформенного seam (два коротких
 * языковых набора инлайн, параметры — из query), чтобы вкладка оставалась лёгкой.
 */
import { RECORDING_CHANNEL } from '../types';
import type { RecorderCommand, RecorderEvent, RecordingState } from '../types';
import { formatBytes, formatDuration } from '../logic';
import { createRecordingSession } from '../session';
import { parseRecorderTabParams } from './params';

interface Strings {
  readonly title: string;
  readonly bodyMic: string;
  readonly body: string;
  readonly start: string;
  readonly stop: string;
  readonly requesting: string;
  readonly recording: string;
  readonly finalizing: string;
  readonly done: string;
  readonly denied: string;
  readonly failed: string;
}

const RU: Strings = {
  title: 'Запись экрана',
  bodyMic:
    'Нажмите «Начать»: сначала выберите, чем поделиться, затем разрешите доступ к микрофону в запросе браузера. Не закрывайте эту вкладку до конца записи.',
  body: 'Нажмите «Начать» и выберите, чем поделиться. Не закрывайте эту вкладку до конца записи.',
  start: 'Начать',
  stop: 'Остановить',
  requesting: 'Запрашиваю доступ…',
  recording: 'Идёт запись — управляйте из панели QAid или кнопкой ниже.',
  finalizing: 'Собираю файл записи…',
  done: 'Готово. Запись передана в панель — эта вкладка сейчас закроется.',
  denied: 'Доступ отклонён. Повторите и разрешите доступ к экрану и микрофону.',
  failed: 'Не удалось начать запись. Попробуйте ещё раз.',
};

const EN: Strings = {
  title: 'Screen recording',
  bodyMic:
    'Click Start: first pick what to share, then allow microphone access in the browser prompt. Keep this tab open until the recording ends.',
  body: 'Click Start and pick what to share. Keep this tab open until the recording ends.',
  start: 'Start',
  stop: 'Stop',
  requesting: 'Requesting access…',
  recording: 'Recording — control it from the QAid panel or the button below.',
  finalizing: 'Assembling the recording…',
  done: 'Done. The recording was handed to the panel — this tab will close now.',
  denied: 'Access was declined. Try again and allow screen and microphone access.',
  failed: 'Could not start recording. Please try again.',
};

const S: Strings = navigator.language.toLowerCase().startsWith('ru') ? RU : EN;

/** Достаёт обязательный элемент разметки (страница статична — элементы всегда есть). */
function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`recorder-tab: missing #${id}`);
  return el;
}

const params = parseRecorderTabParams(window.location.search);

const titleEl = must('title');
const bodyEl = must('body');
const setupEl = must('setup');
const liveEl = must('live');
const startBtn = must('start') as HTMLButtonElement;
const stopBtn = must('stop') as HTMLButtonElement;
const timerEl = must('timer');
const sizeEl = must('size');
const statusEl = must('status');

titleEl.textContent = S.title;
bodyEl.textContent = params.mic ? S.bodyMic : S.body;
startBtn.textContent = S.start;
stopBtn.textContent = S.stop;

function setStatus(text: string, kind: '' | 'ok' | 'err' = ''): void {
  statusEl.textContent = text;
  statusEl.className = kind === '' ? 'status' : `status ${kind}`;
}

function showLive(live: boolean): void {
  setupEl.hidden = live;
  liveEl.hidden = !live;
}

const channel = new BroadcastChannel(RECORDING_CHANNEL);

/** Реакция локального UI на события сессии (параллельно отправке их в панель). */
function reflect(evt: RecorderEvent): void {
  switch (evt.evt) {
    case 'state':
      applyState(evt.state);
      break;
    case 'progress':
      timerEl.textContent = formatDuration(evt.elapsedMs);
      sizeEl.textContent = formatBytes(evt.sizeBytes);
      break;
    case 'blob':
      setStatus(S.done, 'ok');
      break;
    case 'error':
      showLive(false);
      startBtn.disabled = false;
      setStatus(evt.code === 'permission-denied' ? S.denied : S.failed, 'err');
      break;
  }
}

function applyState(state: RecordingState): void {
  // Вкладку интересуют лишь «живые» фазы; терминальные (blob/error) обрабатываются в
  // `reflect`. If-цепочка вместо switch — состояний RecordingState больше, чем нам важно.
  if (state === 'requesting') {
    setStatus(S.requesting);
  } else if (state === 'recording') {
    showLive(true);
    setStatus(S.recording);
  } else if (state === 'finalizing') {
    setStatus(S.finalizing);
  }
}

// Оркестратор: события уходят и в панель (канал), и в локальный UI.
const session = createRecordingSession((evt: RecorderEvent): void => {
  try {
    channel.postMessage(evt);
  } catch {
    /* панель могла закрыть канал — локальный UI всё равно обновим */
  }
  reflect(evt);
});

// Команды из side panel (stop/pause/resume). Собственные события (`evt`) сюда не приходят
// (BroadcastChannel не доставляет отправителю его же сообщения).
channel.onmessage = (event: MessageEvent): void => {
  const data: unknown = event.data;
  if (data === null || typeof data !== 'object' || !('cmd' in data)) return;
  const cmd = data as RecorderCommand;
  switch (cmd.cmd) {
    case 'stop':
      session.stop();
      break;
    case 'pause':
      session.pause();
      break;
    case 'resume':
      session.resume();
      break;
    case 'start':
      break; // старт инициируется только жестом-кликом в самой вкладке
  }
};

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  setStatus(S.requesting);
  session.start(params);
});

stopBtn.addEventListener('click', () => {
  session.stop();
});
