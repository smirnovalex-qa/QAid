/**
 * UI фичи «Запись экрана с аудио» (TASK-037), поверхность side panel.
 *
 * Поверхность — пульт управления записью, три фазы (idle → recording → ready) как в
 * редизайн-хендоффе. Привилегированные операции (добыть `streamId`, поднять offscreen,
 * бейдж) идут в `background` по типизированной шине (`screenrec/start` /
 * `screenrec/finalize`), а поток управления рекордером (start/stop/pause/resume) и
 * доставка готового `Blob` — по `BroadcastChannel` (`RECORDING_CHANNEL`, ADR-0045):
 * offscreen публикует события `state`/`progress`/`blob`/`error`, панель шлёт команды.
 *
 * Приватность — жёстко (PRD §): ролик остаётся локально, скачивание только по
 * подтверждению, пользователь предупреждён о возможном чувствительном контенте на
 * экране. Никакой внешней сети и никакой автозаписи без явного жеста.
 *
 * Вся модель/машина состояний — в чистой `logic.ts`; здесь только связывание с DOM
 * (канал, `<video>`, скачивание), настройками и раскладкой.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, FeaturePanel, SegmentedControl, Toggle, useToast } from '@/ui';
import { setToolStatus } from '@/ui/shell';
import { cn } from '@/ui/cn';
import { sendMessage } from '@/shared/messaging/bus';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import { openRecorderTab } from './recorder-tab/controller';
import type { RecorderTabHandle } from './recorder-tab/controller';
import {
  clampDuration,
  controlsFor,
  formatBytes,
  formatDuration,
  recordingFileName,
} from './logic';
import { screenRecordingBinding } from './settings';
import { encodeRecordingToGif } from './gif-export';
import type { GifProgress } from './gif-export';
import { DURATION_OPTIONS_MS, RECORDING_CHANNEL } from './types';
import type {
  RecorderCommand,
  RecorderErrorCode,
  RecorderEvent,
  RecordingResult,
  RecordingState,
} from './types';
import { MicIcon, TabAudioIcon } from './icons';
import styles from './screen-recording.module.css';

/** Локализованное сообщение по классу сбоя рекордера. */
function errorCodeToKey(code: RecorderErrorCode): string {
  switch (code) {
    case 'permission-denied':
      return 'screenRecording.error.permissionDenied';
    case 'unsupported':
      return 'screenRecording.error.unsupported';
    case 'capture-failed':
      return 'screenRecording.error.captureFailed';
    case 'recorder-failed':
      return 'screenRecording.error.recorderFailed';
    case 'no-data':
      return 'screenRecording.error.noData';
  }
}

/**
 * Отказ подготовки offscreen приходит свободной строкой (`reason` от background) —
 * мягко отображаем её на дружелюбный ключ. Захват видео теперь целиком в offscreen
 * (`getDisplayMedia`), поэтому вкладочных причин (`activeTab`/системная страница)
 * здесь больше нет: остаются общие — отмена/нет прав/не поддержано, иначе «не удалось».
 */
function reasonToKey(reason: string | undefined): string {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('cancel') || r.includes('отмен')) return 'screenRecording.error.cancelled';
  if (r.includes('permission') || r.includes('denied') || r.includes('доступ'))
    return 'screenRecording.error.permissionDenied';
  if (r.includes('unsupported')) return 'screenRecording.error.unsupported';
  return 'screenRecording.error.startFailed';
}

