import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import { ToastProvider } from '@/ui/components';
import ru from '../i18n/ru';
import { SettingsSyncView } from '../ui';
import { settingsSyncBinding } from '../settings';
import { createSettingsSync } from '../engine';
import { syncKey } from '../logic';
import type { SyncableNamespace } from '../ports';
import { createMemoryStore, createMemorySync } from './helpers';

mergeCatalog('ru', ru);

const NS: SyncableNamespace[] = [{ id: 'app', label: 'ss.ns.app', sensitive: true }];

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function availableEngine(): ReturnType<typeof createSettingsSync> & {
  sync: ReturnType<typeof createMemorySync>;
} {
  const store = createMemoryStore(NS, { app: { theme: 'dark' } });
  const sync = createMemorySync();
  const engine = createSettingsSync({ store, sync, now: () => 1000 });
  return Object.assign(engine, { sync });
}

function renderView(engine: ReturnType<typeof createSettingsSync>): void {
  render(
    <ToastProvider>
      <SettingsSyncView engine={engine} />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await settingsSyncBinding.reset();
});

afterEach(async () => {
  await settingsSyncBinding.reset();
});

describe('SettingsSyncView', () => {
  it('shows the privacy warning and starts with sync disabled', async () => {
    renderView(availableEngine());
    await settle();
    expect(screen.getByText(t('ss.privacyWarning'))).toBeInTheDocument();
    expect(screen.getByTestId('ss-status')).toHaveTextContent(t('ss.disabledStatus'));
    // Список пространств скрыт, пока синк выключен.
    expect(screen.queryByTestId('ss-namespaces')).not.toBeInTheDocument();
  });

  it('requires acknowledgement before enabling, then reveals the checklist', async () => {
    renderView(availableEngine());
    await settle();

    const enable = screen.getByRole('button', { name: t('ss.enable') });
    expect(enable).toBeDisabled();

    fireEvent.click(screen.getByTestId('ss-ack'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('ss.enable') })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: t('ss.enable') }));
    await waitFor(() => {
      expect(screen.getByTestId('ss-namespaces')).toBeInTheDocument();
    });
  });

  it('selecting a namespace pushes it to sync', async () => {
    const engine = availableEngine();
    renderView(engine);
    await settle();

    fireEvent.click(screen.getByTestId('ss-ack'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('ss.enable') })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: t('ss.enable') }));
    await waitFor(() => {
      expect(screen.getByTestId('ss-ns-app')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('ss-ns-app'));
    await waitFor(() => {
      expect(engine.sync.store.has(syncKey('app'))).toBe(true);
    });
    expect(screen.getByTestId('ss-status-app')).toHaveTextContent(t('ss.status.pushed'));
    await settle(); // дать фоновым записям меты осесть до сброса хранилища
  });

  it('degrades gracefully when the sync seam is unavailable', async () => {
    const store = createMemoryStore(NS, { app: { theme: 'dark' } });
    const engine = createSettingsSync({ store }); // без sync
    renderView(engine);
    await settle();

    // Нотис недоступности и блокировка контролов — производные от prop движка
    // (не от персистентного состояния), поэтому устойчивы к порядку тестов.
    expect(screen.getByTestId('ss-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('ss-ack')).toBeDisabled();
  });
});
