/**
 * Юнит-тесты менеджера инъекции и форвардинга инспекционного RPC (TASK-013).
 * Платформенная инъекция и транспорт в вкладку инъектируются через `InspectionDeps`
 * — Chrome не нужен. Импорт `messages` регистрирует контракты в реестре.
 */
import { describe, expect, it, vi } from 'vitest';
import { ensureContentScript, forwardToContent } from '@/background/inspection';
import type { InspectionDeps } from '@/background/inspection';
import { makeEnvelope, errorEnvelope } from '@/shared/messaging/envelope';
import { AppErrorException } from '@/shared/errors';
import { appError } from '@/shared/errors';
import { InspectionPing } from '@/shared/inspection/messages';

/** Успешный ответ вкладки на ping. */
function pingReply(): unknown {
  return makeEnvelope(InspectionPing.type, { ready: true }, 'cid');
}

describe('ensureContentScript', () => {
  it('живой хост (ping отвечает) — инъекции нет', async () => {
    const executeScript = vi.fn(() => Promise.resolve([]));
    const sendToTab = vi.fn(() => Promise.resolve(pingReply()));
    const deps: InspectionDeps = { scripting: { executeScript }, sendToTab };

    const res = await ensureContentScript(7, deps);

    expect(res.ok).toBe(true);
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendToTab).toHaveBeenCalledTimes(1);
  });

  it('мёртвая вкладка (ping отклоняется) — инъектирует бандл в целевую вкладку', async () => {
    const executeScript = vi.fn(() => Promise.resolve([]));
    const sendToTab = vi.fn(() => Promise.reject(new Error('no receiving end')));
    const deps: InspectionDeps = { scripting: { executeScript }, sendToTab };

    const res = await ensureContentScript(42, deps);

    expect(res.ok).toBe(true);
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 42 } }));
  });

  it('привилегированная страница → PRIVILEGED_PAGE + messageKey', async () => {
    const executeScript = vi.fn(() => Promise.reject(new Error('Cannot access a chrome:// URL')));
    const sendToTab = vi.fn(() => Promise.reject(new Error('dead')));
    const res = await ensureContentScript(1, { scripting: { executeScript }, sendToTab });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PRIVILEGED_PAGE');
      expect(res.error.messageKey).toBe('inspection.error.privilegedPage');
    }
  });

  it('нет права → PERMISSION_DENIED + messageKey', async () => {
    const executeScript = vi.fn(() =>
      Promise.reject(new Error('Missing host permission for the tab')),
    );
    const sendToTab = vi.fn(() => Promise.reject(new Error('dead')));
    const res = await ensureContentScript(1, { scripting: { executeScript }, sendToTab });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PERMISSION_DENIED');
      expect(res.error.messageKey).toBe('inspection.error.permission');
    }
  });

  // Регресс на баг переключения вкладок (ADR-0022): при смене вкладки без host-доступа
  // Chrome бросает именно это сообщение. Оно НЕ должно классифицироваться как
  // «служебная страница» (в нём есть подстрока «cannot access») — это нехватка прав,
  // чинимая грантом host, а не тупик.
  it('«must request permission to access the respective host» → PERMISSION_DENIED (не PRIVILEGED_PAGE)', async () => {
    const executeScript = vi.fn(() =>
      Promise.reject(
        new Error(
          'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
        ),
      ),
    );
    const sendToTab = vi.fn(() => Promise.reject(new Error('dead')));
    const res = await ensureContentScript(1, { scripting: { executeScript }, sendToTab });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('PERMISSION_DENIED');
      expect(res.error.messageKey).toBe('inspection.error.permission');
    }
  });

  it('прочая ошибка инъекции → INJECTION_FAILED', async () => {
    const executeScript = vi.fn(() => Promise.reject(new Error('unexpected')));
    const sendToTab = vi.fn(() => Promise.reject(new Error('dead')));
    const res = await ensureContentScript(1, { scripting: { executeScript }, sendToTab });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INJECTION_FAILED');
  });
});

describe('forwardToContent', () => {
  it('гарантирует инъекцию и возвращает payload ответа вкладки', async () => {
    const response = { tagName: 'button', id: null, classNames: [], selector: 'button', rect: {} };
    const sendToTab = vi.fn((_tabId: number, raw: unknown) => {
      // Первый вызов — ping (ensureContentScript), второй — форвард запроса.
      const isPing =
        typeof raw === 'object' &&
        raw !== null &&
        (raw as { type?: string }).type === InspectionPing.type;
      return Promise.resolve(
        isPing ? pingReply() : makeEnvelope('inspection/pick', response, 'cid'),
      );
    });
    const deps: InspectionDeps = { scripting: { executeScript: vi.fn() }, sendToTab };

    const payload = await forwardToContent('inspection/pick', { tabId: 3 }, deps);

    expect(payload).toEqual(response);
  });

  it('ошибка инъекции пробрасывается как AppErrorException', async () => {
    const executeScript = vi.fn(() => Promise.reject(new Error('Cannot access chrome://')));
    const sendToTab = vi.fn(() => Promise.reject(new Error('dead')));

    await expect(
      forwardToContent(
        'inspection/pick',
        { tabId: 1 },
        { scripting: { executeScript }, sendToTab },
      ),
    ).rejects.toBeInstanceOf(AppErrorException);
  });

  it('error-конверт из вкладки пробрасывается как AppErrorException', async () => {
    const sendToTab = vi.fn((_tabId: number, raw: unknown) => {
      const isPing =
        typeof raw === 'object' &&
        raw !== null &&
        (raw as { type?: string }).type === InspectionPing.type;
      return Promise.resolve(
        isPing ? pingReply() : errorEnvelope(appError('INTERNAL', 'content boom'), 'cid'),
      );
    });
    const deps: InspectionDeps = {
      scripting: { executeScript: vi.fn() },
      sendToTab,
      forwardTimeoutMs: 1000,
    };

    await expect(forwardToContent('inspection/pick', { tabId: 2 }, deps)).rejects.toBeInstanceOf(
      AppErrorException,
    );
  });
});
