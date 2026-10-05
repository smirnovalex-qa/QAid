/**
 * Юнит-тесты фонового инъектора плавающей панели (TASK-062). Платформенная инъекция
 * подменяется через `InjectDeps.scripting` — Chrome не нужен. У обёртки нет ping'а
 * (идемпотентность — guard-флаг бандла), поэтому `open` всегда вызывает `executeScript`.
 */
import { describe, expect, it, vi } from 'vitest';
import '@/shared/panel/messages';
import { openFloatingPanel } from '@/background/panel';
import { AppErrorException } from '@/shared/errors';

describe('openFloatingPanel', () => {
  it('инъектирует обёртку в целевую вкладку и возвращает { ok: true }', async () => {
    const executeScript = vi.fn(() => Promise.resolve([]));
    const res = await openFloatingPanel({ tabId: 11 }, { scripting: { executeScript } });

    expect(res).toEqual({ ok: true });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 11 }, files: ['content-panel.js'] }),
    );
  });

  it('не делает ping-пробу (всегда инъектирует — идемпотентность по guard бандла)', async () => {
    const executeScript = vi.fn(() => Promise.resolve([]));
    const sendToTab = vi.fn(() => Promise.resolve(undefined));
    await openFloatingPanel({ tabId: 1 }, { scripting: { executeScript }, sendToTab });

    expect(sendToTab).not.toHaveBeenCalled();
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it('привилегированная страница → AppErrorException(PRIVILEGED_PAGE) + messageKey', async () => {
    const executeScript = vi.fn(() => Promise.reject(new Error('Cannot access a chrome:// URL')));
    await expect(
      openFloatingPanel({ tabId: 1 }, { scripting: { executeScript } }),
    ).rejects.toMatchObject({
      appError: { code: 'PRIVILEGED_PAGE', messageKey: 'inspection.error.privilegedPage' },
    });
  });

  it('нет host-доступа → AppErrorException(PERMISSION_DENIED)', async () => {
    const executeScript = vi.fn(() =>
      Promise.reject(
        new Error(
          'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
        ),
      ),
    );
    const rejected = openFloatingPanel({ tabId: 1 }, { scripting: { executeScript } });
    await expect(rejected).rejects.toBeInstanceOf(AppErrorException);
    await expect(rejected).rejects.toMatchObject({ appError: { code: 'PERMISSION_DENIED' } });
  });
});
