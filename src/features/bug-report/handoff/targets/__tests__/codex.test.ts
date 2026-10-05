/**
 * Тесты адаптера адресата «Codex» (TASK-045). Покрываем чистые помощники
 * (`buildCodexDeepLink`, `codexCommand`), все ветки `deliver()` на фейковых транспортах
 * (без DOM/`chrome.*`) и факт регистрации в реестре (order 4). Стиль fake-ctx зеркалит
 * `../../__tests__/targets.test.ts`.
 *
 * Про ветку `deepLinkFailed`: `buildCodexDeepLink` использует ФИКСИРОВАННУЮ валидную схему
 * `codex` и не передаёт `target`, поэтому `buildDeepLink` для Codex никогда не отдаёт `err`
 * (длинный промпт усекается, а не отвергается). Ветка `!built.ok` в `deliver` — оборонительная
 * и недостижима при текущем фиксированном формате; поэтому тщательно покрываем ok-путь.
 */
import { describe, expect, it, vi } from 'vitest';
// Импорт модуля выполняет саморегистрацию адресата в реестре.
import { buildCodexDeepLink, codexCommand } from '../codex';
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

/** Фейковый пакет для агента с переопределяемым компактным промптом. */
function makePackage(compactPrompt = 'compact prompt → see file'): AgentHandoffPackage {
  return {
    packageVersion: 1,
    createdAt: '2026-09-19T12:00:00.000Z',
    slug: 'example-bug',
    fullMarkdown: '# full markdown',
    fullJson: '{"full":true}',
    compactPrompt,
    artifact,
  };
}

interface ContextOverrides {
  fsAccess: boolean;
  promptLimit?: number;
  compactPrompt?: string;
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
    pkg: makePackage(over.compactPrompt),
    project: {},
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

/** Достаёт значение промпт-параметра из URL и декодирует его. */
function decodeParam(url: string, param: string): string {
  const query = url.slice(url.indexOf('?') + 1);
  const pair = query.split('&').find((p) => p.startsWith(`${param}=`));
  return decodeURIComponent((pair ?? '').slice(param.length + 1));
}

describe('buildCodexDeepLink', () => {
  it('собирает codex://new?prompt=<encoded> с URL-энкодом в пределах лимита', () => {
    const r = buildCodexDeepLink({
      pkg: makePackage('fix\nthis bug'),
      promptLimit: 5000,
      filePointer: `${HANDOFF_DIR}/latest.md`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url.startsWith('codex://new?prompt=')).toBe(true);
    expect(r.value.url).toContain('%0A');
    expect(r.value.truncated).toBe(false);
    expect(decodeParam(r.value.url, 'prompt')).toBe('fix\nthis bug');
    // Ни repo, ни cwd в codex://new не участвуют.
    expect(r.value.url).not.toContain('repo=');
    expect(r.value.url).not.toContain('cwd=');
  });

  it('огромный компактный промпт усекается под малый лимит, указатель на файл сохранён', () => {
    const limit = 120;
    const filePointer = `${HANDOFF_DIR}/latest.md`;
    const r = buildCodexDeepLink({
      pkg: makePackage('Z'.repeat(5000)),
      promptLimit: limit,
      filePointer,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.promptLength).toBeLessThanOrEqual(limit);
    const decoded = decodeParam(r.value.url, 'prompt');
    expect(decoded).toContain(filePointer);
    expect(decoded).toContain('truncated');
  });
});

describe('codexCommand', () => {
  it('форматирует неинтерактивную команду из указателя на файл', () => {
    expect(codexCommand(`${HANDOFF_DIR}/latest.md`)).toBe(
      'codex "$(cat .qanvil/bug-reports/latest.md)"',
    );
  });
});

describe('адресат codex — deliver', () => {
  it('с FSA: пишет файл, открывает codex://new, сообщает codex.opened', async () => {
    const latestPath = `${HANDOFF_DIR}/latest.md`;
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: true,
        written: [`${HANDOFF_DIR}/example-bug.md`, latestPath],
        latestPath,
      }),
    );
    const open = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({ fsAccess: true, writeProjectFiles: write, openDeepLink: open });
    const result = await byId('codex').deliver(ctx);

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.usedTransport).toBe('deep-link');
    expect(result.filePath).toBe(latestPath);
    expect(result.message).toBe('bugReport.handoff.codex.opened');
    expect(open).toHaveBeenCalledTimes(1);
    const openedUrl = open.mock.calls[0]?.[0] ?? '';
    expect(openedUrl.startsWith('codex://new?prompt=')).toBe(true);
  });

  it('без FSA: файл не записать → fsUnavailable, НЕ открывает (агент 404-ил бы latest.md)', async () => {
    const write = vi.fn<HandoffTransports['writeProjectFiles']>();
    const open = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({ fsAccess: false, writeProjectFiles: write, openDeepLink: open });
    const result = await byId('codex').deliver(ctx);

    expect(write).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.usedTransport).toBe('none');
    expect(result.filePath).toBeUndefined();
    expect(result.message).toBe('bugReport.handoff.msg.fsUnavailable');
    expect(open).not.toHaveBeenCalled();
    expect(result.fallbacks).toHaveLength(3);
  });

  it('при неудачной записи FSA → показывает причину, НЕ открывает', async () => {
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: false,
        written: [],
        latestPath: `${HANDOFF_DIR}/latest.md`,
        error: 'bugReport.handoff.fs.denied',
      }),
    );
    const open = vi.fn<HandoffTransports['openDeepLink']>();
    const ctx = makeContext({ fsAccess: true, writeProjectFiles: write, openDeepLink: open });
    const result = await byId('codex').deliver(ctx);

    expect(result.ok).toBe(false);
    expect(result.usedTransport).toBe('none');
    expect(result.message).toBe('bugReport.handoff.fs.denied');
    expect(result.filePath).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });

  it('фолбэки предлагаются всегда: команда → промпт → полный отчёт', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const latestPath = `${HANDOFF_DIR}/latest.md`;
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({ ok: true, written: [latestPath], latestPath }),
    );
    const ctx = makeContext({ fsAccess: true, copyToClipboard: copy, writeProjectFiles: write });
    const result = await byId('codex').deliver(ctx);

    expect(result.fallbacks).toHaveLength(3);
    expect(result.fallbacks[0]?.label).toBe('bugReport.handoff.fallback.copyCommand');
    expect(result.fallbacks[1]?.label).toBe('bugReport.handoff.fallback.copyPrompt');
    expect(result.fallbacks[2]?.label).toBe('bugReport.handoff.fallback.copyFull');

    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenLastCalledWith(`codex "$(cat ${latestPath})"`);
    await result.fallbacks[1]?.run();
    expect(copy).toHaveBeenLastCalledWith('compact prompt → see file');
    await result.fallbacks[2]?.run();
    expect(copy).toHaveBeenLastCalledWith('# full markdown');
  });

  it('без FSA фолбэк-команда ссылается на указатель по умолчанию', async () => {
    const copy = vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true));
    const ctx = makeContext({ fsAccess: false, copyToClipboard: copy });
    const result = await byId('codex').deliver(ctx);
    await result.fallbacks[0]?.run();
    expect(copy).toHaveBeenLastCalledWith('codex "$(cat .qanvil/bug-reports/latest.md)"');
  });
});

describe('регистрация адресата codex', () => {
  it('присутствует в реестре с order 4 и правильными полями', () => {
    const codex = byId('codex');
    expect(codex.preferredTransport).toBe('deep-link');
    expect(codex.order).toBe(4);
    expect(codex.titleKey).toBe('bugReport.handoff.target.codex');
  });
});
