/**
 * Тесты реестра адресатов Agent Handoff + двух базовых адресатов (TASK-040).
 *
 * Реестр модуль-глобален и самозаполняется при импорте — поэтому тестируем УЖЕ
 * зарегистрированную базу (не перерегистрируем её), а для проверки «дубликат id
 * бросает» заводим одноразовый throwaway-id. `deliver()` покрывается на фейковых
 * транспортах и `t:(k)=>k` — без буфера/DOM (канон: логика адресата чистая).
 */
import { describe, expect, it, vi } from 'vitest';
import { getHandoffTargets, registerHandoffTarget } from '../targets';
import type {
  AgentHandoffPackage,
  DeliveryContext,
  FsWriteResult,
  HandoffTarget,
  HandoffTransports,
} from '../types';
import type { BugArtifact } from '../../types';

/** Минимальный валидный артефакт (только обязательные секции). */
const artifact: BugArtifact = {
  version: 1,
  capturedAt: '2026-09-19T12:00:00.000Z',
  meta: { url: 'https://example.com', title: 'Example' },
  environment: null,
  storage: null,
  console: null,
  network: null,
  timeline: null,
  note: null,
};

/** Фейковый пакет для агента. */
function makePackage(): AgentHandoffPackage {
  return {
    packageVersion: 1,
    createdAt: '2026-09-19T12:00:00.000Z',
    slug: 'example-bug',
    fullMarkdown: '# full markdown',
    fullJson: '{"full":true}',
    compactPrompt: 'compact prompt',
    artifact,
  };
}

interface ContextOverrides {
  fsAccess: boolean;
  copyToClipboard?: HandoffTransports['copyToClipboard'];
  writeProjectFiles?: HandoffTransports['writeProjectFiles'];
}

/** Собирает контекст доставки с фейковыми транспортами и `t`-эхом. */
function makeContext(over: ContextOverrides): DeliveryContext {
  const transports: HandoffTransports = {
    copyToClipboard:
      over.copyToClipboard ??
      vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true)),
    writeProjectFiles:
      over.writeProjectFiles ??
      vi.fn<HandoffTransports['writeProjectFiles']>(() =>
        Promise.resolve({
          ok: true,
          written: [],
          latestPath: '.qaid/bug-reports/latest.md',
        }),
      ),
    openDeepLink: vi.fn(),
  };
  return {
    pkg: makePackage(),
    project: {},
    capabilities: { fsAccess: over.fsAccess, clipboard: true },
    transports,
    settings: { includeJson: false, promptLimit: 5000 },
    t: (key) => key,
  };
}

/** Достаёт зарегистрированный адресат по id (без non-null-ассертов). */
function byId(id: string): HandoffTarget {
  const found = getHandoffTargets().find((target) => target.id === id);
  if (found === undefined) throw new Error(`missing handoff target: ${id}`);
  return found;
}

describe('реестр адресатов', () => {
  it('регистрирует обе базы с ожидаемыми id/транспортом/порядком', () => {
    const clipboard = byId('clipboard');
    const projectFolder = byId('project-folder');
    expect(clipboard.preferredTransport).toBe('clipboard');
    expect(clipboard.order).toBe(10);
    expect(clipboard.titleKey).toBe('bugReport.handoff.target.clipboard');
    expect(projectFolder.preferredTransport).toBe('fs-access');
    expect(projectFolder.order).toBe(20);
    expect(projectFolder.titleKey).toBe('bugReport.handoff.target.projectFolder');
  });

  it('отдаёт детерминированный порядок (clipboard до project-folder)', () => {
    const ids = getHandoffTargets().map((target) => target.id);
    expect(ids.indexOf('clipboard')).toBeLessThan(ids.indexOf('project-folder'));
  });

  it('бросает на дубликат id', () => {
    const throwaway: HandoffTarget = {
      id: 'dup-test-target',
      titleKey: 'x',
      preferredTransport: 'clipboard',
      deliver: () =>
        Promise.resolve({ ok: true, usedTransport: 'clipboard', message: 'm', fallbacks: [] }),
    };
    registerHandoffTarget(throwaway);
    expect(() => {
      registerHandoffTarget(throwaway);
    }).toThrow('duplicate handoff target: dup-test-target');
  });
});

describe('адресат clipboard', () => {
  it('копирует полный markdown и сообщает об успехе', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const ctx = makeContext({ fsAccess: true, copyToClipboard: copy });
    const result = await byId('clipboard').deliver(ctx);
    expect(copy).toHaveBeenCalledWith('# full markdown');
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('clipboard');
    expect(result.message).toBe('bugReport.handoff.msg.copied');
    expect(result.fallbacks).toHaveLength(0);
  });

  it('на сбое копирования даёт copyFailed + фолбэк-повтор', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(false));
    const ctx = makeContext({ fsAccess: true, copyToClipboard: copy });
    const result = await byId('clipboard').deliver(ctx);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('bugReport.handoff.msg.copyFailed');
    expect(result.fallbacks).toHaveLength(1);
    expect(result.fallbacks[0]?.label).toBe('bugReport.handoff.fallback.copyFull');
    await result.fallbacks[0]?.run();
    // Первый вызов — в deliver, второй — из фолбэка.
    expect(copy).toHaveBeenCalledTimes(2);
    expect(copy).toHaveBeenLastCalledWith('# full markdown');
  });
});

describe('адресат project-folder', () => {
  it('без FSA сообщает недоступность и предлагает copyFull', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const write = vi.fn<HandoffTransports['writeProjectFiles']>();
    const ctx = makeContext({ fsAccess: false, copyToClipboard: copy, writeProjectFiles: write });
    const result = await byId('project-folder').deliver(ctx);
    expect(write).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('bugReport.handoff.msg.fsUnavailable');
    expect(result.fallbacks[0]?.label).toBe('bugReport.handoff.fallback.copyFull');
    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenCalledWith('# full markdown');
  });

  it('на успешной записи даёт путь, written-сообщение и copyPrompt-фолбэк', async () => {
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: true,
        written: [
          '.qaid/bug-reports/example-bug-20260919120000.md',
          '.qaid/bug-reports/example-bug-20260919120000.json',
          '.qaid/bug-reports/latest.md',
        ],
        latestPath: '.qaid/bug-reports/latest.md',
      }),
    );
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const ctx = makeContext({ fsAccess: true, copyToClipboard: copy, writeProjectFiles: write });
    const result = await byId('project-folder').deliver(ctx);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('fs-access');
    expect(result.filePath).toBe('.qaid/bug-reports/latest.md');
    expect(result.message).toBe('bugReport.handoff.msg.written');
    expect(result.fallbacks[0]?.label).toBe('bugReport.handoff.fallback.copyPrompt');
    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenCalledWith('compact prompt');
  });

  it('на сбое записи прокидывает вернувшийся ключ причины + copyFull', async () => {
    const failure: FsWriteResult = {
      ok: false,
      written: [],
      latestPath: '.qaid/bug-reports/latest.md',
      error: 'bugReport.handoff.fs.denied',
    };
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() => Promise.resolve(failure));
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const ctx = makeContext({ fsAccess: true, copyToClipboard: copy, writeProjectFiles: write });
    const result = await byId('project-folder').deliver(ctx);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('bugReport.handoff.fs.denied');
    expect(result.fallbacks[0]?.label).toBe('bugReport.handoff.fallback.copyFull');
    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenCalledWith('# full markdown');
  });
});
