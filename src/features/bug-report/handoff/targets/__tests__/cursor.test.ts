/**
 * Тесты адаптера адресата «Cursor» (TASK-044): чистый строитель `cursor://file`-линка
 * и `deliver()` на фейковых транспортах + `t:(k)=>k` — без DOM/`chrome.*` (канон: логика
 * адресата чистая). Импорт модуля саморегистрирует адресат `cursor` в общем реестре.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildCursorFileLink } from '../cursor';
import { getHandoffTargets } from '../../targets';
import { HANDOFF_DIR } from '../../types';
import type {
  AgentHandoffPackage,
  DeliveryContext,
  HandoffTarget,
  HandoffTransports,
} from '../../types';
import type { BugArtifact } from '../../../types';

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
  cwd?: string;
  copyToClipboard?: HandoffTransports['copyToClipboard'];
  writeProjectFiles?: HandoffTransports['writeProjectFiles'];
  openDeepLink?: HandoffTransports['openDeepLink'];
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
          latestPath: `${HANDOFF_DIR}/latest.md`,
        }),
      ),
    openDeepLink: over.openDeepLink ?? vi.fn(),
  };
  return {
    pkg: makePackage(),
    project: over.cwd !== undefined ? { cwd: over.cwd } : {},
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

describe('buildCursorFileLink', () => {
  it('POSIX cwd: склеивает абсолютный путь без двойного слэша и точным энкодом', () => {
    const result = buildCursorFileLink({
      cwd: '/home/me/app',
      relPath: '.qaid/bug-reports/latest.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('cursor://file/home/me/app/.qaid/bug-reports/latest.md');
    expect(result.value.url).not.toContain('//home');
  });

  it('POSIX cwd: не дублирует сепаратор при завершающем слэше в cwd', () => {
    const result = buildCursorFileLink({
      cwd: '/home/me/app/',
      relPath: '.qaid/bug-reports/latest.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('cursor://file/home/me/app/.qaid/bug-reports/latest.md');
  });

  it('Windows cwd: нормализует `\\`, добавляет ведущий слэш и сохраняет диск `C:`', () => {
    const result = buildCursorFileLink({
      cwd: 'C:\\Users\\me\\app',
      relPath: '.qaid/bug-reports/latest.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('cursor://file/C:/Users/me/app/.qaid/bug-reports/latest.md');
  });

  it('энкодит пробелы в пути, слэши оставляет читаемыми', () => {
    const result = buildCursorFileLink({
      cwd: '/home/me/my app',
      relPath: '.qaid/latest.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.url).toBe('cursor://file/home/me/my%20app/.qaid/latest.md');
  });

  it('пустой cwd → ошибка no-cwd', () => {
    const result = buildCursorFileLink({ cwd: '', relPath: '.qaid/latest.md' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('no-cwd');
  });

  it('cwd с `..` → ошибка invalid-cwd', () => {
    const result = buildCursorFileLink({
      cwd: '/home/me/../etc',
      relPath: '.qaid/latest.md',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-cwd');
  });

  it('UNC-путь → ошибка invalid-cwd', () => {
    const result = buildCursorFileLink({
      cwd: '\\\\server\\share\\app',
      relPath: '.qaid/latest.md',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-cwd');
  });
});

describe('адресат cursor — deliver', () => {
  it('fsAccess + cwd: пишет файл, открывает cursor://file и сообщает opened', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: true,
        written: [`${HANDOFF_DIR}/example-bug.md`, `${HANDOFF_DIR}/latest.md`],
        latestPath: `${HANDOFF_DIR}/latest.md`,
      }),
    );
    const ctx = makeContext({
      fsAccess: true,
      cwd: '/home/me/app',
      writeProjectFiles: write,
      openDeepLink,
    });
    const result = await byId('cursor').deliver(ctx);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.message).toBe('bugReport.handoff.cursor.opened');
    expect(result.filePath).toBe(`${HANDOFF_DIR}/latest.md`);
    expect(openDeepLink).toHaveBeenCalledTimes(1);
    expect(openDeepLink).toHaveBeenCalledWith(`cursor://file/home/me/app/${HANDOFF_DIR}/latest.md`);
  });

  it('fsAccess=false: открывать нечего (файл не записан) → fsUnavailable, НЕ открывает', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const write = vi.fn<HandoffTransports['writeProjectFiles']>();
    const ctx = makeContext({
      fsAccess: false,
      cwd: '/home/me/app',
      writeProjectFiles: write,
      openDeepLink,
    });
    const result = await byId('cursor').deliver(ctx);
    // Cursor открывает ФАЙЛ отчёта — без записанного файла открывать `cursor://file` некуда.
    expect(write).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.usedTransport).toBe('none');
    expect(result.message).toBe('bugReport.handoff.msg.fsUnavailable');
    expect(result.filePath).toBeUndefined();
    expect(openDeepLink).not.toHaveBeenCalled();
    expect(result.fallbacks).toHaveLength(3);
  });

  it('cwd пуст: не открывает линк, message needPath, filePath от записи', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({ fsAccess: true, openDeepLink });
    const result = await byId('cursor').deliver(ctx);
    expect(result.ok).toBe(false);
    expect(result.usedTransport).toBe('fs-access');
    expect(result.message).toBe('bugReport.handoff.cursor.needPath');
    expect(result.filePath).toBe(`${HANDOFF_DIR}/latest.md`);
    expect(openDeepLink).not.toHaveBeenCalled();
  });

  it('всегда даёт три фолбэка; copyFilePath копирует `@`+relPath, остальные — full/compact', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: true,
        written: [`${HANDOFF_DIR}/latest.md`],
        latestPath: `${HANDOFF_DIR}/latest.md`,
      }),
    );
    const ctx = makeContext({
      fsAccess: true,
      cwd: '/home/me/app',
      copyToClipboard: copy,
      writeProjectFiles: write,
    });
    const result = await byId('cursor').deliver(ctx);
    expect(result.fallbacks).toHaveLength(3);
    expect(result.fallbacks[0]?.label).toBe('bugReport.handoff.fallback.copyFull');
    expect(result.fallbacks[1]?.label).toBe('bugReport.handoff.fallback.copyFilePath');
    expect(result.fallbacks[2]?.label).toBe('bugReport.handoff.fallback.copyPrompt');

    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenLastCalledWith('# full markdown');
    await result.fallbacks[1]?.run();
    expect(copy).toHaveBeenLastCalledWith(`@${HANDOFF_DIR}/latest.md`);
    await result.fallbacks[2]?.run();
    expect(copy).toHaveBeenLastCalledWith('compact prompt');
  });
});

describe('регистрация адресата cursor', () => {
  it('импорт модуля добавляет `cursor` в реестр с порядком 3', () => {
    const cursor = byId('cursor');
    expect(cursor.preferredTransport).toBe('deep-link');
    expect(cursor.order).toBe(3);
    expect(cursor.titleKey).toBe('bugReport.handoff.target.cursor');
  });
});
