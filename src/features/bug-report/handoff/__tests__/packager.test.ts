/**
 * Юнит-тесты сборщика «пакета для агента» (TASK-040): детерминированная сборка,
 * генерация слага (все фолбэки + санитизация + лимит), гарантия лимита компактного
 * промпта (с усечением на «огромном» артефакте, переживающим указателем на файл),
 * поведение `includeJson`, выбор топ-сигнала консоли и zod-схема формы.
 * Цель — ~100% покрытие `packager.ts` (канон «core ~100%»).
 */
import { describe, expect, it } from 'vitest';
import {
  AgentHandoffPackageSchema,
  buildEssence,
  buildHandoffPackage,
  buildPromptForDeepLink,
  buildSlug,
  topConsoleSignal,
} from '../packager';
import type { PromptInput } from '../packager';
import { composeArtifact, renderJson, renderMarkdown } from '../../logic';
import { DEEP_LINK_PROMPT_LIMIT, HANDOFF_DIR } from '../types';
import type { PackageOptions } from '../types';
import type { BugArtifact, ConsoleEntry, MetaPart, NotePart, SectionSelection } from '../../types';
import { fullParts, meta } from '../../__tests__/fixtures/snapshot';

const CREATED_AT = '2026-09-05T10:00:00.000Z';
/** Ожидаемая временна́я компонента слага для `CREATED_AT`. */
const TIME = '20260905-100000';

const allOn: SectionSelection = {
  environment: true,
  storage: true,
  console: true,
  network: true,
  timeline: true,
  note: true,
};

/** Полный артефакт из фикстур (все секции). */
const full = composeArtifact(fullParts, {
  sections: allOn,
  mask: false,
  capturedAt: CREATED_AT,
});

/** Артефакт только с метой (все опциональные секции — `null`). */
const bare = composeArtifact({ meta }, { sections: allOn, mask: false, capturedAt: CREATED_AT });

const pkgOpts = (over: Partial<PackageOptions> = {}): PackageOptions => ({
  createdAt: CREATED_AT,
  ...over,
});

/** Минимальный артефакт с управляемыми мета/заметкой (для тестов слага/сути). */
const makeArtifact = (metaOver: Partial<MetaPart>, note: NotePart | null): BugArtifact => ({
  version: 1,
  capturedAt: CREATED_AT,
  meta: { url: 'https://example.test/app', title: 'Example App', ...metaOver },
  environment: null,
  storage: null,
  console: null,
  network: null,
  timeline: null,
  note,
});

describe('buildHandoffPackage', () => {
  it('детерминированно собирает пакет из полного артефакта', () => {
    const pkg = buildHandoffPackage(full, pkgOpts());
    expect(pkg.packageVersion).toBe(1);
    expect(pkg.createdAt).toBe(CREATED_AT);
    expect(pkg.slug).toBe(`save-button-crashes-${TIME}`);
    expect(pkg.fullMarkdown).toBe(renderMarkdown(full));
    expect(pkg.fullJson).toBe(renderJson(full));
    expect(pkg.artifact).toBe(full);
    expect(pkg.compactPrompt.length).toBeLessThanOrEqual(DEEP_LINK_PROMPT_LIMIT);
    expect(pkg.compactPrompt).toContain(`Full report: ${HANDOFF_DIR}/latest.md`);
  });

  it('собирается и для артефакта только с метой (нет опциональных секций)', () => {
    const pkg = buildHandoffPackage(bare, pkgOpts());
    expect(pkg.slug).toBe(`example-app-${TIME}`);
    expect(pkg.compactPrompt).not.toContain('Console:');
    expect(pkg.compactPrompt).not.toContain('Network:');
  });

  it('уважает includeJson, promptLimit и filePointer из опций', () => {
    const pointer = `${HANDOFF_DIR}/custom.md`;
    const pkg = buildHandoffPackage(full, pkgOpts({ includeJson: true, filePointer: pointer }));
    expect(pkg.compactPrompt).toContain('## Full JSON');
    expect(pkg.compactPrompt).toContain(`Full report: ${pointer}`);

    const limited = buildHandoffPackage(full, pkgOpts({ promptLimit: 200 }));
    expect(limited.compactPrompt.length).toBeLessThanOrEqual(200);
  });
});

