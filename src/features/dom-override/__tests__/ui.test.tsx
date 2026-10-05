import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

// Платформенные швы мокаем ДО импорта UI (vi.mock поднимается в начало модуля).
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
import ru from '@/features/dom-override/i18n/ru';
import { DomOverridePanel } from '@/features/dom-override/ui';
import { domOverrideBinding } from '@/features/dom-override/settings';
import { DOM_OVERRIDE_SETTINGS_DEFAULTS } from '@/shared/inspection/dom-override/types';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

const picked = {
  tagName: 'p',
  id: 'a',
  classNames: ['lead'],
  selector: '#a',
  rect: { x: 0, y: 0, width: 10, height: 10 },
};

const settle = (): Promise<void> =>
  act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });

beforeEach(() => {
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'inspection/pick') return Promise.resolve({ ok: true, value: picked });
    if (type === 'domOverride/apply') return Promise.resolve({ ok: true, value: { applied: 1 } });
    if (type === 'domOverride/clear') return Promise.resolve({ ok: true, value: { ok: true } });
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  // Биндинг настроек — синглтон-signal на модуль: сбрасываем к дефолтам ПРЯМЫМ
  // присваиванием (синхронно, без отложенного персиста), чтобы выбор в одном тесте не
  // протекал в сидирование следующего и не оставлял отложенной очереди ре-рендеров.
  domOverrideBinding.value.value = DOM_OVERRIDE_SETTINGS_DEFAULTS;
});

describe('DomOverridePanel', () => {
  it('рендерит интро, кнопку выбора и пустой список изменений', async () => {
    render(<DomOverridePanel />);
    await settle();
    expect(screen.getByText(t('feature.domOverride.intro'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('domOverride.pickCta') })).toBeInTheDocument();
    expect(screen.getByText(t('domOverride.changes.empty'))).toBeInTheDocument();
  });

  it('выбор элемента и применение изменения шлёт domOverride/apply и показывает запись', async () => {
    render(<DomOverridePanel />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: t('domOverride.pickCta') }));
    await waitFor(() => {
      expect(screen.getByTestId('dom-override-selector')).toHaveTextContent('#a');
    });

    fireEvent.click(screen.getByRole('button', { name: t('domOverride.applyCta') }));
    await waitFor(() => {
      expect(screen.getByTestId('dom-override-list')).toHaveTextContent('#a');
    });

    const applyCalls = mockedSend.mock.calls.filter((c) => c[0] === 'domOverride/apply');
    expect(applyCalls).toHaveLength(1);
    const payload = applyCalls[0]?.[1] as { entries: { selector: string; op: { kind: string } }[] };
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]?.selector).toBe('#a');
    expect(payload.entries[0]?.op.kind).toBe('replace-text');
    await waitFor(() => {
      expect(screen.getByTestId('dom-override-status')).toHaveTextContent(
        t('domOverride.status.applied', { count: 1 }),
      );
    });
    // Дожидаемся, пока асинхронный персист настроек завершится ПОКА компонент
    // смонтирован — иначе `void binding.update` разрешится после размонтирования.
    await waitFor(() => {
      expect(domOverrideBinding.value.value.overrides.length).toBe(1);
    });
    await settle();
  });

  it('отмена выбора (пикер вернул null) показывает уведомление', async () => {
    mockedSend.mockImplementation((type: string) => {
      if (type === 'inspection/pick') return Promise.resolve({ ok: true, value: null });
      return Promise.resolve({ ok: true, value: { ok: true } });
    });
    render(<DomOverridePanel />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('domOverride.pickCta') }));
    await waitFor(() => {
      expect(screen.getByTestId('dom-override-error')).toHaveTextContent(
        t('domOverride.error.cancelled'),
      );
    });
    await settle();
  });
});
