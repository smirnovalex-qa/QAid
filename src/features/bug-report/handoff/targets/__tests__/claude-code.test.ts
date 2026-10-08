/**
 * Тесты адаптера адресата «Claude Code» (TASK-043). Покрывают чистый строитель
 * `buildClaudeDeepLink` (repo/cwd/оба/ничего, варианты VS Code и desktop `claude://code/new`
 * с `folder`, отказ по невалидному cwd, гарантия лимита), `claudeCommand`, `deliver` (FSA
 * есть/нет, деградация при невалидном НЕОБЯЗАТЕЛЬНОМ таргете — открываем без него, все три
 * варианта, содержимое фолбэков) и регистрацию трёх адресатов. Без DOM/chrome — фейковые
 * транспорты и `t:(k)=>k` (канон: логика адресата чистая).
 *
 * Импорт модуля адаптера самозаполняет реестр при загрузке (как фичи в `registry.ts`),
 * поэтому регистрацию проверяем на уже зарегистрированных адресатах.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildClaudeDeepLink, claudeCommand } from '../claude-code';
import { getHandoffTargets } from '../../targets';
import type {
  AgentHandoffPackage,
  DeliveryContext,
  HandoffTarget,
  HandoffTransports,
  ProjectTarget,
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

/** Фейковый пакет для агента (короткий компактный промпт). */
function makePackage(over: Partial<AgentHandoffPackage> = {}): AgentHandoffPackage {
  return {
    packageVersion: 1,
    createdAt: '2026-09-19T12:00:00.000Z',
    slug: 'example-bug',
    fullMarkdown: '# full markdown',
    fullJson: '{"full":true}',
    compactPrompt: 'compact prompt',
    artifact,
    ...over,
  };
}

const DEFAULT_LATEST = '.qaid/bug-reports/latest.md';

interface ContextOverrides {
  fsAccess: boolean;
  project?: ProjectTarget;
  promptLimit?: number;
  copyToClipboard?: HandoffTransports['copyToClipboard'];
  writeProjectFiles?: HandoffTransports['writeProjectFiles'];
  openDeepLink?: HandoffTransports['openDeepLink'];
  pkg?: AgentHandoffPackage;
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
        Promise.resolve({ ok: true, written: [], latestPath: DEFAULT_LATEST }),
      ),
    openDeepLink: over.openDeepLink ?? vi.fn<HandoffTransports['openDeepLink']>(),
  };
  return {
    pkg: over.pkg ?? makePackage(),
    project: over.project ?? {},
    capabilities: { fsAccess: over.fsAccess, clipboard: true },
    transports,
    settings: { includeJson: false, promptLimit: over.promptLimit ?? 5000 },
    t: (key) => key,
  };
}

/** Достаёт зарегистрированный адресат по id (без non-null-ассертов). */
function byId(id: string): HandoffTarget {
  const found = getHandoffTargets().find((target) => target.id === id);
  if (found === undefined) throw new Error(`missing handoff target: ${id}`);
  return found;
}

/** Декодирует значение параметра `q` из URL. */
const decodeQ = (url: string): string => {
  const q = url.slice(url.indexOf('?') + 1);
  const pair = q.split('&').find((p) => p.startsWith('q='));
  return decodeURIComponent((pair ?? '').slice(2));
};

