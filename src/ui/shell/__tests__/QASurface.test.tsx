/**
 * Компонентные тесты единой поверхности для трёх вариантов (TASK-062).
 * Проверяем: аффорданс «Открепить на страницу» виден в popup/side panel и скрыт в
 * плавающей панели; `PANEL_ONLY`-инструмент блокируется только в popup, а в панели/side
 * panel рендерится; обработчик открепления шлёт `floating-panel/open` и локализует отказ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import type * as PlatformModule from '@/platform';
import '@/features'; // метаданные каталога (ленивые тела) для HomeView/таксономии

const sendMessage = vi.fn<(type: string, payload: unknown) => Promise<unknown>>();
const queryActive = vi.fn<() => Promise<number | undefined>>();
const sidePanelOpen = vi.fn<(o: { windowId: number }) => Promise<void>>();
/** Журнал порядка: staging навигации должен предшествовать open. */
let order: string[] = [];

vi.mock('@/shared/messaging/bus', () => ({
  sendMessage: (type: string, payload: unknown) => sendMessage(type, payload),
}));
vi.mock('@/platform', async () => {
  const actual = await vi.importActual<typeof PlatformModule>('@/platform');
  return {
    ...actual,
    tabs: { ...actual.tabs, queryActive: () => queryActive() },
    sidePanel: {
      ...actual.sidePanel,
      open: async (o: { windowId: number }) => {
        order.push('open');
        await sidePanelOpen(o);
      },
    },
    browser: {
      ...actual.browser,
      windows: { ...actual.browser.windows, getCurrent: () => Promise.resolve({ id: 5 }) },
    },
  };
});

const { QASurface } = await import('@/ui/shell'); // барель импортирует ./i18n (строки shell.*)
const { ToastProvider } = await import('@/ui/components');
const { storageLocal } = await import('@/platform');

function renderSurface(variant: 'popup' | 'sidepanel' | 'panel') {
  return render(
    <ToastProvider>
      <QASurface variant={variant} />
    </ToastProvider>,
  );
}

const DETACH = 'Открепить на страницу'; // дефолтная локаль i18n — ru

beforeEach(() => {
  sendMessage.mockReset();
  queryActive.mockReset();
  sidePanelOpen.mockReset();
  sidePanelOpen.mockResolvedValue(undefined);
  order = [];
});

describe('QASurface — аффорданс открепления', () => {
  it('popup: показывает «Открепить» и «Открыть side panel»', () => {
    renderSurface('popup');
    expect(screen.getByLabelText(DETACH)).toBeInTheDocument();
    expect(screen.getByLabelText('Открыть side panel')).toBeInTheDocument();
  });

  it('side panel: показывает «Открепить», но не «Открыть side panel»', () => {
    renderSurface('sidepanel');
    expect(screen.getByLabelText(DETACH)).toBeInTheDocument();
    expect(screen.queryByLabelText('Открыть side panel')).toBeNull();
  });

  it('panel: аффорданс открепления скрыт (поверхность уже на странице)', () => {
    renderSurface('panel');
    expect(screen.queryByLabelText(DETACH)).toBeNull();
  });

  it('клик «Открепить» шлёт floating-panel/open с id активной вкладки', async () => {
    queryActive.mockResolvedValue(7);
    sendMessage.mockResolvedValue({ ok: true, value: { ok: true } });
    renderSurface('popup');

    fireEvent.click(screen.getByLabelText(DETACH));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('floating-panel/open', { tabId: 7 });
    });
  });

  it('отказ (служебная страница) показывает локализованный тост', async () => {
    queryActive.mockResolvedValue(3);
    sendMessage.mockResolvedValue({ ok: false, error: { code: 'PRIVILEGED_PAGE', message: 'x' } });
    renderSurface('sidepanel');

    fireEvent.click(screen.getByLabelText(DETACH));
    expect(
      await screen.findByText('Панель не работает на этой служебной странице браузера.'),
    ).toBeInTheDocument();
  });

  it('нет активной вкладки — тост «не удалось определить вкладку», без отправки', async () => {
    queryActive.mockResolvedValue(undefined);
    renderSurface('popup');

    fireEvent.click(screen.getByLabelText(DETACH));
    expect(await screen.findByText('Не удалось определить активную вкладку.')).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('QASurface — PANEL_ONLY в разных вариантах', () => {
  /** Сид навигации: открыть tool-view на PANEL_ONLY-инструменте для варианта. */
  async function seedTool(surface: string): Promise<void> {
    await storageLocal.set({
      [`ui.surface.view.${surface}`]: 'tool',
      [`ui.surface.tool.${surface}`]: 'inspector-probe',
    });
  }

  it('popup: PANEL_ONLY-инструмент показывает fallback «открыть side panel»', async () => {
    await seedTool('popup');
    renderSurface('popup');
    // PopupFallback содержит заголовок shell.panelTitle.
    expect(await screen.findByText('Работает в боковой панели')).toBeInTheDocument();
  });

  it('panel: тот же PANEL_ONLY-инструмент НЕ блокируется (панель персистентна)', async () => {
    await seedTool('panel');
    renderSurface('panel');
    // Fallback не появляется — грузится тело инструмента (status «Загрузка инструмента…»).
    await waitFor(() => {
      expect(screen.queryByText('Работает в боковой панели')).toBeNull();
    });
  });
});

describe('QASurface — hand-off инструмента popup → side panel', () => {
  async function seedPopupTool(tool: string): Promise<void> {
    await storageLocal.set({
      'ui.surface.view.popup': 'tool',
      'ui.surface.tool.popup': tool,
      // «Последнее» состояние side panel — другое: оно не должно победить.
      'ui.surface.view.sidepanel': 'home',
      'ui.surface.tool.sidepanel': 'storage-editor',
    });
  }

  it('fallback «Открыть side panel» стейджит tool/view side panel до open', async () => {
    await seedPopupTool('inspector-probe');
    renderSurface('popup');
    // Ждём гидратацию: fallback появляется только когда popup открылся на инструменте.
    await screen.findByText('Работает в боковой панели');
    fireEvent.click(screen.getAllByRole('button', { name: 'Открыть side panel' }).at(-1)!);

    await waitFor(() => {
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 5 });
    });
    const saved = await storageLocal.get({
      'ui.surface.view.sidepanel': '',
      'ui.surface.tool.sidepanel': '',
    });
    expect(saved['ui.surface.view.sidepanel']).toBe('tool');
    expect(saved['ui.surface.tool.sidepanel']).toBe('inspector-probe');
  });

  it('иконка в шапке на home не стейджит навигацию, но открывает панель', async () => {
    await storageLocal.set({
      'ui.surface.view.popup': 'home',
      'ui.surface.view.sidepanel': 'settings',
      'ui.surface.tool.sidepanel': '',
    });
    renderSurface('popup');
    fireEvent.click(screen.getByLabelText('Открыть side panel'));

    await waitFor(() => {
      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
    });
    const saved = await storageLocal.get({ 'ui.surface.view.sidepanel': '' });
    expect(saved['ui.surface.view.sidepanel']).toBe('settings');
  });
});
