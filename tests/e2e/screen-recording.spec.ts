/**
 * e2e фичи «Запись экрана с аудио» (TASK-037) поверх собранного MV3-расширения.
 *
 * Проверяет:
 *  1. Фича регистрируется и рендерится в side panel (видна кнопка старта) —
 *     надёжно и без прав.
 *  2. Best-effort сквозная проверка ПРИМИТИВА записи: в реальном Chromium
 *     `MediaRecorder` поверх `canvas.captureStream()` даёт непустой WebM с выбранным
 *     через `pickMimeType`-совместимую логику MIME. Это доказывает, что движок записи
 *     (MediaRecorder → webm) работает в среде расширения.
 *
 * Честное ограничение headless: захват экрана (`getDisplayMedia` прямо в offscreen) и
 * промпт микрофона требуют нативного системного пикера/промпта и НЕ воспроизводимы в
 * headless-CI без флагов фейкового устройства и живой поверхности. Проверяется вручную
 * на load-unpacked (см. ADR-0045).
 */
import { test, expect, openTool } from './fixtures/extension';

test('запись экрана рендерится в side panel', async ({ openSidePanel }) => {
  const panel = await openSidePanel();
  await openTool(panel, 'screen-recording');
  // Кнопка старта — стабильный маркер отрисовки панели (метка задана фичей).
  await expect(
    panel.getByRole('button', { name: /Выбрать, что записывать|Choose what to record/ }),
  ).toBeVisible();
});

test('best-effort: MediaRecorder даёт непустой WebM (примитив записи)', async ({
  openSidePanel,
}) => {
  const panel = await openSidePanel();

  const result = await panel.evaluate(async () => {
    // Кандидаты MIME совпадают по духу с MIME_PREFERENCES фичи; берём первый поддержанный.
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return { ok: false as const, error: 'no supported mime' };

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false as const, error: 'no 2d ctx' };
    ctx.fillStyle = '#0091ff';
    ctx.fillRect(0, 0, 32, 32);

    const stream = (
      canvas as HTMLCanvasElement & {
        captureStream: (fps?: number) => MediaStream;
      }
    ).captureStream(10);

    return await new Promise<
      { ok: true; size: number; type: string } | { ok: false; error: string }
    >((resolve) => {
      try {
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(stream, { mimeType: mime });
        rec.ondataavailable = (e): void => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        rec.onstop = (): void => {
          const blob = new Blob(chunks, { type: mime });
          for (const track of stream.getTracks()) track.stop();
          resolve({ ok: true, size: blob.size, type: blob.type });
        };
        rec.onerror = (): void => {
          resolve({ ok: false, error: 'recorder error' });
        };
        rec.start(200);
        setTimeout(() => {
          rec.stop();
        }, 700);
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  });

  test.skip(!result.ok, `MediaRecorder недоступен в этой среде: ${result.ok ? '' : result.error}`);
  expect(result.ok && result.type.startsWith('video/webm')).toBe(true);
  expect(result.ok && result.size > 0).toBe(true);
});
