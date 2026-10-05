/**
 * Юнит-тесты чистого ядра «Запись экрана» (TASK-037). Покрывают выбор MIME,
 * зажим/форматирование лимитов, форматирование таймера и размера, полную машину
 * состояний (включая недопустимые переходы) и имя файла. Без DOM/`chrome.*`.
 */
import { describe, expect, it } from 'vitest';
import {
  clampDuration,
  controlsFor,
  formatBytes,
  formatDuration,
  isCapturing,
  isNearSizeLimit,
  pickMimeType,
  planGif,
  recordingFileName,
  reduceRecording,
  sizeRatio,
} from '@/features/screen-recording/logic';
import type { RecordingAction } from '@/features/screen-recording/logic';
import {
  DURATION_OPTIONS_MS,
  GIF_MAX_FRAMES,
  GIF_MAX_WIDTH,
  GIF_TARGET_FPS,
  MAX_DURATION_MS,
  MIME_PREFERENCES,
  SIZE_WARN_RATIO,
  SOFT_SIZE_LIMIT_BYTES,
} from '@/features/screen-recording/types';
import type { RecordingState } from '@/features/screen-recording/types';
import {
  ALL_STATES,
  FALLBACK_MIME,
  TOP_MIME,
  makeIsSupported,
  supportsEverything,
  supportsNothing,
} from './fixtures/streams';

describe('pickMimeType', () => {
  it('возвращает самый предпочитаемый кодек, если поддержаны все', () => {
    expect(pickMimeType(supportsEverything)).toBe(TOP_MIME);
    expect(pickMimeType(supportsEverything)).toBe(MIME_PREFERENCES[0]);
  });

  it('возвращает null, если не поддержан ни один кодек', () => {
    expect(pickMimeType(supportsNothing)).toBeNull();
  });

  it('пропускает неподдержанные и берёт первый доступный (fallback)', () => {
    expect(pickMimeType(makeIsSupported([FALLBACK_MIME]))).toBe(FALLBACK_MIME);
  });

  it('поддержка только video/webm возвращает именно его', () => {
    expect(pickMimeType(makeIsSupported(['video/webm']))).toBe('video/webm');
  });

  it('уважает порядок предпочтений: второй побеждает первого, если первый не поддержан', () => {
    const supported = [MIME_PREFERENCES[1]!, MIME_PREFERENCES[3]!];
    expect(pickMimeType(makeIsSupported(supported))).toBe(MIME_PREFERENCES[1]);
  });
});

describe('clampDuration', () => {
  const MIN = DURATION_OPTIONS_MS[0]!;

  it('оставляет значение внутри диапазона без изменений', () => {
    expect(clampDuration(DURATION_OPTIONS_MS[1]!)).toBe(DURATION_OPTIONS_MS[1]);
  });

  it('поднимает значение ниже минимума до минимума', () => {
    expect(clampDuration(1)).toBe(MIN);
    expect(clampDuration(MIN - 1)).toBe(MIN);
  });

  it('срезает значение выше максимума до MAX_DURATION_MS', () => {
    expect(clampDuration(MAX_DURATION_MS + 100_000)).toBe(MAX_DURATION_MS);
  });

  it('сохраняет точные границы диапазона', () => {
    expect(clampDuration(MIN)).toBe(MIN);
    expect(clampDuration(MAX_DURATION_MS)).toBe(MAX_DURATION_MS);
  });

  it('нечисловое/неположительное → минимум (защитно)', () => {
    expect(clampDuration(Number.NaN)).toBe(MIN);
    expect(clampDuration(0)).toBe(MIN);
    expect(clampDuration(-5000)).toBe(MIN);
    // Infinity не проходит Number.isFinite → тоже минимум (защитно)
    expect(clampDuration(Number.POSITIVE_INFINITY)).toBe(MIN);
  });
});