describe('buildClaudeDeepLink (чистый)', () => {
  it('repo → claude-cli://open?repo=…&q=…', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { repo: 'owner/name' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('claude-cli://open?repo=owner%2Fname&q=compact%20prompt');
  });

  it('только cwd → параметр cwd, без repo', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { cwd: '/home/user/proj' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toContain('cwd=%2Fhome%2Fuser%2Fproj');
    expect(r.value.url).not.toContain('repo=');
  });

  it('repo и cwd вместе → repo предпочтён (cwd опущен)', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { repo: 'o/n', cwd: '/abs/path' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toContain('repo=o%2Fn');
    expect(r.value.url).not.toContain('cwd=');
  });

  it('пустые repo/cwd отбрасываются → без repo/cwd, промпт инлайн', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { repo: '   ', cwd: '' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('claude-cli://open?q=compact%20prompt');
  });

  it('ни repo, ни cwd → без repo/cwd', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: {},
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('claude-cli://open?q=compact%20prompt');
  });

  it('вариант VS Code → vscode://anthropic.claude-code/open', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { repo: 'o/n' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'vscode',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('vscode://anthropic.claude-code/open?repo=o%2Fn&q=compact%20prompt');
  });

  it('вариант desktop → claude://code/new, cwd идёт как folder (не cwd/repo)', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { cwd: 'C:\\Users\\me\\webapp' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'desktop',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe(
      'claude://code/new?folder=C%3A%5CUsers%5Cme%5Cwebapp&q=compact%20prompt',
    );
    expect(r.value.url).not.toContain('cwd=');
    expect(r.value.url).not.toContain('repo=');
  });

  it('вариант desktop без cwd → claude://code/new?q=… (без folder), repo игнорируется', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      // repo desktop-схемой не поддерживается — folder отсутствует, открываем дефолтную папку.
      project: { repo: 'owner/name' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'desktop',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('claude://code/new?q=compact%20prompt');
    expect(r.value.url).not.toContain('folder=');
  });

  it('вариант desktop с невалидным cwd → ошибка invalid-cwd (её ловит деградация)', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { cwd: 'relative/path' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'desktop',
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });

  it('невалидный cwd → ошибка проброшена данными', () => {
    const r = buildClaudeDeepLink({
      pkg: makePackage(),
      project: { cwd: 'relative/path' },
      promptLimit: 5000,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });

  it('гарантия лимита: длинный промпт усечён, q ≤ лимита, указатель сохранён', () => {
    const limit = 100;
    const r = buildClaudeDeepLink({
      pkg: makePackage({ compactPrompt: 'X'.repeat(5000) }),
      project: { repo: 'o/n' },
      promptLimit: limit,
      filePointer: DEFAULT_LATEST,
      variant: 'terminal',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.promptLength).toBeLessThanOrEqual(limit);
    expect(decodeQ(r.value.url)).toContain(DEFAULT_LATEST);
  });
});

describe('claudeCommand', () => {
  it('формирует портативную по шеллам команду с @-упоминанием файла', () => {
    expect(claudeCommand(DEFAULT_LATEST)).toBe('claude "@.qaid/bug-reports/latest.md"');
  });
});

describe('адресат claude-code — deliver', () => {
  it('FSA есть: пишет файл, открывает deep-link, filePath задан, message=opened', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: true,
        written: [DEFAULT_LATEST],
        latestPath: DEFAULT_LATEST,
      }),
    );
    const ctx = makeContext({
      fsAccess: true,
      project: { repo: 'owner/name' },
      writeProjectFiles: write,
      openDeepLink,
    });
    const result = await byId('claude-code').deliver(ctx);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.filePath).toBe(DEFAULT_LATEST);
    expect(result.message).toBe('bugReport.handoff.claudeCode.opened');
    expect(openDeepLink).toHaveBeenCalledTimes(1);
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toContain('claude-cli://open?repo=owner%2Fname&q=');
  });

  it('FSA нет: файл не записать → fsUnavailable, НЕ открывает, фолбэки на месте', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const write = vi.fn<HandoffTransports['writeProjectFiles']>();
    const ctx = makeContext({ fsAccess: false, writeProjectFiles: write, openDeepLink });
    const result = await byId('claude-code').deliver(ctx);
    // Файл — предпосылка deep-link: без FSA не открываем агента на несуществующий latest.md.
    expect(write).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.usedTransport).toBe('none');
    expect(result.filePath).toBeUndefined();
    expect(result.message).toBe('bugReport.handoff.msg.fsUnavailable');
    expect(openDeepLink).not.toHaveBeenCalled();
    expect(result.fallbacks).toHaveLength(4);
  });

  it('фолбэки: порядок и содержимое (copyToClipboard с правильным текстом)', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const ctx = makeContext({ fsAccess: false, copyToClipboard: copy });
    const result = await byId('claude-code').deliver(ctx);
    expect(result.fallbacks.map((f) => f.label)).toEqual([
      'bugReport.handoff.fallback.copyPrompt',
      'bugReport.handoff.fallback.copyFull',
      'bugReport.handoff.fallback.copyCommand',
      'bugReport.handoff.fallback.copyFilePath',
    ]);
    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenLastCalledWith('compact prompt');
    await result.fallbacks[1]?.run();
    expect(copy).toHaveBeenLastCalledWith('# full markdown');
    await result.fallbacks[2]?.run();
    expect(copy).toHaveBeenLastCalledWith('claude "@.qaid/bug-reports/latest.md"');
    await result.fallbacks[3]?.run();
    expect(copy).toHaveBeenLastCalledWith('@.qaid/bug-reports/latest.md');
  });

  it('фолбэк команды/пути использует записанный latestPath (FSA)', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const written = '.qaid/bug-reports/example-bug-20260919120000.md';
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({ ok: true, written: [written], latestPath: written }),
    );
    const ctx = makeContext({
      fsAccess: true,
      copyToClipboard: copy,
      writeProjectFiles: write,
    });
    const result = await byId('claude-code').deliver(ctx);
    await result.fallbacks[2]?.run();
    expect(copy).toHaveBeenLastCalledWith(`claude "@${written}"`);
    await result.fallbacks[3]?.run();
    expect(copy).toHaveBeenLastCalledWith(`@${written}`);
  });

  it('запись FSA не удалась (папка не выбрана) → причина, не открывает, usedTransport=none', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: false,
        written: [],
        latestPath: DEFAULT_LATEST,
        error: 'bugReport.handoff.fs.noDir',
      }),
    );
    const ctx = makeContext({
      fsAccess: true,
      project: { repo: 'owner/name' },
      writeProjectFiles: write,
      openDeepLink,
    });
    const result = await byId('claude-code').deliver(ctx);
    expect(result.ok).toBe(false);
    expect(result.usedTransport).toBe('none');
    expect(result.message).toBe('bugReport.handoff.fs.noDir');
    expect(result.filePath).toBeUndefined();
    expect(openDeepLink).not.toHaveBeenCalled();
    expect(result.fallbacks).toHaveLength(4);
  });

  it('невалидный cwd (необязательный) → таргет отброшен, агент ОТКРЫТ без cwd, предупреждение', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({
      fsAccess: true,
      project: { cwd: 'relative/path' },
      openDeepLink,
    });
    const result = await byId('claude-code').deliver(ctx);
    // Кривое значение в НЕОБЯЗАТЕЛЬНОМ поле не должно рушить отправку: открываем без таргета.
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.filePath).toBe(DEFAULT_LATEST);
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedNoTarget');
    expect(openDeepLink).toHaveBeenCalledTimes(1);
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toBe('claude-cli://open?q=compact%20prompt');
    expect(openedUrl).not.toContain('cwd=');
  });

  it('невалидный repo (необязательный) → таргет отброшен, агент ОТКРЫТ без repo, предупреждение', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({
      fsAccess: true,
      // Частый ввод: голое имя без слэша (или URL) — не форма owner/name.
      project: { repo: 'qa_extension' },
      openDeepLink,
    });
    const result = await byId('claude-code').deliver(ctx);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedNoTarget');
    expect(openDeepLink).toHaveBeenCalledTimes(1);
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toBe('claude-cli://open?q=compact%20prompt');
    expect(openedUrl).not.toContain('repo=');
  });

  it('VS-Code-вариант с невалидным таргетом → тоже открывается без таргета (openedNoTarget)', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({
      fsAccess: true,
      project: { cwd: 'relative/path' },
      openDeepLink,
    });
    const result = await byId('claude-code-vscode').deliver(ctx);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedNoTarget');
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toBe('vscode://anthropic.claude-code/open?q=compact%20prompt');
  });
});

