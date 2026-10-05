import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

// Управляемый результат брокера прав (меняется между тестами; замыкание читает вживую).
let ensureResult = true;

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return {
    ...actual,
    tabs: {
      ...actual.tabs,
      queryActive: () => Promise.resolve(1),
      getUrl: () => Promise.resolve('https://x.test/app'),
    },
  };
});
vi.mock('@/shared/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof PermissionsModule>();
  return {
    ...actual,
    createPermissionBroker: () => ({
      ensure: () => Promise.resolve(ensureResult),
      has: () => Promise.resolve(ensureResult),
    }),
  };
});

import { sendMessage } from '@/shared/messaging/bus';
import ru from '@/features/storage-editor/i18n/ru';
import { ToastProvider } from '@/ui/components';
import { StorageEditorPanel } from '@/features/storage-editor/ui';
import { storageEditorBinding } from '@/features/storage-editor/settings';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <StorageEditorPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  ensureResult = true;
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'storage/list') {
      return Promise.resolve({
        ok: true,
        value: { items: [{ key: 'theme', value: 'dark' }], origin: 'https://x.test' },
      });
    }
    if (type === 'cookies/list') {
      return Promise.resolve({ ok: true, value: { cookies: [], domain: 'x.test' } });
    }
    if (type === 'storage/clear' || type === 'cookies/clear') {
      return Promise.resolve({ ok: true, value: { removed: 3 } });
    }
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await storageEditorBinding.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StorageEditorPanel', () => {
  it('renders the area tabs (cookies/local/session + idb/cache)', async () => {
    renderPanel();
    await settle();
    expect(screen.getByTestId('storage-editor')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t('storage.tab.cookies') })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t('storage.tab.local') })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t('storage.tab.session') })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t('storage.tab.indexeddb') })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t('storage.tab.cache') })).toBeInTheDocument();
  });

  it('switches tab, loads web storage and applies an inline edit via storage/set', async () => {
    renderPanel();
    await settle();

    // Переключаемся на Local (клик-жест) → загрузка storage/list.
    fireEvent.click(screen.getByRole('tab', { name: t('storage.tab.local') }));
    // Ждём саму загруженную строку «theme».
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /theme/ })).toBeInTheDocument();
    });

    // Строки свёрнуты — раскрываем запись «theme», затем правим значение.
    fireEvent.click(screen.getByRole('button', { name: /theme/ }));
    const textarea = screen.getByLabelText('theme');
    fireEvent.input(textarea, { target: { value: 'light' } });
    fireEvent.click(screen.getByRole('button', { name: t('storage.save') }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('storage/set', {
        tabId: 1,
        area: 'local',
        key: 'theme',
        value: 'light',
      });
    });
  });

  it('degrades gracefully when the cookies permission is declined', async () => {
    ensureResult = false;
    renderPanel();
    await settle();

    // Клик по вкладке Cookies селектит её и запускает загрузку → отказ в праве.
    fireEvent.click(screen.getByRole('tab', { name: t('storage.tab.cookies') }));
    await waitFor(() => {
      expect(screen.getByTestId('storage-cookies-denied')).toBeInTheDocument();
    });
    // Фича не упала: объяснение отказа + кнопка «Выдать доступ».
    expect(screen.getByText(t('storage.cookiesDenied'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('storage.grantCookies') })).toBeInTheDocument();
  });

  it('adds a new entry via the + Add form (storage/set)', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: t('storage.tab.local') }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /theme/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ ' + t('storage.add') }));
    fireEvent.input(screen.getByLabelText(t('storage.newKey')), { target: { value: 'flag' } });
    fireEvent.input(screen.getByLabelText(t('storage.value')), { target: { value: 'on' } });
    fireEvent.click(screen.getByRole('button', { name: t('storage.add') }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('storage/set', {
        tabId: 1,
        area: 'local',
        key: 'flag',
        value: 'on',
      });
    });
  });

  it('removes an entry via the expanded row (storage/remove)', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: t('storage.tab.local') }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /theme/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /theme/ }));
    fireEvent.click(screen.getByRole('button', { name: t('storage.remove') }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('storage/remove', {
        tabId: 1,
        area: 'local',
        key: 'theme',
      });
    });
  });

  it('clears all site data via a two-step confirm (storage/clear)', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: t('storage.tab.local') }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /theme/ })).toBeInTheDocument();
    });

    // Шаг 1: вооружаем — кнопка меняет подпись и появляется предупреждение.
    fireEvent.click(screen.getByRole('button', { name: t('storage.clearAll') }));
    expect(screen.getByRole('button', { name: t('storage.clearAllConfirm') })).toBeInTheDocument();
    expect(screen.getByText(t('storage.clearWarn'))).toBeInTheDocument();

    // Шаг 2: подтверждаем — выполняется очистка.
    fireEvent.click(screen.getByRole('button', { name: t('storage.clearAllConfirm') }));
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('storage/clear', { tabId: 1, area: 'local' });
    });
  });

  it('shows an import diff preview before applying a snapshot', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: t('storage.tab.local') }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /theme/ })).toBeInTheDocument();
    });

    // «Load snapshot» раскрывает поле импорта.
    fireEvent.click(screen.getByRole('button', { name: t('storage.snapshotLoad') }));
    const area = screen.getByTestId('storage-import-text');
    fireEvent.input(area, {
      target: { value: '{"cookies":[],"local":[{"key":"a","value":"b"}],"session":[]}' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('storage.importPreview') }));

    await waitFor(() => {
      expect(screen.getByTestId('storage-import-diff')).toBeInTheDocument();
    });
  });
});