describe('formatDuration', () => {
  it('форматирует ноль как 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('дополняет секунды нулём', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(9_000)).toBe('0:09');
  });

  it('переходит в mm:ss при ≥ 10 минут', () => {
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('отбрасывает дробные миллисекунды вниз (floor)', () => {
    expect(formatDuration(1_999)).toBe('0:01');
    expect(formatDuration(59_999)).toBe('0:59');
  });

  it('отрицательное трактует как 0', () => {
    expect(formatDuration(-1_000)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('байты ниже 1 КиБ печатает как "N B"', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('килобайты с одним знаком после запятой', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('мегабайты с одним знаком после запятой', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('ноль/отрицательное/NaN → "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('sizeRatio', () => {
  it('доля от дефолтного мягкого лимита', () => {
    expect(sizeRatio(SOFT_SIZE_LIMIT_BYTES)).toBe(1);
    expect(sizeRatio(SOFT_SIZE_LIMIT_BYTES / 2)).toBe(0.5);
  });

  it('принимает кастомный лимит', () => {
    expect(sizeRatio(50, 200)).toBe(0.25);
  });

  it('неположительный лимит → 0 (защита от деления на ноль)', () => {
    expect(sizeRatio(1000, 0)).toBe(0);
    expect(sizeRatio(1000, -1)).toBe(0);
  });

  it('невалидные/отрицательные байты трактует как 0', () => {
    expect(sizeRatio(Number.NaN)).toBe(0);
    expect(sizeRatio(-500)).toBe(0);
  });
});

describe('isNearSizeLimit', () => {
  it('false ниже порога предупреждения', () => {
    expect(isNearSizeLimit(SOFT_SIZE_LIMIT_BYTES * (SIZE_WARN_RATIO - 0.1))).toBe(false);
  });

  it('true ровно на пороге и выше', () => {
    expect(isNearSizeLimit(SOFT_SIZE_LIMIT_BYTES * SIZE_WARN_RATIO)).toBe(true);
    expect(isNearSizeLimit(SOFT_SIZE_LIMIT_BYTES)).toBe(true);
  });

  it('уважает кастомный лимит', () => {
    expect(isNearSizeLimit(80, 100)).toBe(true); // 0.8 == порог
    expect(isNearSizeLimit(70, 100)).toBe(false);
  });
});

describe('reduceRecording', () => {
  const NON_TERMINAL: readonly RecordingAction[] = [
    { type: 'request' },
    { type: 'started' },
    { type: 'pause' },
    { type: 'resume' },
    { type: 'finalize' },
    { type: 'ready' },
  ];

  it('idle: request → requesting', () => {
    expect(reduceRecording('idle', { type: 'request' })).toBe('requesting');
  });

  it('requesting: started → recording', () => {
    expect(reduceRecording('requesting', { type: 'started' })).toBe('recording');
  });

  it('recording: pause → paused, finalize → finalizing', () => {
    expect(reduceRecording('recording', { type: 'pause' })).toBe('paused');
    expect(reduceRecording('recording', { type: 'finalize' })).toBe('finalizing');
  });

  it('paused: resume → recording, finalize → finalizing', () => {
    expect(reduceRecording('paused', { type: 'resume' })).toBe('recording');
    expect(reduceRecording('paused', { type: 'finalize' })).toBe('finalizing');
  });

  it('finalizing: ready → ready', () => {
    expect(reduceRecording('finalizing', { type: 'ready' })).toBe('ready');
  });

  it('pause↔resume цикл возвращает в recording', () => {
    const paused = reduceRecording('recording', { type: 'pause' });
    expect(reduceRecording(paused, { type: 'resume' })).toBe('recording');
  });

  it('error из любого состояния → error', () => {
    for (const state of ALL_STATES) {
      expect(reduceRecording(state, { type: 'error' })).toBe('error');
    }
  });

  it('reset из любого состояния → idle', () => {
    for (const state of ALL_STATES) {
      expect(reduceRecording(state, { type: 'reset' })).toBe('idle');
    }
  });

  it('недопустимые действия — no-op (возврат текущего состояния)', () => {
    // idle принимает только request
    expect(reduceRecording('idle', { type: 'started' })).toBe('idle');
    expect(reduceRecording('idle', { type: 'pause' })).toBe('idle');
    // requesting принимает только started
    expect(reduceRecording('requesting', { type: 'request' })).toBe('requesting');
    expect(reduceRecording('requesting', { type: 'ready' })).toBe('requesting');
    // recording не принимает resume/request/started/ready
    expect(reduceRecording('recording', { type: 'resume' })).toBe('recording');
    expect(reduceRecording('recording', { type: 'started' })).toBe('recording');
    // paused не принимает pause/request/started/ready
    expect(reduceRecording('paused', { type: 'pause' })).toBe('paused');
    expect(reduceRecording('paused', { type: 'started' })).toBe('paused');
    // finalizing принимает только ready
    expect(reduceRecording('finalizing', { type: 'finalize' })).toBe('finalizing');
    expect(reduceRecording('finalizing', { type: 'pause' })).toBe('finalizing');
  });

  it('ready — терминально для всех нетерминальных действий (no-op)', () => {
    for (const action of NON_TERMINAL) {
      expect(reduceRecording('ready', action)).toBe('ready');
    }
  });

  it('error — терминально для всех нетерминальных действий (no-op)', () => {
    for (const action of NON_TERMINAL) {
      expect(reduceRecording('error', action)).toBe('error');
    }
  });

  it('полный жизненный цикл idle → ready', () => {
    let s: RecordingState = 'idle';
    s = reduceRecording(s, { type: 'request' });
    expect(s).toBe('requesting');
    s = reduceRecording(s, { type: 'started' });
    expect(s).toBe('recording');
    s = reduceRecording(s, { type: 'pause' });
    expect(s).toBe('paused');
    s = reduceRecording(s, { type: 'resume' });
    expect(s).toBe('recording');
    s = reduceRecording(s, { type: 'finalize' });
    expect(s).toBe('finalizing');
    s = reduceRecording(s, { type: 'ready' });
    expect(s).toBe('ready');
    s = reduceRecording(s, { type: 'reset' });
    expect(s).toBe('idle');
  });
});

describe('isCapturing', () => {
  it('true для recording и paused', () => {
    expect(isCapturing('recording')).toBe(true);
    expect(isCapturing('paused')).toBe(true);
  });

  it('false для остальных состояний', () => {
    for (const state of ['idle', 'requesting', 'finalizing', 'ready', 'error'] as const) {
      expect(isCapturing(state)).toBe(false);
    }
  });
});

describe('controlsFor', () => {
  it('idle: только старт', () => {
    expect(controlsFor('idle')).toEqual({
      canStart: true,
      canStop: false,
      canPause: false,
      canResume: false,
      busy: false,
    });
  });

  it('requesting: занято (busy), ничего нельзя', () => {
    expect(controlsFor('requesting')).toEqual({
      canStart: false,
      canStop: false,
      canPause: false,
      canResume: false,
      busy: true,
    });
  });

  it('recording: стоп + пауза', () => {
    expect(controlsFor('recording')).toEqual({
      canStart: false,
      canStop: true,
      canPause: true,
      canResume: false,
      busy: false,
    });
  });

  it('paused: стоп + резюме', () => {
    expect(controlsFor('paused')).toEqual({
      canStart: false,
      canStop: true,
      canPause: false,
      canResume: true,
      busy: false,
    });
  });

  it('finalizing: занято (busy)', () => {
    expect(controlsFor('finalizing')).toEqual({
      canStart: false,
      canStop: false,
      canPause: false,
      canResume: false,
      busy: true,
    });
  });

  it('ready: снова можно стартовать', () => {
    expect(controlsFor('ready')).toEqual({
      canStart: true,
      canStop: false,
      canPause: false,
      canResume: false,
      busy: false,
    });
  });

  it('error: снова можно стартовать', () => {
    expect(controlsFor('error')).toEqual({
      canStart: true,
      canStop: false,
      canPause: false,
      canResume: false,
      busy: false,
    });
  });
});

describe('recordingFileName', () => {
  // month 0-индексирован → 8 == сентябрь → '0920'
  const DATE = new Date(2026, 8, 20, 9, 5, 3);

  it('строит имя с нулевым паддингом полей (без источника)', () => {
    expect(recordingFileName(DATE)).toBe('qa-recording-20260920-090503.webm');
  });

  it('дополняет двузначные поля даты/времени', () => {
    const d = new Date(2026, 0, 1, 0, 0, 0); // 2026-01-01 00:00:00
    expect(recordingFileName(d)).toBe('qa-recording-20260101-000000.webm');
  });

  it('корректно печатает двузначные месяцы/дни/время', () => {
    const d = new Date(2026, 10, 25, 23, 59, 59); // ноябрь → '11'
    expect(recordingFileName(d)).toBe('qa-recording-20261125-235959.webm');
  });

  it('принимает произвольное расширение (gif)', () => {
    expect(recordingFileName(DATE, 'gif')).toBe('qa-recording-20260920-090503.gif');
  });
});

describe('planGif', () => {
  it('короткий ролик: частота кадров ≈ целевой, размеры масштабируются вниз', () => {
    // 2 секунды @ 10 fps → ~20 кадров; ширина 1280 → 480 с сохранением 16:9.
    const plan = planGif(2000, 1280, 720);
    expect(plan.frameCount).toBe(20);
    expect(plan.width).toBe(GIF_MAX_WIDTH);
    expect(plan.height).toBe(270); // 480 * 720/1280
    // Шаг ≈ 100мс → задержка 10 сотых секунды.
    expect(plan.delayCs).toBe(10);
  });

  it('длинный ролик: число кадров упирается в потолок (прореживание)', () => {
    // 60 секунд @ 10 fps → 600 кадров, но потолок GIF_MAX_FRAMES.
    const plan = planGif(60_000, 640, 480);
    expect(plan.frameCount).toBe(GIF_MAX_FRAMES);
    // Шаг = длительность / кадров (прореживание на всю длину).
    expect(plan.stepMs).toBeCloseTo(60_000 / GIF_MAX_FRAMES, 5);
    // Задержка выведена из реального шага (> целевого интервала).
    expect(plan.delayCs).toBeGreaterThan(10);
  });

  it('не увеличивает маленький источник (scale ≤ 1)', () => {
    const plan = planGif(1000, 320, 180);
    expect(plan.width).toBe(320);
    expect(plan.height).toBe(180);
  });

  it('приводит размеры к чётным ≥2', () => {
    const plan = planGif(1000, 321, 181);
    expect(plan.width % 2).toBe(0);
    expect(plan.height % 2).toBe(0);
    expect(plan.width).toBeGreaterThanOrEqual(2);
    expect(plan.height).toBeGreaterThanOrEqual(2);
  });

  it('неизвестная длительность → один кадр', () => {
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const plan = planGif(d, 640, 480);
      expect(plan.frameCount).toBe(1);
      expect(plan.stepMs).toBe(0);
      // Задержка при одном кадре — из целевого интервала, ≥2.
      expect(plan.delayCs).toBeGreaterThanOrEqual(2);
    }
  });

  it('битые/нулевые исходные размеры → дефолт maxWidth × 16:9', () => {
    for (const [w, h] of [
      [0, 0],
      [-10, 100],
      [Number.NaN, 100],
    ] as const) {
      const plan = planGif(1000, w, h);
      expect(plan.width).toBe(GIF_MAX_WIDTH);
      expect(plan.height).toBe(270);
    }
  });

  it('уважает переопределения опций (fps/maxWidth/maxFrames)', () => {
    const plan = planGif(10_000, 1920, 1080, { fps: 5, maxWidth: 240, maxFrames: 20 });
    // 10с @ 5fps → 50 кадров, но потолок 20.
    expect(plan.frameCount).toBe(20);
    expect(plan.width).toBe(240);
    expect(plan.height).toBe(134); // 1080*0.125=135 → чётное вниз = 134
    expect(plan.width % 2).toBe(0);
  });

  it('делит на дефолтную частоту, если fps не задан', () => {
    const plan = planGif(1000, 640, 480);
    expect(plan.frameCount).toBe(Math.round(1000 / (1000 / GIF_TARGET_FPS)));
  });

  it('задержка кадра не опускается ниже 2 сотых секунды', () => {
    const plan = planGif(100, 640, 480, { fps: 60, maxFrames: 1000 });
    expect(plan.delayCs).toBeGreaterThanOrEqual(2);
  });
});
