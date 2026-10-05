/**
 * Построение композитного `MediaStream` для записи (TASK-037, ADR-0045).
 *
 * Живёт в offscreen-документе (есть DOM/`navigator`/`AudioContext`; в service worker
 * их нет). Видео добывается ЕДИНСТВЕННЫМ путём — стандартным `getDisplayMedia` прямо
 * здесь (нативный пикер поверхности открывается при каждом старте): с ревизии
 * 2026-09-21 (bugfix 4) вкладочный `chromeMediaSource`-путь удалён, чтобы флоу был один
 * и предсказуемый. Звук системы/вкладки берётся тем же `getDisplayMedia` (чекбокс
 * «Поделиться звуком»), микрофон — отдельным `getUserMedia`; при необходимости они
 * микшируются через `AudioContext` + `MediaStreamAudioDestinationNode`. Возвращает
 * готовый поток и `stop()`, который ОБЯЗАТЕЛЬНО останавливает все треки всех источников
 * — иначе OS-индикатор захвата экрана/микрофона остаётся активным после остановки
 * записи. Ошибки пробрасываются — их маппит в `RecorderErrorCode` вызывающий
 * (offscreen/index.ts).
 */

export interface BuildStreamInput {
  /** Запросить звук системы/вкладки у `getDisplayMedia` (чекбокс «Поделиться звуком»). */
  systemAudio: boolean;
  /** Домешать микрофон (`getUserMedia({ audio:true })`; право предзапрошено в UI). */
  mic: boolean;
}

export interface BuiltStream {
  /** Итоговый поток для `MediaRecorder` (видео + смикшированное аудио). */
  stream: MediaStream;
  /** Останавливает все треки всех источников и закрывает `AudioContext`. Идемпотентно. */
  stop: () => void;
}

/**
 * Строит поток записи: `getDisplayMedia` (видео + опц. звук системы) плюс опц. микрофон.
 *
 * В отличие от старого `chromeMediaSource:'tab'`-пути, `getDisplayMedia` НЕ глушит
 * источник, поэтому монитор-loopback звука в колонки больше не нужен (иначе было бы эхо).
 */
export async function buildRecordingStream(input: BuildStreamInput): Promise<BuiltStream> {
  const { systemAudio, mic } = input;

  const captureStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    // `true` показывает в пикере чекбокс «Поделиться звуком»: для вкладки — звук вкладки,
    // для целого экрана — системный звук (на поддерживающих ОС). Реальное наличие трека
    // зависит от выбора пользователя, поэтому дальше проверяем `getAudioTracks()`.
    audio: systemAudio,
  });

  // Все потоки-источники — для гарантированной остановки треков в stop().
  const sourceStreams: MediaStream[] = [captureStream];
  let audioContext: AudioContext | undefined;

  const hasSystemAudio = captureStream.getAudioTracks().length > 0;

  let micStream: MediaStream | undefined;
  if (mic) {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    sourceStreams.push(micStream);
  }
  const hasMic = micStream !== undefined && micStream.getAudioTracks().length > 0;

  const videoTrack = captureStream.getVideoTracks()[0];

  let finalStream: MediaStream;
  if (!hasSystemAudio && !hasMic) {
    // Аудио нет — только видео-трек.
    finalStream = videoTrack ? new MediaStream([videoTrack]) : new MediaStream();
  } else if (hasSystemAudio && !hasMic) {
    // Только звук системы без микрофона — captureStream уже video+audio, берём как есть.
    finalStream = captureStream;
  } else {
    // Микрофон присутствует (со звуком системы или без) — микшируем всё аудио в один
    // destination-нод через единый `AudioContext`.
    audioContext ??= new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    if (hasSystemAudio) {
      audioContext.createMediaStreamSource(captureStream).connect(destination);
    }
    if (micStream) {
      audioContext.createMediaStreamSource(micStream).connect(destination);
    }
    const tracks: MediaStreamTrack[] = [];
    if (videoTrack) tracks.push(videoTrack);
    tracks.push(...destination.stream.getAudioTracks());
    finalStream = new MediaStream(tracks);
  }

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const s of [...sourceStreams, finalStream]) {
      for (const track of s.getTracks()) {
        track.stop();
      }
    }
    void audioContext?.close();
  };

  return { stream: finalStream, stop };
}
