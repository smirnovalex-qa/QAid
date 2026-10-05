/**
 * Тесты UI «Экспорта состояния бага» (TASK-025), редизайн: фазовый поток
 * idle → armed → captured. Проверяем приватность (storage выключен + предупреждение),
 * вооружение живых каналов, сбор снимка (RPC + фаза captured) и скачивание артефакта
 * за явным подтверждением. Транспорт/платформа/права — замоканы.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { mergeCatalog, t } from '@/i18n';
import type * as PlatformModule from '@/platform';
import type * as PermissionsModule from '@/shared/permissions';

let ensureResult = true;

vi.mock('@/shared/messaging/bus', () => ({ sendMessage: vi.fn() }));
vi.mock('@/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof PlatformModule>();
  return {
    ...actual,
    tabs: { ...actual.tabs, queryActive: () => Promise.resolve(1) },
    capture: { visibleTab: () => Promise.resolve('data:image/png;base64,AAAA') },
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
import ru from '../i18n/ru';
import { ToastProvider } from '@/ui/components';
import { BugReportPanel } from '../ui';
import { bugReportBinding } from '../settings';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <BugReportPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

/** Кликает по переключателю/кнопке, найденному по тексту подписи. */
function clickText(text: string): void {
  fireEvent.click(screen.getByText(text));
}

beforeEach(async () => {
  ensureResult = true;
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    switch (type) {
      case 'bugReport/collectEnv':
        return Promise.resolve({
          ok: true,
          value: {
            meta: { url: 'https://x.test/checkout', title: 'X' },
            environment: {
              userAgent: 'UA',
              language: 'en',
              languages: ['en'],
              platform: 'test',
              viewport: { width: 1, height: 2 },
              screen: { width: 3, height: 4 },
              devicePixelRatio: 1,
              locale: 'en',
              timeZone: 'UTC',
              isoTime: '2026-09-20T00:00:00.000Z',
              online: true,
              cookieEnabled: true,
            },
          },
        });
      case 'bugReport/consoleRead':
        return Promise.resolve({ ok: true, value: { entries: [] } });
      case 'bugReport/actionsRead':
        return Promise.resolve({
          ok: true,
          value: { events: [], anchor: { perfNow: 0, wall: 0 } },
        });
      case 'mock/poll':
        return Promise.resolve({ ok: true, value: { entries: [] } });
      case 'storage/list':
        return Promise.resolve({ ok: true, value: { items: [], origin: 'https://x.test' } });
      case 'cookies/list':
        return Promise.resolve({ ok: true, value: { cookies: [], domain: 'x.test' } });
      default:
        return Promise.resolve({ ok: true, value: { ok: true } });
    }
  });
  await bugReportBinding.reset();
});

describe('BugReportPanel', () => {
  it('idle: интро и кнопка старта; каналы скрыты до «Изменить»', async () => {
    renderPanel();
    await settle();
    expect(screen.getByText(t('bugReport.intro'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('bugReport.arm') })).toBeInTheDocument();
    // Список каналов свёрнут — подписи ещё нет.
    expect(screen.queryByText(t('bugReport.channel.steps'))).not.toBeInTheDocument();
    // Раскрываем «Изменить» → появляются каналы.
    clickText(t('bugReport.change'));
    await settle();
    expect(screen.getByText(t('bugReport.channel.steps'))).toBeInTheDocument();
    expect(screen.queryByText(t('bugReport.secretWarn'))).not.toBeInTheDocument();
  });

  it('включение cookies персистит выбор секции storage', async () => {
    renderPanel();
    await settle();
    clickText(t('bugReport.change'));
    await settle();
    clickText(t('bugReport.section.storage'));
    await settle();
    await waitFor(() => {
      expect(bugReportBinding.value.value.sections.storage).toBe(true);
    });
  });

  it('arm: вооружает живые каналы (actions/console/observe) и открывает сессию', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('bugReport.arm') }));
    await settle();
    await waitFor(() => {
      expect(screen.getByTestId('bug-report-session')).toBeInTheDocument();
    });
    expect(mockedSend).toHaveBeenCalledWith('mock/observe', { tabId: 1 });
    expect(mockedSend).toHaveBeenCalledWith(
      'bugReport/actionsInstall',
      expect.objectContaining({ tabId: 1 }),
    );
    expect(mockedSend).toHaveBeenCalledWith(
      'bugReport/consoleInstall',
      expect.objectContaining({ tabId: 1 }),
    );
  });

  it('capture: собирает снимок (collectEnv) и переходит в фазу captured', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('bugReport.arm') }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('bugReport.capture') }));
    await settle();
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('bugReport/collectEnv', { tabId: 1 });
    });
    // Фаза captured: редактируемый заголовок и бейдж «отчёт готов».
    expect(screen.getByText(new RegExp(t('bugReport.ready')))).toBeInTheDocument();
    expect(screen.getByLabelText(t('bugReport.note.title.label'))).toBeInTheDocument();
  });

  it('скачивание артефакта — только после явного подтверждения (можно отменить)', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('bugReport.arm') }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: t('bugReport.capture') }));
    await settle();
    clickText(t('bugReport.downloadFile'));
    await settle();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    clickText(t('bugReport.download.cancel'));
    await settle();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
