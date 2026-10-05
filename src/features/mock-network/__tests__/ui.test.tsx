import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  return {
    ...actual,
    createPermissionBroker: () => ({
      ensure: () => Promise.resolve(true),
      has: () => Promise.resolve(true),
    }),
  };
});

import { sendMessage } from '@/shared/messaging/bus';
import type { MockRule } from '../types';
import ru from '../i18n/ru';
import { ToastProvider } from '@/ui/components';
import { MockNetworkPanel } from '../ui';
import { mockNetworkBinding } from '../settings';

mergeCatalog('ru', ru);

const mockedSend = sendMessage as unknown as Mock;

function renderPanel(): void {
  render(
    <ToastProvider>
      <MockNetworkPanel />
    </ToastProvider>,
  );
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(async () => {
  mockedSend.mockReset();
  mockedSend.mockImplementation((type: string) => {
    if (type === 'mock/poll')
      return Promise.resolve({ ok: true, value: { entries: [], active: true } });
    if (type === 'mock/status')
      return Promise.resolve({ ok: true, value: { active: false, strategy: 'main' } });
    return Promise.resolve({ ok: true, value: { ok: true } });
  });
  await mockNetworkBinding.reset();
});

describe('MockNetworkPanel', () => {
  it('рендерит мастер-карточку в выключенном состоянии', async () => {
    renderPanel();
    await settle();
    expect(screen.getByText(t('feature.mock.intercept'))).toBeInTheDocument();
    expect(screen.getByText(t('feature.mock.master.off'))).toBeInTheDocument();
    expect(screen.getByText(t('feature.mock.req.empty.off'))).toBeInTheDocument();
  });

  it('включение перехвата по мастер-тумблеру шлёт mock/apply', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('switch'));
    await settle();
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith(
        'mock/apply',
        expect.objectContaining({ tabId: 1, strategy: 'main' }),
      );
    });
  });

  it('добавляет правило и персистит его', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(t('feature.mock.tab.rules')) }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('feature.mock.newRule')) }));
    await settle();
    fireEvent.input(screen.getByLabelText(t('feature.mock.urlPattern')), {
      target: { value: '*/api/x*' },
    });
    fireEvent.click(screen.getByText(t('feature.mock.saveRule')));
    await waitFor(() => {
      expect(mockNetworkBinding.value.value.rules.length).toBe(1);
    });
  });

  it('невалидный импорт показывает ошибку в предпросмотре', async () => {
    renderPanel();
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(t('feature.mock.tab.rules')) }));
    await settle();
    fireEvent.click(screen.getByText(t('feature.mock.importRules')));
    await settle();
    fireEvent.input(screen.getByLabelText(t('feature.mock.importRules')), {
      target: { value: '{not json' },
    });
    await settle();
    expect(screen.getByText(t('feature.mock.error.import'))).toBeInTheDocument();
  });

  it('переоткрытая панель: фон говорит «выключено» → панель выключена', async () => {
    const first = render(
      <ToastProvider>
        <MockNetworkPanel />
      </ToastProvider>,
    );
    await settle();
    fireEvent.click(screen.getByRole('switch'));
    await settle();
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('mock/apply', expect.objectContaining({ tabId: 1 }));
    });

    first.unmount();
    // Фон перехват не подтверждает (напр. он снят / перезапуск SW) → панель честно «выкл».
    render(
      <ToastProvider>
        <MockNetworkPanel />
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText(t('feature.mock.master.off'))).toBeInTheDocument();
  });

  it('переоткрытая панель сверяется с фоном: фон говорит «активно» → панель включена (регресс)', async () => {
    // Регресс репортнутого кейса: перехватчик живёт в странице и переживает закрытие
    // попапа; переоткрытая панель обязана это отразить, а не показывать «выключено».
    mockedSend.mockImplementation((type: string) => {
      if (type === 'mock/poll')
        return Promise.resolve({ ok: true, value: { entries: [], active: true } });
      if (type === 'mock/status')
        return Promise.resolve({ ok: true, value: { active: true, strategy: 'main' } });
      return Promise.resolve({ ok: true, value: { ok: true } });
    });

    renderPanel();
    await settle();
    // Мастер-тумблер (первый switch) поднимается ВКЛючённым — панель отразила живой
    // фоновый перехват, а не показала «выключено».
    await waitFor(() => {
      expect(screen.getAllByRole('switch')[0]).toBeChecked();
    });
    // И раз панель считает перехват активным — переключение гасит его через mock/clear.
    fireEvent.click(screen.getAllByRole('switch')[0]!);
    await settle();
    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith('mock/clear', expect.objectContaining({ tabId: 1 }));
    });
  });

  it('«Без сценария» гасит ранее выбранный готовый сценарий (регресс)', async () => {
    // Репорт: выбрал готовый сценарий (напр. «Ошибки сервера»), затем «Без сценария» —
    // сценарий продолжает исполняться. Причина: правило готового сценария кладётся в
    // `rules` включённым и скрыто из вкладки Rules, а «Без сценария» (activeId=null)
    // откатывается к «только включённые правила» → осиротевшее правило снова активно.
    renderPanel();
    await settle();
    // Включаем перехват.
    fireEvent.click(screen.getAllByRole('switch')[0]!);
    await settle();
    // Scenarios → «Ошибки сервера».
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(t('feature.mock.tab.scenarios')) }));
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('feature.mock.scen.err500')) }));
    await settle();
    // Сейчас мокинг активен — последний apply несёт правило-500.
    const appliesAfterScenario = mockedSend.mock.calls.filter((c) => c[0] === 'mock/apply');
    const lastWithScenario = appliesAfterScenario.at(-1)?.[1] as { rules: MockRule[] } | undefined;
    expect(lastWithScenario?.rules.some((r) => r.action.status === 500)).toBe(true);

    // Выключаем сценарий: «Без сценария».
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t('feature.mock.scen.none')) }));
    await settle();

    // Последний apply ПОСЛЕ «Без сценария» не должен мокать /api/* 500 — иначе сценарий
    // продолжает исполняться вопреки выбору пользователя.
    await waitFor(() => {
      const applies = mockedSend.mock.calls.filter((c) => c[0] === 'mock/apply');
      const last = applies.at(-1)?.[1] as { rules: MockRule[] } | undefined;
      expect(last?.rules.some((r) => r.action.status === 500)).toBe(false);
    });
  });

  it('переоткрытая панель восстанавливает строгий (CDP) режим из статуса фона', async () => {
    mockedSend.mockImplementation((type: string) => {
      if (type === 'mock/poll')
        return Promise.resolve({ ok: true, value: { entries: [], active: true } });
      if (type === 'mock/status')
        return Promise.resolve({ ok: true, value: { active: true, strategy: 'cdp' } });
      return Promise.resolve({ ok: true, value: { ok: true } });
    });

    renderPanel();
    await settle();
    await waitFor(() => {
      expect(screen.getAllByRole('switch')[0]).toBeChecked();
    });
    fireEvent.click(screen.getByRole('tab', { name: t('feature.mock.tab.scenarios') }));
    await settle();
    // Строгий режим (cdp) должен подняться включённым — его переключатель нажат.
    // (Имя-подстрока без парентез — они в метке сломали бы regex как группу.)
    const strict = screen.getByRole('switch', { name: /Строгий режим/ });
    expect(strict).toBeChecked();
  });
});
