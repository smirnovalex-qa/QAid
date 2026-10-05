/**
 * Юнит-тесты чистой логики «Экспорта состояния бага» (TASK-025): композиция секций
 * по выбору, маскирование чувствительных полей, рендер Markdown/JSON, zod-схема.
 * Цель — ~100% покрытие `logic.ts` (канон «core ~100%»).
 */
import { describe, expect, it } from 'vitest';
import {
  BugArtifactSchema,
  MASK,
  buildTimeline,
  composeArtifact,
  describeTimelineEvent,
  hasAllSections,
  looksSecretKey,
  looksTokenValue,
  maskArtifact,
  redactUrl,
  relativeTimecode,
  renderJson,
  renderMarkdown,
  renderTimeline,
} from '../logic';
import { DEFAULT_SECTIONS } from '../types';
import type { ArtifactParts, ComposeOptions, SectionSelection, TimelineEvent } from '../types';
import {
  consoleEntries,
  environment,
  fullParts,
  meta,
  network,
  note,
  storage,
} from './fixtures/snapshot';
import * as tl from './fixtures/timeline';

const allOn: SectionSelection = {
  environment: true,
  storage: true,
  console: true,
  network: true,
  timeline: true,
  note: true,
};

const opts = (over: Partial<ComposeOptions> = {}): ComposeOptions => ({
  sections: allOn,
  mask: false,
  capturedAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

describe('composeArtifact', () => {
  it('включает все выбранные секции и всегда — мету', () => {
    const a = composeArtifact(fullParts, opts());
    expect(a.version).toBe(1);
    expect(a.meta).toEqual(meta);
    expect(a.environment).toEqual(environment);
    expect(a.storage).toEqual(storage);
    expect(a.console).toEqual(consoleEntries);
    expect(a.network).toEqual(network);
    expect(a.note).toEqual(note);
  });

  it('невыбранные секции → null (честная маркировка отсутствия)', () => {
    const a = composeArtifact(fullParts, opts({ sections: DEFAULT_SECTIONS }));
    // storage выключен в дефолте (приватность).
    expect(a.storage).toBeNull();
    expect(a.environment).toEqual(environment);
    expect(a.console).toEqual(consoleEntries);
  });

  it('выбранная секция без собранной части → null', () => {
    const bare: ArtifactParts = { meta };
    const a = composeArtifact(bare, opts());
    expect(a.environment).toBeNull();
    expect(a.storage).toBeNull();
    expect(a.console).toBeNull();
    expect(a.network).toBeNull();
    expect(a.note).toBeNull();
  });

  it('mask:true маскирует прямо при композиции', () => {
    const a = composeArtifact(fullParts, opts({ mask: true }));
    expect(a.storage?.cookies[0]?.value).toBe(MASK);
  });
});

describe('looksSecretKey / looksTokenValue', () => {
  it('распознаёт секретные ключи', () => {
    for (const k of ['authToken', 'API_KEY', 'sessionId', 'refresh', 'password', 'bearer']) {
      expect(looksSecretKey(k)).toBe(true);
    }
    expect(looksSecretKey('theme')).toBe(false);
    expect(looksSecretKey('page')).toBe(false);
  });

  it('распознаёт токеноподобные значения', () => {
    expect(looksTokenValue('eyJhbGciOi.eyJzdWIiOiJ.abcdefghij')).toBe(true); // JWT-триплет
    expect(looksTokenValue('abcdef0123456789abcdef0123')).toBe(true); // длинная непрозрачная
    expect(looksTokenValue('dark')).toBe(false);
    expect(looksTokenValue('hello world here')).toBe(false); // есть пробелы
  });
});

describe('redactUrl', () => {
  it('маскирует значения секретных query-параметров', () => {
    expect(redactUrl('https://x.test/a?token=abc&page=2')).toBe(
      `https://x.test/a?token=${MASK}&page=2`,
    );
  });
  it('URL без query возвращается как есть', () => {
    expect(redactUrl('https://x.test/a')).toBe('https://x.test/a');
  });
  it('параметр без "=" не ломает разбор', () => {
    expect(redactUrl('https://x.test/a?flag&token=z')).toBe(`https://x.test/a?flag&token=${MASK}`);
  });
});

describe('maskArtifact', () => {
  it('маскирует куки, секретные значения storage и токены в URL сети', () => {
    const base = composeArtifact(fullParts, opts());
    const masked = maskArtifact(base);
    // Куки — значение целиком.
    expect(masked.storage?.cookies[0]?.value).toBe(MASK);
    // local: authToken (секретный ключ) и JWT-значение маскируются, theme — нет.
    const local = masked.storage?.local ?? [];
    expect(local.find((e) => e.key === 'theme')?.value).toBe('dark');
    expect(local.find((e) => e.key === 'authToken')?.value).toBe(MASK);
    expect(local.find((e) => e.key === 'plain')?.value).toBe(MASK);
    // network: секретный query-параметр в URL.
    expect(masked.network?.entries[0]?.url).toContain(`apikey=${MASK}`);
  });

  it('null-секции остаются null', () => {
    const a = composeArtifact({ meta }, opts({ sections: allOn }));
    const masked = maskArtifact(a);
    expect(masked.storage).toBeNull();
    expect(masked.network).toBeNull();
  });
});

describe('renderMarkdown / renderJson', () => {
  it('рендерит все секции полного артефакта', () => {
    const a = composeArtifact(fullParts, opts());
    const md = renderMarkdown(a);
    expect(md).toContain('# Bug report: Save button crashes');
    expect(md).toContain('## Environment');
    expect(md).toContain('## Storage & cookies');
    expect(md).toContain('## Console (3)');
    expect(md).toContain('## Network');
    expect(md).toContain('Total: 2 · failed: 1 · mocked: 1');
    expect(md).toContain('## Reproduction');
    expect(md).toContain('## Machine-readable');
    expect(md).toContain('```json');
    // Многострочный текст консоли сплющивается в одну строку.
    expect(md).toContain('Uncaught boom at line 1');
  });

  it('опускает null-секции и честно помечает недоступную сеть', () => {
    const a = composeArtifact(
      { meta, network: { available: false, total: 0, failed: 0, mocked: 0, entries: [] } },
      opts({ sections: { ...allOn, environment: false } }),
    );
    const md = renderMarkdown(a);
    expect(md).not.toContain('## Environment');
    expect(md).not.toContain('## Storage');
    expect(md).toContain('_unavailable');
  });

  it('пустые списки и заголовок без title', () => {
    const a = composeArtifact(
      {
        meta,
        storage: { cookies: [], local: [], session: [] },
        console: [],
        note: { title: '', steps: '' },
      },
      opts({ sections: allOn }),
    );
    const md = renderMarkdown(a);
    expect(md.startsWith('# Bug report\n')).toBe(true);
    expect(md).toContain('_none_');
    expect(md).toContain('_no errors or warnings captured_');
    expect(md).toContain('_(untitled)_');
    expect(md).toContain('_(no steps provided)_');
  });

  it('экранирует "|" в ячейках таблиц', () => {
    const a = composeArtifact(
      {
        meta,
        network: {
          available: true,
          total: 1,
          failed: 1,
          mocked: 0,
          entries: [
            {
              method: 'GET',
              url: 'https://x.test/a|b',
              status: 0,
              mocked: false,
              source: 'fetch',
              durationMs: 5,
              error: 'net|fail',
            },
          ],
        },
      },
      opts({ sections: allOn }),
    );
    const md = renderMarkdown(a);
    expect(md).toContain('https://x.test/a\\|b');
    expect(md).toContain('ERR (net\\|fail)');
  });

  it('renderJson соответствует zod-схеме артефакта', () => {
    const a = composeArtifact(fullParts, opts());
    const parsed = BugArtifactSchema.safeParse(JSON.parse(renderJson(a)));
    expect(parsed.success).toBe(true);
  });
});

describe('hasAllSections', () => {
  it('true, когда все опциональные секции присутствуют', () => {
    expect(hasAllSections(allOn)).toBe(true);
    expect(hasAllSections({ environment: true })).toBe(false);
  });
});

describe('buildTimeline (слияние потоков)', () => {
  it('сливает действия/консоль/сеть на единой wall-clock оси и стабильно сортирует', () => {
    const events = buildTimeline({
      actions: tl.actions,
      console: tl.consoleEntries,
      network: tl.network,
      anchor: tl.anchor,
    });
    // 7 действий + 1 консоль + 1 сеть.
    expect(events).toHaveLength(9);
    // Сеть переведена через якорь: 1_800_000_010_000 + (8000 − 10000) = 1_800_000_008_000.
    const net = events.find((e) => e.kind === 'network');
    expect(net?.at).toBe(1_800_000_008_000);
    // Отсортировано по возрастанию at.
    for (let i = 1; i < events.length; i++) {
      expect((events[i]?.at ?? 0) >= (events[i - 1]?.at ?? 0)).toBe(true);
    }
    // Консоль (at=2_500) попадает между change(2_000) и submit(3_000).
    const kinds = events.map((e) => e.kind);
    const consoleIdx = kinds.indexOf('console');
    expect(events[consoleIdx - 1]?.kind).toBe('action');
  });

  it('без якоря сетевые события опускаются (нельзя разместить на оси)', () => {
    const events = buildTimeline({ actions: tl.actions, network: tl.network });
    expect(events.some((e) => e.kind === 'network')).toBe(false);
    expect(events).toHaveLength(tl.actions.length);
  });

  it('стабильна для равных таймстемпов: порядок вставки действия→консоль сохраняется', () => {
    const events = buildTimeline({
      actions: [{ kind: 'click', at: 100, target: 'a' }],
      console: [{ level: 'error', source: 'console', text: 'x', at: 100 }],
    });
    expect(events[0]?.kind).toBe('action');
    expect(events[1]?.kind).toBe('console');
  });

  it('пустой вход → пустой таймлайн', () => {
    expect(buildTimeline({})).toEqual([]);
  });
});

describe('relativeTimecode', () => {
  it('форматирует относительные таймкоды', () => {
    expect(relativeTimecode(1000, 1000)).toBe('+0.0s');
    expect(relativeTimecode(2200, 1000)).toBe('+1.2s');
  });
  it('отрицательная дельта клампится к нулю', () => {
    expect(relativeTimecode(500, 1000)).toBe('+0.0s');
  });
});

describe('describeTimelineEvent', () => {
  it('описывает каждый тип действия/консоль/сеть', () => {
    const evs = buildTimeline({
      actions: tl.actions,
      console: tl.consoleEntries,
      network: tl.network,
      anchor: tl.anchor,
    });
    const rendered = evs.map(describeTimelineEvent);
    expect(rendered).toContain('Click on `[data-testid=open]`');
    expect(rendered.some((r) => r.startsWith('Input into email'))).toBe(true);
    expect(rendered.some((r) => r.includes('value hidden'))).toBe(true);
    expect(rendered.some((r) => r.startsWith('Submit form'))).toBe(true);
    expect(rendered.some((r) => r === 'Key Enter')).toBe(true);
    expect(rendered.some((r) => r.startsWith('Navigation → https://x.test/next'))).toBe(true);
    expect(rendered.some((r) => r.startsWith('Resize → 800×600'))).toBe(true);
    expect(rendered.some((r) => r.startsWith('Console `[error]`'))).toBe(true);
    expect(rendered.some((r) => r.startsWith('Network GET'))).toBe(true);
  });

  it('сетевая ошибка отражается как ERR', () => {
    const ev: TimelineEvent = {
      kind: 'network',
      at: 1,
      method: 'POST',
      url: 'https://x.test/s',
      status: 0,
      mocked: false,
      durationMs: 5,
      error: 'net down',
    };
    expect(describeTimelineEvent(ev)).toBe('Network POST https://x.test/s → ERR (net down)');
  });

  it('действие без target/detail рендерится без пустых обёрток', () => {
    expect(describeTimelineEvent({ kind: 'action', at: 1, action: 'click' })).toBe('Click on');
    expect(describeTimelineEvent({ kind: 'action', at: 1, action: 'key' })).toBe('Key (gesture)');
    expect(describeTimelineEvent({ kind: 'action', at: 1, action: 'resize' })).toBe('Resize');
    expect(describeTimelineEvent({ kind: 'action', at: 1, action: 'navigation' })).toBe(
      'Navigation',
    );
    expect(describeTimelineEvent({ kind: 'action', at: 1, action: 'input' })).toBe(
      'Input into field',
    );
  });
});

describe('renderTimeline', () => {
  it('нумерованный список с таймкодами + замечание об охвате', () => {
    const evs = buildTimeline({
      actions: tl.actions,
      console: tl.consoleEntries,
      anchor: tl.anchor,
    });
    const lines = renderTimeline(evs);
    expect(lines[0]).toBe('## Steps to reproduce (auto)');
    expect(lines.some((l) => l.startsWith('1. `+0.0s`'))).toBe(true);
    expect(lines.some((l) => l.includes('iframes are not recorded'))).toBe(true);
  });

  it('пустой таймлайн → честный _none_', () => {
    const lines = renderTimeline([]);
    expect(lines).toContain('_no user actions captured_');
  });
});

describe('таймлайн в артефакте (composeArtifact / render / mask / schema)', () => {
  const timeline = buildTimeline({
    actions: tl.actions,
    console: tl.consoleEntries,
    network: tl.network,
    anchor: tl.anchor,
  });

  it('секция timeline включается только по выбору и рендерится в Markdown', () => {
    const on = composeArtifact({ meta, timeline }, opts({ sections: allOn }));
    expect(on.timeline).toHaveLength(9);
    const md = renderMarkdown(on);
    expect(md).toContain('## Steps to reproduce (auto)');

    const off = composeArtifact(
      { meta, timeline },
      opts({ sections: { ...allOn, timeline: false } }),
    );
    expect(off.timeline).toBeNull();
    expect(renderMarkdown(off)).not.toContain('## Steps to reproduce (auto)');
  });

  it('маскирование редактирует секретные query-параметры в сетевых событиях таймлайна', () => {
    const a = composeArtifact({ meta, timeline }, opts({ sections: allOn, mask: true }));
    const net = a.timeline?.find((e) => e.kind === 'network');
    expect(net?.kind === 'network' ? net.url : '').toContain(`token=${MASK}`);
  });

  it('обратная совместимость: снимок без ключа timeline валиден (→ null)', () => {
    const legacy = {
      version: 1,
      capturedAt: '2026-09-05T10:00:00.000Z',
      meta,
      environment: null,
      storage: null,
      console: null,
      network: null,
      note: null,
    };
    const parsed = BugArtifactSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.timeline).toBeNull();
  });

  it('renderJson с таймлайном соответствует zod-схеме', () => {
    const a = composeArtifact({ meta, timeline }, opts({ sections: allOn }));
    const reparsed = BugArtifactSchema.safeParse(JSON.parse(renderJson(a)));
    expect(reparsed.success).toBe(true);
  });
});
