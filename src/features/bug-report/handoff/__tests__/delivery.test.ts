/**
 * Тесты общего помощника доставки `writeArtifactForHandoff` (TASK-043/044/045): три
 * ветки классификации исхода записи — нет FSA, успех, неуспех (с ключом причины и с
 * дефолтным ключом). Без DOM/`chrome.*` — фейковые транспорты.
 */
import { describe, expect, it, vi } from 'vitest';
import { writeArtifactForHandoff } from '../delivery';
import { HANDOFF_DIR } from '../types';
import type { AgentHandoffPackage, DeliveryContext, HandoffTransports } from '../types';
import type { BugArtifact } from '../../types';

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

const pkg: AgentHandoffPackage = {
  packageVersion: 1,
  createdAt: '2026-09-19T12:00:00.000Z',
  slug: 'example',
  fullMarkdown: '# md',
  fullJson: '{}',
  compactPrompt: 'prompt',
  artifact,
};

const DEFAULT_LATEST = `${HANDOFF_DIR}/latest.md`;

function makeCtx(
  fsAccess: boolean,
  writeProjectFiles?: HandoffTransports['writeProjectFiles'],
): DeliveryContext {
  const transports: HandoffTransports = {
    copyToClipboard: vi.fn<HandoffTransports['copyToClipboard']>(() => Promise.resolve(true)),
    writeProjectFiles:
      writeProjectFiles ??
      vi.fn<HandoffTransports['writeProjectFiles']>(() =>
        Promise.resolve({ ok: true, written: [DEFAULT_LATEST], latestPath: DEFAULT_LATEST }),
      ),
    openDeepLink: vi.fn<HandoffTransports['openDeepLink']>(),
  };
  return {
    pkg,
    project: {},
    capabilities: { fsAccess, clipboard: true },
    transports,
    settings: { includeJson: false, promptLimit: 5000 },
    t: (key) => key,
  };
}

describe('writeArtifactForHandoff', () => {
  it('нет FSA в среде → reasonKey fsUnavailable, дефолтный указатель, запись не вызвана', async () => {
    const write = vi.fn<HandoffTransports['writeProjectFiles']>();
    const out = await writeArtifactForHandoff(makeCtx(false, write));
    expect(out.reasonKey).toBe('bugReport.handoff.msg.fsUnavailable');
    expect(out.filePath).toBeUndefined();
    expect(out.filePointer).toBe(DEFAULT_LATEST);
    expect(write).not.toHaveBeenCalled();
  });

  it('успешная запись → filePath/filePointer из результата, без reasonKey', async () => {
    const written = `${HANDOFF_DIR}/example-20260919120000.md`;
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({ ok: true, written: [written], latestPath: written }),
    );
    const out = await writeArtifactForHandoff(makeCtx(true, write));
    expect(out.reasonKey).toBeUndefined();
    expect(out.filePath).toBe(written);
    expect(out.filePointer).toBe(written);
  });

  it('неуспешная запись → reasonKey = ключ причины транспорта', async () => {
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({
        ok: false,
        written: [],
        latestPath: DEFAULT_LATEST,
        error: 'bugReport.handoff.fs.noDir',
      }),
    );
    const out = await writeArtifactForHandoff(makeCtx(true, write));
    expect(out.reasonKey).toBe('bugReport.handoff.fs.noDir');
    expect(out.filePath).toBeUndefined();
    expect(out.filePointer).toBe(DEFAULT_LATEST);
  });

  it('неуспех без ключа причины → дефолтный fs.failed', async () => {
    const write = vi.fn<HandoffTransports['writeProjectFiles']>(() =>
      Promise.resolve({ ok: false, written: [], latestPath: DEFAULT_LATEST }),
    );
    const out = await writeArtifactForHandoff(makeCtx(true, write));
    expect(out.reasonKey).toBe('bugReport.handoff.fs.failed');
  });
});
