/**
 * Тест эталонного инспектора (TASK-052 → TASK-056): живой режим осмотра через общий хук
 * `useInspectedNode({ live: true })` — тумблер «Осмотреть»/«Осматриваю…», проваливание
 * кликом (pick-loop поверх `inspection/pickLive`), отрисовка `HierarchyNav`, шаг навигации,
 * обратная подсветка (`onHoverTarget` → `inspection/highlight`) и «Отмена».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return { ...actual, tabs: { ...actual.tabs, queryActive: () => Promise.resolve(1) } };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return { ...actual, createPermissionBroker: () => ({ ensure: () => Promise.resolve(true) }) };
});

import { sendMessage } from '@/shared/messaging/bus';
import { ToastProvider } from '@/ui/components';
import { InspectorProbePanel } from '@/features/inspector-probe/ui';

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <InspectorProbePanel />
    </ToastProvider>,
  );
}

function node(tag: string, selector: string, extra: Record<string, unknown> = {}) {
  return {
    tagName: tag,
    id: null,
    classNames: [],
    selector,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    childElementCount: 1,
    siblingIndex: 0,
    siblingCount: 1,
    depth: 3,
    ...extra,
  };
}

const leaf = node('span', 'span#leaf', { childElementCount: 0, depth: 3 });
const parent = node('div', 'div#wrap', { childElementCount: 1, depth: 2 });

const leafState = {
  node: leaf,
  path: [node('html', 'html', { depth: 0 }), node('body', 'body', { depth: 1 }), parent, leaf],
  canAscend: true,
  canDescend: false,
};
const parentState = {
  node: parent,
  path: [node('html', 'html', { depth: 0 }), node('body', 'body', { depth: 1 }), parent],
  canAscend: true,
  canDescend: true,
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

const startLabel = t('inspection.probe.pick');
const inspectingName = t('inspection.probe.stop');

beforeEach(() => {
  mockedSend.mockReset();
  // По умолчанию живой режим «проваливается» один раз (leaf), затем резолвится null —
  // pick-loop выходит, сохраняя узел (панель не гаснет).
  let liveCalls = 0;
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/pickLive') {
      liveCalls += 1;
      return Promise.resolve(
        liveCalls === 1
          ? { ok: true, value: { ...leaf, navigation: leafState } }
          : { ok: true, value: null },
      );
    }
    if (type === 'inspection/navigate') {
      return Promise.resolve({ ok: true, value: parentState });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
});

describe('InspectorProbePanel (живой режим)', () => {
  it('после проваливания кликом рисует дескриптор и навигатор', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: startLabel }));

    await waitFor(() => {
      expect(screen.getByTestId('hierarchy-nav')).toBeInTheDocument();
    });
    expect(mockedSend).toHaveBeenCalledWith('inspection/pickLive', { tabId: 1 });
    // Лист: спуск заблокирован, breadcrumb из 4 крошек.
    expect(screen.getByTestId('hierarchy-child')).toBeDisabled();
    expect(screen.getAllByTestId('hierarchy-crumb')).toHaveLength(4);
  });

  it('тумблер отражает активный живой режим (aria-pressed, хинт, стоп)', async () => {
    const pending = deferred<{ ok: true; value: unknown }>();
    let liveCalls = 0;
    mockedSend.mockImplementation((type: string) => {
      if (type === 'inspection/pickLive') {
        liveCalls += 1;
        // Первый вызов «висит» (ждёт клика) — режим остаётся активным.
        return liveCalls === 1 ? pending.promise : Promise.resolve({ ok: true, value: null });
      }
      return Promise.resolve({ ok: true, value: { ok: true } });
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: startLabel }));

    await waitFor(() => {
      expect(screen.getByTestId('inspector-probe-live-hint')).toBeInTheDocument();
    });
    const toggle = screen.getByRole('button', { name: inspectingName });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Клик по активному тумблеру = выход из live (сохраняя узел).
    fireEvent.click(toggle);
    await settle();
    expect(mockedSend).toHaveBeenCalledWith('inspection/pickLiveStop', { tabId: 1 });

    pending.resolve({ ok: true, value: null }); // развязываем висящий промис
    await settle();
  });

  it('шаг «родитель» шлёт inspection/navigate и обновляет узел', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: startLabel }));
    await waitFor(() => expect(screen.getByTestId('hierarchy-nav')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('hierarchy-parent'));
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('inspection/navigate', {
        tabId: 1,
        step: 'parent',
        depth: undefined,
      });
    });
    // Перешли к #wrap → спуск снова доступен.
    await waitFor(() => expect(screen.getByTestId('hierarchy-child')).not.toBeDisabled());
  });

  it('обратная подсветка: наведение на предка в breadcrumb шлёт inspection/highlight', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: startLabel }));
    await waitFor(() => expect(screen.getByTestId('hierarchy-nav')).toBeInTheDocument());

    fireEvent.mouseEnter(
      screen.getByRole('button', { name: t('inspection.nav.goTo', { selector: 'div#wrap' }) }),
    );
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('inspection/highlight', {
        tabId: 1,
        selector: 'div#wrap',
      });
    });
  });

  it('«Отмена» шлёт teardown и снимает навигатор', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: startLabel }));
    await waitFor(() => expect(screen.getByTestId('hierarchy-nav')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: t('inspection.cancel') }));
    await settle();
    expect(screen.queryByTestId('hierarchy-nav')).not.toBeInTheDocument();
    expect(mockedSend).toHaveBeenCalledWith('inspection/teardown', { tabId: 1 });
  });
});