export function ScreenRecordingPanel(): JSX.Element {
  const settings = useSettings(screenRecordingBinding);
  const ready = settings.ready.value;

  // Персистентные опции (сидируем локальный стейт из биндинга, как в screenshot).
  const [mic, setMic] = useState<boolean>(screenRecordingBinding.value.value.mic);
  const [systemAudio, setSystemAudio] = useState<boolean>(
    screenRecordingBinding.value.value.systemAudio,
  );
  const [maxDurationMs, setMaxDurationMs] = useState<number>(
    screenRecordingBinding.value.value.maxDurationMs,
  );
  const [seeded, setSeeded] = useState(false);

  // Локальное UI-состояние сессии записи.
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RecordingResult | null>(null);
  // Какой формат ждёт подтверждения скачивания (единый диалог для WebM и GIF).
  const [pendingExport, setPendingExport] = useState<'webm' | 'gif' | null>(null);
  // Идёт конвертация в GIF (декод кадров + кодирование) + её прогресс.
  const [gifBusy, setGifBusy] = useState(false);
  const [gifProgress, setGifProgress] = useState<GifProgress | null>(null);
  // Идёт добыча источника/подготовка offscreen между кликом «Начать» и первым `state`.
  const [starting, setStarting] = useState(false);
  // Формат скачивания готового ролика (фаза ready): WebM или GIF.
  const [downloadFormat, setDownloadFormat] = useState<'webm' | 'gif'>('webm');

  const { show } = useToast();

  const channelRef = useRef<BroadcastChannel | null>(null);
  const mountedRef = useRef(true);
  const objectUrlRef = useRef<string | null>(null);
  const gifAbortRef = useRef<AbortController | null>(null);
  // Хендл открытой вкладки-рекордера (путь с микрофоном, bugfix 6); null — вкладки нет.
  const recorderTabRef = useRef<RecorderTabHandle | null>(null);

  /** Закрывает вкладку-рекордер, если она открыта (идемпотентно). */
  const closeRecorderTab = (): void => {
    const handle = recorderTabRef.current;
    recorderTabRef.current = null;
    if (handle !== null) void handle.close();
  };

  // Восстанавливаем сохранённые настройки один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    const v = screenRecordingBinding.value.value;
    setMic(v.mic);
    setSystemAudio(v.systemAudio);
    setMaxDurationMs(v.maxDurationMs);
    setSeeded(true);
  }, [ready, seeded]);

  // Канал управления/данных: события offscreen → UI и обратно команды.
  useEffect(() => {
    const channel = new BroadcastChannel(RECORDING_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (e: MessageEvent<RecorderEvent>): void => {
      const evt = e.data;
      switch (evt.evt) {
        case 'state':
          setRecordingState(evt.state);
          break;
        case 'progress':
          setElapsedMs(evt.elapsedMs);
          setSizeBytes(evt.sizeBytes);
          break;
        case 'blob': {
          if (objectUrlRef.current !== null) URL.revokeObjectURL(objectUrlRef.current);
          const objectUrl = URL.createObjectURL(evt.blob);
          objectUrlRef.current = objectUrl;
          setResult({
            blob: evt.blob,
            objectUrl,
            mimeType: evt.mimeType,
            durationMs: evt.durationMs,
            sizeBytes: evt.sizeBytes,
          });
          setSizeBytes(evt.sizeBytes);
          setRecordingState('ready');
          // Путь с микрофоном: запись шла в видимой вкладке — закрываем её (Blob уже у нас).
          closeRecorderTab();
          void sendMessage('screenrec/finalize', {});
          break;
        }
        case 'error':
          setError(t(errorCodeToKey(evt.code)));
          setRecordingState('error');
          // Сбой мог случиться уже после подготовки контекста (напр. пользователь закрыл
          // нативный пикер `getDisplayMedia`, который теперь живёт в offscreen) — снимаем
          // бейдж и закрываем offscreen-документ, чтобы REC-индикатор не «висел».
          void sendMessage('screenrec/finalize', {});
          break;
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
      gifAbortRef.current?.abort();
      closeRecorderTab();
      if (objectUrlRef.current !== null) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Зеркалим живую сессию в оболочку (home «Активно» + пилюля в хедере). В проде
  // источник — background/offscreen; здесь зеркалим UI-состояние. Чистим при idle/ready
  // и при размонтировании (ADR: статус — модульный signal, развязка фич и оболочки).
  useEffect(() => {
    const live = recordingState === 'recording' || recordingState === 'paused';
    const tail =
      recordingState === 'paused' ? t('screenRecording.pausedShort') : t('screenRecording.rec');
    const status = live ? { live: true, text: `${formatDuration(elapsedMs)} · ${tail}` } : null;
    // Отложенная запись: синхронная запись в signal оболочки реентерит рендер Preact.
    queueMicrotask(() => {
      if (mountedRef.current) setToolStatus('screen-recording', status);
    });
  }, [recordingState, elapsedMs]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      // Отложенно: синхронная запись в signal во время анмаунта реентерит teardown.
      queueMicrotask(() => {
        setToolStatus('screen-recording', null);
      });
    },
    [],
  );

  // ── персист настроек ─────────────────────────────────────────────────────────

  const persistMic = (next: boolean): void => {
    setMic(next);
    void screenRecordingBinding.update({ mic: next });
  };
  const persistSystemAudio = (next: boolean): void => {
    setSystemAudio(next);
    void screenRecordingBinding.update({ systemAudio: next });
  };
  const persistDuration = (next: number): void => {
    const clamped = clampDuration(next);
    setMaxDurationMs(clamped);
    void screenRecordingBinding.update({ maxDurationMs: clamped });
  };

  // ── команды в канал ──────────────────────────────────────────────────────────

  const postCommand = (command: RecorderCommand): void => {
    const channel = channelRef.current;
    if (channel === null) return;
    try {
      channel.postMessage(command);
    } catch (e) {
      logger.error('screenRecording.post', e);
    }
  };

  const clearResult = (): void => {
    gifAbortRef.current?.abort();
    if (objectUrlRef.current !== null) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setResult(null);
    setPendingExport(null);
    setGifBusy(false);
    setGifProgress(null);
  };

  // ── старт / управление ───────────────────────────────────────────────────────

  /** Готовит контекст записи через background: единственный offscreen-документ + бейдж. */
  const prepareRecording = async (): Promise<boolean> => {
    const res = await sendMessage('screenrec/start', {});
    if (!res.ok) {
      setError(t('screenRecording.error.startFailed'));
      return false;
    }
    if (!res.value.ok) {
      setError(t(reasonToKey(res.value.reason)));
      return false;
    }
    return true;
  };

  const handleStart = async (): Promise<void> => {
    if (channelRef.current === null) {
      setError(t('screenRecording.error.startFailed'));
      return;
    }
    setError('');
    clearResult();
    setElapsedMs(0);
    setSizeBytes(0);
    setStarting(true);
    try {
      await beginCapture();
    } finally {
      setStarting(false);
    }
  };

  const beginCapture = async (): Promise<void> => {
    const duration = clampDuration(maxDurationMs);

    // Путь С МИКРОФОНОМ — во вкладке-рекордере (bugfix 6): `getUserMedia` надёжно получает
    // грант только в СВОЁМ документе; грант из другой вкладки в offscreen НЕ пробрасывается
    // (корень бага «Доступ отклонён»). Панель лишь открывает вкладку — сам захват
    // (`getDisplayMedia` + микрофон) и события идут из неё по каналу под кликом «Начать» в
    // самой вкладке. Отказ приходит событием `error` (вкладка остаётся для повтора).
    if (mic) {
      if (recorderTabRef.current !== null) return; // вкладка уже открыта — не плодим вторую
      setRecordingState('requesting');
      const handle = await openRecorderTab({ systemAudio, mic: true, maxDurationMs: duration });
      recorderTabRef.current = handle;
      // Пользователь закрыл вкладку сам, не завершив запись → возвращаем панель в исходное.
      handle.onClosed(() => {
        recorderTabRef.current = null;
        setRecordingState((s) => (s === 'ready' ? s : 'idle'));
      });
      return;
    }

    // Путь БЕЗ микрофона — прежний бесшовный: offscreen + бейдж. Сам захват видео —
    // `getDisplayMedia` уже в offscreen: нативный пикер «Выберите, чем поделиться»
    // открывается при КАЖДОМ старте. Его отмена придёт событием `error` по каналу и снимет
    // бейдж/offscreen (см. обработчик канала).
    if (!(await prepareRecording())) return;

    postCommand({ cmd: 'start', systemAudio, mic, maxDurationMs: duration });
  };

  const handleStop = (): void => {
    postCommand({ cmd: 'stop' });
  };
  const handlePause = (): void => {
    postCommand({ cmd: 'pause' });
  };
  const handleResume = (): void => {
    postCommand({ cmd: 'resume' });
  };

  const handleDiscard = (): void => {
    clearResult();
    setRecordingState('idle');
    setElapsedMs(0);
    setSizeBytes(0);
    setError('');
    void sendMessage('screenrec/finalize', {});
  };

  // ── скачивание (по подтверждению) ─────────────────────────────────────────────

  const triggerDownload = (blob: Blob, ext: string): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = recordingFileName(new Date(), ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const doDownloadWebm = (): void => {
    if (result === null) return;
    try {
      triggerDownload(result.blob, 'webm');
      show(t('screenRecording.downloaded'), { severity: 'success' });
    } catch (e) {
      logger.error('screenRecording.download', e);
      setError(t('screenRecording.error.download'));
    }
  };

  const doDownloadGif = async (): Promise<void> => {
    if (result === null || gifBusy) return;
    const controller = new AbortController();
    gifAbortRef.current = controller;
    setGifBusy(true);
    setGifProgress({ phase: 'decoding', done: 0, total: 0 });
    setError('');
    try {
      const gifBlob = await encodeRecordingToGif(result.blob, {
        signal: controller.signal,
        onProgress: (p) => {
          setGifProgress(p);
        },
      });
      triggerDownload(gifBlob, 'gif');
      show(t('screenRecording.gifDownloaded'), { severity: 'success' });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        logger.error('screenRecording.gif', e);
        setError(t('screenRecording.error.gifExport'));
      }
    } finally {
      setGifBusy(false);
      setGifProgress(null);
      gifAbortRef.current = null;
    }
  };

  const confirmExportNow = (): void => {
    const format = pendingExport;
    setPendingExport(null);
    if (format === 'webm') {
      doDownloadWebm();
    } else if (format === 'gif') {
      void doDownloadGif();
    }
  };

  const cancelGif = (): void => {
    gifAbortRef.current?.abort();
  };

  const controls = controlsFor(recordingState);
  const isRecording = recordingState === 'recording' || recordingState === 'finalizing';
  const isPaused = recordingState === 'paused';
  const isActive = isRecording || isPaused || recordingState === 'requesting';
  const isReady = recordingState === 'ready' && result !== null;
  const isIdle = !isActive && !isReady;

  const progress = maxDurationMs > 0 ? Math.min(1, elapsedMs / maxDurationMs) : 0;
  const nearLimit = progress > 0.85;
  const remainingMs = Math.max(0, maxDurationMs - elapsedMs);
  const audioLine =
    [
      mic && t('screenRecording.mic').toLowerCase(),
      systemAudio && t('screenRecording.systemAudio').toLowerCase(),
    ]
      .filter(Boolean)
      .join(' + ') || t('screenRecording.audio.none');

  return (
    <FeaturePanel bare description={t('feature.screenRecording.desc')}>
      <div class={styles.panel} data-testid="screen-recording">
        {error !== '' && (
          <p role="alert" class={styles.error} data-testid="screen-recording-error">
            {error}
          </p>
        )}

        {/* ── IDLE: аудио-карточка + авто-стоп + запуск ── */}
        {isIdle && (
          <>
            <div class={styles.switchCard}>
              <div class={styles.switchRow}>
                <Toggle
                  variant="plain"
                  label={t('screenRecording.mic')}
                  help={t('screenRecording.mic.help')}
                  icon={<MicIcon />}
                  checked={mic}
                  onChange={persistMic}
                />
              </div>
              <div class={styles.switchRow}>
                <Toggle
                  variant="plain"
                  label={t('screenRecording.systemAudio')}
                  help={t('screenRecording.systemAudio.help')}
                  icon={<TabAudioIcon />}
                  checked={systemAudio}
                  onChange={persistSystemAudio}
                />
              </div>
            </div>

            <div class={styles.inlineRow}>
              <span class={styles.inlineLabel}>{t('screenRecording.stopsAfter')}</span>
              <SegmentedControl
                size="sm"
                class={styles.inlineSeg}
                label={t('screenRecording.stopsAfter')}
                value={String(maxDurationMs)}
                onChange={(v) => {
                  persistDuration(Number(v));
                }}
                options={DURATION_OPTIONS_MS.map((ms) => ({
                  value: String(ms),
                  label: t('screenRecording.duration.min', { count: Math.round(ms / 60_000) }),
                }))}
              />
            </div>

            <Button
              block
              class={styles.bigBtn}
              loading={starting}
              onClick={() => {
                void handleStart();
              }}
            >
              <span class={styles.recDot} aria-hidden="true" />
              {t('screenRecording.start')}
            </Button>
            <p class={styles.note}>{t('screenRecording.privacy')}</p>
          </>
        )}

        {/* ── RECORDING: центрированная карточка + стоп/пауза ── */}
        {isActive && (
          <>
            <div class={styles.recCard} data-testid="screen-recording-status">
              <span class={cn(styles.recBadge, isPaused && styles.recBadgePaused)}>
                <span class={styles.recDotRed} aria-hidden="true" />
                {isPaused
                  ? t('screenRecording.status.paused')
                  : t('screenRecording.status.recording')}
              </span>
              <span
                class={styles.timer}
                role="timer"
                aria-live="polite"
                aria-label={t('screenRecording.timer')}
              >
                {formatDuration(elapsedMs)}
              </span>
              <div class={styles.track}>
                <div
                  class={cn(styles.fill, nearLimit && styles.fillNear)}
                  style={{ width: `${(progress * 100).toFixed(1)}%` }}
                />
              </div>
              <span class={styles.recFoot}>
                {t('screenRecording.stopsIn')} {formatDuration(remainingMs)} · {audioLine} ·{' '}
                {formatBytes(sizeBytes)}
              </span>
            </div>

            <div class={styles.controlGrid}>
              {controls.canResume ? (
                <Button variant="secondary" onClick={handleResume}>
                  {t('screenRecording.resume')}
                </Button>
              ) : (
                <Button variant="secondary" disabled={!controls.canPause} onClick={handlePause}>
                  {t('screenRecording.pause')}
                </Button>
              )}
              <Button
                variant="danger"
                class={styles.stopBtn}
                disabled={!controls.canStop}
                onClick={handleStop}
              >
                <span class={styles.stopSquare} aria-hidden="true" />
                {t('screenRecording.stop')}
              </Button>
            </div>
          </>
        )}

        {/* ── READY: предпросмотр + формат + экспорт ── */}
        {isReady && (
          <>
            <div class={styles.preview}>
              <video
                class={styles.video}
                controls
                src={result.objectUrl}
                aria-label={t('screenRecording.preview')}
              />
              <span class={styles.previewMeta}>{formatDuration(result.durationMs)}</span>
            </div>

            <SegmentedControl
              label={t('screenRecording.format')}
              value={downloadFormat}
              onChange={(v) => {
                setDownloadFormat(v as 'webm' | 'gif');
              }}
              options={[
                { value: 'webm', label: t('screenRecording.fmt.webm') },
                { value: 'gif', label: t('screenRecording.fmt.gif') },
              ]}
            />
            <span class={styles.fmtHelp}>
              {downloadFormat === 'gif'
                ? t('screenRecording.gifNote')
                : formatBytes(result.sizeBytes)}
            </span>

            <Button
              block
              class={styles.bigBtn}
              loading={gifBusy}
              disabled={gifBusy}
              onClick={() => {
                setPendingExport(downloadFormat);
              }}
            >
              {gifBusy
                ? t('screenRecording.gifExporting')
                : downloadFormat === 'gif'
                  ? t('screenRecording.downloadGif')
                  : t('screenRecording.download')}
            </Button>

            <div class={styles.controlGrid}>
              <Button variant="secondary" disabled={gifBusy} onClick={handleDiscard}>
                {t('screenRecording.again')}
              </Button>
              <Button
                variant="secondary"
                class={styles.discard}
                disabled={gifBusy}
                onClick={handleDiscard}
              >
                {t('screenRecording.discard')}
              </Button>
            </div>

            {gifBusy && (
              <div
                class={styles.gifProgress}
                data-testid="screenrec-gif-progress"
                aria-live="polite"
              >
                <span class={styles.footMeta}>
                  {gifProgress !== null && gifProgress.total > 0
                    ? `${t('screenRecording.gifExporting')} ${String(gifProgress.done)}/${String(gifProgress.total)}`
                    : t('screenRecording.gifExporting')}
                </span>
                <Button variant="secondary" size="sm" onClick={cancelGif}>
                  {t('screenRecording.cancel')}
                </Button>
              </div>
            )}

            {pendingExport !== null && (
              <div
                class={styles.confirm}
                role="alertdialog"
                aria-label={t('screenRecording.download')}
                data-testid="screenrec-confirm"
              >
                <p class={styles.confirmText}>
                  {pendingExport === 'gif'
                    ? t('screenRecording.confirmDownloadGif')
                    : t('screenRecording.confirmDownload')}
                </p>
                <div class={styles.confirmActions}>
                  <Button onClick={confirmExportNow}>{t('screenRecording.confirm')}</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPendingExport(null);
                    }}
                  >
                    {t('screenRecording.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </FeaturePanel>
  );
}