describe('buildSlug', () => {
  it('строит из заголовка заметки + временно́й компоненты', () => {
    const a = makeArtifact({}, { title: 'Save button crashes', steps: '' });
    expect(buildSlug(a, CREATED_AT)).toBe(`save-button-crashes-${TIME}`);
  });

  it('фолбэк на заголовок страницы, когда заметки нет или её заголовок пуст', () => {
    expect(buildSlug(makeArtifact({ title: 'Example App' }, null), CREATED_AT)).toBe(
      `example-app-${TIME}`,
    );
    const emptyNote = makeArtifact({ title: 'Example App' }, { title: '   ', steps: '' });
    expect(buildSlug(emptyNote, CREATED_AT)).toBe(`example-app-${TIME}`);
  });

  it('фолбэк на хост URL, когда заголовков нет', () => {
    const a = makeArtifact({ title: '', url: 'https://sub.example.test/page' }, null);
    expect(buildSlug(a, CREATED_AT)).toBe(`sub-example-test-${TIME}`);
  });

  it('санитизирует спецсимволы/регистр и ограничивает длину (~60)', () => {
    const a = makeArtifact({ title: `Ошибка! ${'Very Long Title '.repeat(10)}` }, null);
    const slug = buildSlug(a, CREATED_AT);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('пустая суть → фолбэк bug-report; непарсибельный URL не бросает', () => {
    const a = makeArtifact({ title: '', url: 'not a url' }, null);
    expect(buildSlug(a, CREATED_AT)).toBe(`bug-report-${TIME}`);
  });

  it('невалидное время → слаг без временно́й компоненты', () => {
    const a = makeArtifact({}, { title: 'Save button crashes', steps: '' });
    expect(buildSlug(a, 'not-a-date')).toBe('save-button-crashes');
  });
});

describe('topConsoleSignal', () => {
  it('null/пустой массив → undefined', () => {
    expect(topConsoleSignal(null)).toBeUndefined();
    expect(topConsoleSignal([])).toBeUndefined();
  });

  it('предпочитает ошибку предупреждению и схлопывает переносы строк', () => {
    const entries: ConsoleEntry[] = [
      { level: 'warn', source: 'console', text: 'be careful', at: 1 },
      { level: 'error', source: 'console', text: 'boom\nat line 1', at: 2 },
    ];
    expect(topConsoleSignal(entries)).toBe('boom at line 1');
  });

  it('когда ошибок нет — берёт первое предупреждение', () => {
    const entries: ConsoleEntry[] = [
      { level: 'warn', source: 'console', text: 'deprecated', at: 1 },
    ];
    expect(topConsoleSignal(entries)).toBe('deprecated');
  });
});

describe('buildEssence', () => {
  it('полный артефакт: заголовок, URL, топ-сигнал и счётчики секций', () => {
    const lines = buildEssence(full);
    expect(lines).toContain('Title: Save button crashes');
    expect(lines).toContain(`URL: ${meta.url}`);
    expect(lines).toContain('Top signal: TypeError: x is undefined');
    expect(lines).toContain('Console: 2 error(s), 1 warning(s)');
    expect(lines).toContain('Network: 2 total, 1 failed');
  });

  it('без секций консоли/сети: только заголовок/URL, заголовок → (untitled)', () => {
    const a = makeArtifact({ title: '' }, null);
    const lines = buildEssence(a);
    expect(lines).toContain('Title: (untitled)');
    expect(lines.some((l) => l.startsWith('Top signal:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Console:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Network:'))).toBe(false);
  });
});

describe('buildPromptForDeepLink', () => {
  const baseInput = (over: Partial<PromptInput> = {}): PromptInput => ({
    artifact: full,
    filePointer: `${HANDOFF_DIR}/latest.md`,
    includeJson: false,
    fullJson: renderJson(full),
    ...over,
  });

  it('содержит преамбулу, указатель, заголовок и URL; ≤ лимита', () => {
    const prompt = buildPromptForDeepLink(baseInput());
    expect(prompt.length).toBeLessThanOrEqual(DEEP_LINK_PROMPT_LIMIT);
    expect(prompt).toContain('AI coding agent');
    expect(prompt).toContain(`Full report: ${HANDOFF_DIR}/latest.md`);
    expect(prompt).toContain('Title: Save button crashes');
    expect(prompt).toContain(`URL: ${meta.url}`);
    expect(prompt).not.toContain('## Full JSON');
  });

  it('includeJson=true добавляет JSON, когда он помещается', () => {
    const prompt = buildPromptForDeepLink(baseInput({ includeJson: true }));
    expect(prompt).toContain('## Full JSON');
    expect(prompt).toContain(renderJson(full));
  });

  it('includeJson=true, но JSON не влезает — отбрасывается (тело всё ещё ≤ лимита)', () => {
    const prompt = buildPromptForDeepLink(baseInput({ includeJson: true }), 300);
    expect(prompt.length).toBeLessThanOrEqual(300);
    expect(prompt).not.toContain('## Full JSON');
  });

  it('огромный артефакт: промпт усекается, указатель переживает усечение, длина ≤ лимита', () => {
    const hugeConsole: ConsoleEntry[] = [
      { level: 'error', source: 'console', text: 'X'.repeat(DEEP_LINK_PROMPT_LIMIT + 2000), at: 1 },
    ];
    const huge = composeArtifact(
      { ...fullParts, console: hugeConsole },
      { sections: allOn, mask: false, capturedAt: CREATED_AT },
    );
    const pointer = `${HANDOFF_DIR}/latest.md`;
    const prompt = buildPromptForDeepLink(baseInput({ artifact: huge, filePointer: pointer }));
    expect(prompt.length).toBeLessThanOrEqual(DEEP_LINK_PROMPT_LIMIT);
    expect(prompt).toContain('truncated');
    expect(prompt).toContain(pointer);
  });

  it('крайний случай: лимит меньше пометки усечения — итог всё равно ≤ лимита', () => {
    const prompt = buildPromptForDeepLink(baseInput({ artifact: full }), 5);
    expect(prompt.length).toBeLessThanOrEqual(5);
  });
});

describe('AgentHandoffPackageSchema', () => {
  it('принимает корректно собранный пакет', () => {
    const pkg = buildHandoffPackage(full, pkgOpts());
    expect(AgentHandoffPackageSchema.safeParse(pkg).success).toBe(true);
  });

  it('отклоняет неверную версию и битый артефакт', () => {
    const pkg = buildHandoffPackage(full, pkgOpts());
    expect(AgentHandoffPackageSchema.safeParse({ ...pkg, packageVersion: 2 }).success).toBe(false);
    expect(AgentHandoffPackageSchema.safeParse({ ...pkg, artifact: { version: 2 } }).success).toBe(
      false,
    );
  });
});