describe('адресат claude-code-vscode — deliver', () => {
  it('открывает vscode:// ссылку и даёт openedVscode', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({
      fsAccess: true,
      project: { repo: 'o/n' },
      openDeepLink,
    });
    const result = await byId('claude-code-vscode').deliver(ctx);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedVscode');
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toContain('vscode://anthropic.claude-code/open');
  });
});

describe('адресат claude-code-desktop — deliver', () => {
  it('валидный cwd → открывает claude://code/new с folder, message=openedDesktop', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({
      fsAccess: true,
      project: { cwd: 'C:\\Users\\me\\webapp' },
      openDeepLink,
    });
    const result = await byId('claude-code-desktop').deliver(ctx);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.filePath).toBe(DEFAULT_LATEST);
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedDesktop');
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toContain('claude://code/new?folder=');
    expect(openedUrl).not.toContain('wt.exe');
  });

  it('без cwd → открывает claude://code/new?q=… (дефолтная папка), openedDesktop', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({ fsAccess: true, project: {}, openDeepLink });
    const result = await byId('claude-code-desktop').deliver(ctx);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedDesktop');
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toBe('claude://code/new?q=compact%20prompt');
  });

  it('невалидный cwd (необязательный) → folder отброшен, ОТКРЫТ без папки, openedNoTarget', async () => {
    const openDeepLink = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({
      fsAccess: true,
      project: { cwd: 'relative/path' },
      openDeepLink,
    });
    const result = await byId('claude-code-desktop').deliver(ctx);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.message).toBe('bugReport.handoff.claudeCode.openedNoTarget');
    const openedUrl = openDeepLink.mock.calls[0]?.[0] ?? '';
    expect(openedUrl).toBe('claude://code/new?q=compact%20prompt');
    expect(openedUrl).not.toContain('folder=');
  });
});

describe('регистрация адресатов', () => {
  it('три адресата зарегистрированы с ожидаемыми id/порядком/транспортом', () => {
    const terminal = byId('claude-code');
    const desktop = byId('claude-code-desktop');
    const vscode = byId('claude-code-vscode');
    expect(terminal.order).toBe(1);
    expect(terminal.preferredTransport).toBe('deep-link');
    expect(terminal.titleKey).toBe('bugReport.handoff.target.claudeCode');
    expect(desktop.order).toBe(2);
    expect(desktop.preferredTransport).toBe('deep-link');
    expect(desktop.titleKey).toBe('bugReport.handoff.target.claudeCodeDesktop');
    expect(vscode.order).toBe(3);
    expect(vscode.titleKey).toBe('bugReport.handoff.target.claudeCodeVscode');
  });

  it('порядок: claude-code → claude-code-desktop → claude-code-vscode', () => {
    const ids = getHandoffTargets().map((target) => target.id);
    expect(ids.indexOf('claude-code')).toBeLessThan(ids.indexOf('claude-code-desktop'));
    expect(ids.indexOf('claude-code-desktop')).toBeLessThan(ids.indexOf('claude-code-vscode'));
  });
});
