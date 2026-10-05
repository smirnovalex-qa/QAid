/**
 * Тест панели computed-профиля (TASK-054): после выбора рисуются сгруппированные
 * секции «свойство: значение», свотч у цветов, строка контраста с меткой WCAG,
 * фильтр сужает список, копирование пишет в буфер; шаг навигации пересчитывает
 * профиль (авто-`collect` хука на новом якоре).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';
import type { ElementProps } from '@/shared/inspection/props/types';

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return { ...actual, tabs: { ...actual.tabs, queryActive: () => Promise.resolve(1) } };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return { ...actual, createPermissionBroker: () => ({ ensure: () => Promise.resolve(true) }) };
});

const { copyMock } = vi.hoisted(() => ({ copyMock: vi.fn(() => Promise.resolve(true)) }));
vi.mock('@/ui/clipboard', () => ({ copyText: copyMock }));

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

const descriptor = {
  tagName: 'button',
  id: 'go',
  classNames: ['primary'],
  selector: 'button#go.primary',
  rect: { x: 0, y: 0, width: 0, height: 0 },
  childElementCount: 0,
  siblingIndex: 0,
  siblingCount: 1,
  depth: 3,
};
const navState = { node: descriptor, path: [descriptor], canAscend: true, canDescend: false };

function propsFor(selector: string, extraGroupValue: string): ElementProps {
  return {
    identity: { tagName: 'button', id: 'go', classNames: ['primary'], selector },
    attributes: { type: 'submit', 'data-testid': 'go' },
    geometry: { x: 10, y: 20, width: 120, height: 40 },
    contrast: {
      foreground: 'rgba(0, 0, 0, 1)',
      background: 'rgba(255, 255, 255, 1)',
      ratio: 21,
      large: false,
      approximate: false,
    },
    groups: [
      {
        id: 'color',
        entries: [{ property: 'color', value: extraGroupValue, kind: 'color' }],
      },
      {
        id: 'typography',
        entries: [{ property: 'font-size', value: '16px', kind: 'length' }],
      },
    ],
    rules: null,
  };
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  mockedSend.mockReset();
  copyMock.mockClear();
  let liveCalls = 0;
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/pick') {
      return Promise.resolve({ ok: true, value: { ...descriptor, navigation: navState } });
    }
    if (type === 'inspection/pickLive') {
      // Живой режим: первый клик проваливается в узел, следующий резолв — null (выход из
      // loop с сохранением узла), чтобы pick-loop не крутился в тесте.
      liveCalls += 1;
      return Promise.resolve(
        liveCalls === 1
          ? { ok: true, value: { ...descriptor, navigation: navState } }
          : { ok: true, value: null },
      );
    }
    if (type === 'inspection/navigate') {
      return Promise.resolve({ ok: true, value: navState });
    }
    if (type === 'inspection/collect') {
      // Первый вызов (после pick) — rgb(0,0,0); после навигации — rgb(255,0,0).
      const call = mockedSend.mock.calls.filter((c) => c[0] === 'inspection/collect').length;
      const value = call <= 1 ? 'rgb(0, 0, 0)' : 'rgb(255, 0, 0)';
      return Promise.resolve({
        ok: true,
        value: { inspectorId: 'probe', data: propsFor('button#go.primary', value) },
      });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
});

describe('InspectorProbePanel (computed-профиль)', () => {
  it('после выбора рисует группы, контраст с меткой WCAG и атрибуты', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: t('inspection.probe.pick') }));

    await waitFor(() => {
      expect(screen.getByTestId('hierarchy-identity')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('inspector-probe-group')).toHaveLength(2);
    expect(screen.getByTestId('inspector-probe-attributes')).toBeInTheDocument();
    // Контраст: число и метки WCAG (высокий контраст → pass).
    const contrast = screen.getByTestId('inspector-probe-contrast');
    expect(contrast).toHaveTextContent('21.00');
    expect(contrast).toHaveTextContent(t('inspection.probe.wcag.pass'));
  });

  it('фильтр сужает список свойств', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: t('inspection.probe.pick') }));
    await waitFor(() => {
      expect(screen.getAllByTestId('inspector-probe-group')).toHaveLength(2);
    });

    fireEvent.input(screen.getByPlaceholderText(t('inspection.probe.filter.placeholder')), {
      target: { value: 'font-size' },
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('inspector-probe-group')).toHaveLength(1);
    });
    // Атрибуты скрыты, пока активен фильтр.
    expect(screen.queryByTestId('inspector-probe-attributes')).not.toBeInTheDocument();
  });

  it('копирование секции пишет в буфер', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: t('inspection.probe.pick') }));
    await waitFor(() => {
      expect(screen.getAllByTestId('inspector-probe-group')).toHaveLength(2);
    });

    const copyButtons = screen.getAllByRole('button', { name: t('inspection.probe.copyGroup') });
    fireEvent.click(copyButtons[0]!);
    await settle();
    expect(copyMock).toHaveBeenCalled();
  });

  it('шаг навигации пересчитывает профиль на новом якоре', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: t('inspection.probe.pick') }));
    await waitFor(() => expect(screen.getByTestId('hierarchy-identity')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('hierarchy-parent'));
    // После шага хук снова зовёт inspection/collect → значение цвета обновилось.
    await waitFor(() => {
      expect(screen.getByText('rgb(255, 0, 0)')).toBeInTheDocument();
    });
  });
});
