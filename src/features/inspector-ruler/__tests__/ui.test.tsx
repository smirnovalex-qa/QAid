/**
 * Тест линейки (редизайн v3): сегмент режимов, единая основная кнопка с последовательным
 * выбором A→B, строки измерения, box-model через осмотр узла и навигацию по иерархии,
 * копирование и сообщение об отмене. Логика (`measureBetween`/`formatMeasurement`) не менялась.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
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
import ru from '@/features/inspector-ruler/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { InspectorRulerPanel } from '@/features/inspector-ruler/ui';
import { rulerBinding } from '@/features/inspector-ruler/settings';
import { RULER_SETTINGS_DEFAULTS } from '@/shared/inspection/ruler/types';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

const elemA = {
  tagName: 'div',
  id: 'a',
  classNames: [],
  selector: '#a',
  rect: { x: 0, y: 0, width: 100, height: 50 },
};
const elemB = {
  tagName: 'div',
  id: 'b',
  classNames: [],
  selector: '#b',
  rect: { x: 150, y: 0, width: 100, height: 50 },
};

const boxModel = {
  rect: { x: 10, y: 20, width: 200, height: 100 },
  content: { width: 176, height: 88 },
  padding: { top: 5, right: 10, bottom: 5, left: 10 },
  border: { top: 1, right: 2, bottom: 1, left: 2 },
  margin: { top: 8, right: 8, bottom: 8, left: 8 },
};

let pickQueue: unknown[] = [];

function renderPanel(): void {
  render(
    <ToastProvider>
      <InspectorRulerPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  pickQueue = [elemA, elemB];
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/pick') {
      return Promise.resolve({ ok: true, value: pickQueue.shift() ?? elemA });
    }
    if (type === 'inspection/collect') {
      return Promise.resolve({ ok: true, value: { inspectorId: 'ruler', data: boxModel } });
    }
    if (type === 'inspection/highlight') {
      return Promise.resolve({ ok: true, value: { found: true } });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await rulerBinding.set(RULER_SETTINGS_DEFAULTS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InspectorRulerPanel', () => {
  it('renders the start action in the default (two elements) mode', async () => {
    renderPanel();
    await settle();
    expect(screen.getByRole('button', { name: t('ruler.start') })).toBeInTheDocument();
    expect(screen.queryByTestId('ruler-measurement')).not.toBeInTheDocument();
  });

  it('measures the gap after picking two elements', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('ruler.start') }));
    await waitFor(() => {
      expect(screen.getByTestId('ruler-selector-a')).toHaveTextContent('#a');
    });

    fireEvent.click(screen.getByRole('button', { name: t('ruler.pickB') }));
    await waitFor(() => {
      expect(screen.getByTestId('ruler-measurement')).toBeInTheDocument();
    });
    // Горизонтальное смещение = 50px (b.left 150 − a.right 100).
    expect(screen.getByTestId('ruler-measurement')).toHaveTextContent('50px');
    const picks = mockedSend.mock.calls.filter((c) => c[0] === 'inspection/pick');
    expect(picks).toHaveLength(2);
  });

  it('copies the measurement to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('ruler.start') }));
    await waitFor(() => expect(screen.getByTestId('ruler-selector-a')).toHaveTextContent('#a'));
    fireEvent.click(screen.getByRole('button', { name: t('ruler.pickB') }));
    await waitFor(() => expect(screen.getByTestId('ruler-measurement')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: t('ruler.copy') }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0]?.[0] as string).toContain('gap: x=50px');
  });

  it('renders the box model after picking an element in box mode', async () => {
    renderPanel();
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: t('ruler.seg.box') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('ruler.pickElement') })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: t('ruler.pickElement') }));
    await waitFor(() => expect(screen.getByTestId('ruler-boxmodel')).toBeInTheDocument());

    expect(mockedSend).toHaveBeenCalledWith('inspection/collect', {
      tabId: 1,
      inspectorId: 'ruler',
    });
    const padding = screen.getByTestId('boxmodel-padding');
    expect(padding).toHaveTextContent('5px');
    expect(padding).toHaveTextContent('10px');
  });

  it('recomputes the box model after hierarchy navigation', async () => {
    const nodeDesc = (selector: string, depth: number) => ({
      tagName: 'div',
      id: null,
      classNames: [],
      selector,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      childElementCount: 1,
      siblingIndex: 0,
      siblingCount: 1,
      depth,
    });
    const leafState = {
      node: nodeDesc('div#leaf', 2),
      path: [nodeDesc('html', 0), nodeDesc('div#leaf', 2)],
      canAscend: true,
      canDescend: false,
    };
    const parentState = { ...leafState, node: nodeDesc('div#wrap', 1), canDescend: true };
    const parentBox = { ...boxModel, padding: { top: 99, right: 1, bottom: 1, left: 1 } };
    let collectCalls = 0;

    mockedSend.mockImplementation((type: string) => {
      if (type === 'inspection/pick') {
        return Promise.resolve({ ok: true, value: { ...leafState.node, navigation: leafState } });
      }
      if (type === 'inspection/navigate') {
        return Promise.resolve({ ok: true, value: parentState });
      }
      if (type === 'inspection/collect') {
        collectCalls += 1;
        return Promise.resolve({
          ok: true,
          value: { inspectorId: 'ruler', data: collectCalls === 1 ? boxModel : parentBox },
        });
      }
      return Promise.resolve({ ok: true, value: { ok: true } });
    });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: t('ruler.seg.box') }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('ruler.pickElement') })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: t('ruler.pickElement') }));
    await waitFor(() => expect(screen.getByTestId('hierarchy-nav')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('hierarchy-parent'));
    await waitFor(() => {
      expect(screen.getByTestId('boxmodel-padding')).toHaveTextContent('99px');
    });
    expect(mockedSend).toHaveBeenCalledWith('inspection/navigate', {
      tabId: 1,
      step: 'parent',
      depth: undefined,
    });
  });

  it('surfaces a cancellation notice when the picker returns null', async () => {
    mockedSend.mockImplementation((type: string) => {
      if (type === 'inspection/pick') return Promise.resolve({ ok: true, value: null });
      return Promise.resolve({ ok: true, value: { ok: true } });
    });

    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('ruler.start') }));
    await waitFor(() => {
      expect(screen.getByTestId('ruler-error')).toHaveTextContent(t('ruler.error.cancelled'));
    });
  });
});
