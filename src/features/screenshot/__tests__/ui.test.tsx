import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, setLocale } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

// Платформенные швы и адаптер захвата мокаем ДО импорта UI (vi.mock поднимается вверх).
vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return {
    ...actual,
    tabs: {
      ...actual.tabs,
      queryActive: () => Promise.resolve(1),
      getUrl: () => Promise.resolve('https://example.com'),
    },
  };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return {
    ...actual,
    createPermissionBroker: () => ({
      ensure: () => Promise.resolve(true),
      has: () => Promise.resolve(true),
    }),
  };
});
vi.mock('@/features/screenshot/capture', () => ({
  captureVisible: vi.fn(),
  captureElement: vi.fn(),
  captureFullPage: vi.fn(),
}));

import { sendMessage } from '@/shared/messaging/bus';
import { captureVisible, captureFullPage } from '@/features/screenshot/capture';
import { ToastProvider } from '@/ui/components';
import { ScreenshotPanel } from '@/features/screenshot/ui';
import ru from '@/features/screenshot/i18n/ru';

mergeCatalog('ru', ru);

const mockedCaptureVisible = captureVisible as unknown as Mock;
const mockedCaptureFullPage = captureFullPage as unknown as Mock;
const mockedSendMessage = sendMessage as unknown as Mock;

// 1×1 прозрачный PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function renderPanel(): void {
  render(
    <ToastProvider>
      <ScreenshotPanel />
    </ToastProvider>,
  );
}

/**
 * Открывает редактор side panel: в idle кликает строку режима «Вся страница»
 * (видимая область теперь идёт in-page потоком, не открывая редактор панели).
 */
async function capture(): Promise<void> {
  mockedCaptureFullPage.mockResolvedValue({ dataUrl: PNG, width: 4, height: 4 });
  fireEvent.click(screen.getByRole('button', { name: /Вся страница/ }));
  await waitFor(() => {
    expect(screen.getByTestId('screenshot-tools')).toBeInTheDocument();
  });
}

beforeEach(() => {
  setLocale('ru');
  mockedCaptureVisible.mockReset();
  mockedCaptureFullPage.mockReset();
  mockedSendMessage.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ScreenshotPanel', () => {
  it('shows the three capture-mode options and no editor until a capture is taken', () => {
    renderPanel();
    expect(screen.getByTestId('screenshot')).toBeInTheDocument();
    // Три крупные строки выбора режима (v3 idle).
    expect(screen.getByRole('button', { name: /Видимая область/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Один элемент/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Вся страница/ })).toBeInTheDocument();
    // Редактора (панель инструментов) ещё нет — снимок не сделан.
    expect(screen.queryByTestId('screenshot-tools')).not.toBeInTheDocument();
  });

  it('routes the default (visible) mode through the in-page flow', async () => {
    mockedCaptureVisible.mockResolvedValue({ dataUrl: PNG, width: 4, height: 4 });
    mockedSendMessage.mockResolvedValue({ ok: true, value: { status: 'cancelled' } });
    renderPanel();
    // Строка «Видимая область» ведёт in-page поток (заморозка экрана).
    fireEvent.click(screen.getByRole('button', { name: /Видимая область/ }));
    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith(
        'screenshot/editInPage',
        expect.objectContaining({ tabId: 1 }),
      );
    });
    // In-page поток не открывает редактор side panel.
    expect(screen.queryByTestId('screenshot-tools')).not.toBeInTheDocument();
  });

  it('captures via the side-panel editor for non-visible modes', async () => {
    renderPanel();
    await capture();
    expect(mockedCaptureFullPage).toHaveBeenCalledTimes(1);
    expect(mockedSendMessage).not.toHaveBeenCalled();
    expect(screen.getByTestId('screenshot-canvas')).toBeInTheDocument();
  });

  it('toggles the active tool (aria-pressed)', async () => {
    renderPanel();
    await capture();
    const arrow = screen.getByRole('button', { name: 'Стрелка', pressed: false });
    fireEvent.click(arrow);
    expect(screen.getByRole('button', { name: 'Стрелка' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps undo/redo disabled with no annotations', async () => {
    renderPanel();
    await capture();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вернуть' })).toBeDisabled();
  });

  it('downloads directly with no confirm dialog', async () => {
    // Заглушки экспортного конвейера: jsdom не грузит `Image` и не даёт canvas-2d.
    class FakeImage {
      onload: (() => void) | null = null;
      width = 4;
      height = 4;
      set src(_value: string) {
        // Синхронная «загрузка»: onload вызывается сразу при установке src.
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const ctxStub = {
      canvas: { width: 4, height: 4 },
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctxStub);
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb: BlobCallback) => {
        cb(new Blob([''], { type: 'image/png' }));
      });
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    renderPanel();
    await capture();
    // Никакого баннера подтверждения больше нет — скачивание идёт напрямую.
    expect(screen.queryByTestId('screenshot-confirm')).not.toBeInTheDocument();

    // Загрузка базового изображения в редактор идёт через отложенный эффект, поэтому
    // кликаем скачивание в retry-цикле, пока экспортный конвейер не отработает.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Скачать PNG' }));
      expect(createObjectURL).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('screenshot-confirm')).not.toBeInTheDocument();

    clickSpy.mockRestore();
    toBlobSpy.mockRestore();
    getContextSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('opens an inline caption input where the canvas is clicked (Paint-style)', async () => {
    renderPanel();
    await capture();
    // Пока инструмент не «Текст» — инпута нет даже при клике.
    expect(screen.queryByTestId('screenshot-text-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Текст' }));
    // Клик по холсту ставит инлайн-инпут в точке (Pointer Events полифиллены в setup).
    fireEvent.pointerDown(screen.getByTestId('screenshot-canvas'), { clientX: 12, clientY: 8 });
    const input = await screen.findByTestId('screenshot-text-input');
    expect(input).toBeInTheDocument();
    // Esc убирает инпут без фиксации подписи.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('screenshot-text-input')).not.toBeInTheDocument();
  });

  it('surfaces an error when capture fails', async () => {
    renderPanel();
    // «Видимая область» идёт in-page: кадр вьюпорта не снялся → ошибка.
    mockedCaptureVisible.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: /Видимая область/ }));
    await waitFor(() => {
      expect(screen.getByTestId('screenshot-error')).toBeInTheDocument();
    });
  });
});
