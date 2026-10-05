/**
 * Architecture-fitness тесты (ARCHITECTURE §12) — стражи инварианта
 * расширяемости. Если ломается — фича «протекла» мимо контракта, чинить надо
 * контракт/архитектуру, а не тест.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import '@/features'; // саморегистрация фич
import { allFeatures } from '@/features/registry';
import { allMessageTypes, getMessageDef } from '@/shared/messaging/registry';
import { TOOLS } from '@/ui/shell/taxonomy';

const SRC = join(process.cwd(), 'src');

interface SourceFile {
  /** POSIX-путь относительно src, напр. `background/index.ts`. */
  rel: string;
  content: string;
  /** Код без комментариев и строковых литералов — чтобы `chrome.*` в комментах не давал ложных срабатываний. */
  code: string;
  imports: string[];
}

/** Грубо вырезает блочные/строчные комментарии и строковые/шаблонные литералы. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:from|import)\s+['"]([^'"]+)['"]/g;

function isTest(rel: string): boolean {
  return rel.includes('__tests__') || /\.test\.tsx?$/.test(rel);
}

const files: SourceFile[] = walk(SRC).map((full) => {
  const content = readFileSync(full, 'utf8');
  const imports = [...content.matchAll(IMPORT_RE)].map((m) => m[1] ?? '');
  return {
    rel: relative(SRC, full).split(sep).join('/'),
    content,
    code: stripCommentsAndStrings(content),
    imports,
  };
});

const prodFiles = files.filter((f) => !isTest(f.rel));

/** Владелец-фича файла, если он лежит в `features/<name>/…`; иначе undefined. */
function ownerFeature(rel: string): string | undefined {
  const m = /^features\/([^/]+)\//.exec(rel);
  return m?.[1];
}

describe('architecture fitness', () => {
  it('(1) no file outside a feature imports a concrete feature', () => {
    const violations: string[] = [];
    for (const f of prodFiles) {
      const owner = ownerFeature(f.rel);
      for (const spec of f.imports) {
        // Разрешены реестр (`@/features/registry`), UI-барель (`@/features`) и
        // background-барель (`@/features/background`, F6 TASK-046) — это core-точки
        // агрегации, а не конкретные фичи. Любой другой `@/features/<x>/…` — обращение
        // к конкретной фиче (запрещено вне неё).
        const m = /^@\/features\/([^/]+)/.exec(spec);
        if (!m) continue;
        const target = m[1];
        if (target === 'registry' || target === 'background') continue;
        if (owner && owner === target) continue; // файл внутри своей фичи
        violations.push(`${f.rel} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('(2) logic.ts stays pure (no Preact/platform/chrome)', () => {
    const forbidden = ['preact', '@/platform', 'webextension-polyfill'];
    const violations: string[] = [];
    for (const f of prodFiles) {
      if (!/(^|\/)logic\.ts$/.test(f.rel)) continue;
      for (const spec of f.imports) {
        if (forbidden.some((p) => spec === p || spec.startsWith(`${p}/`))) {
          violations.push(`${f.rel} imports ${spec}`);
        }
      }
      if (/\bchrome\s*\./.test(f.code)) violations.push(`${f.rel} touches chrome.*`);
    }
    expect(violations).toEqual([]);
  });

  it('(3) all feature ids and message types are unique', () => {
    const ids = allFeatures().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);

    const types = allMessageTypes();
    expect(new Set(types).size).toBe(types.length);
  });

  it('(4) every registered message type has a paired response schema', () => {
    for (const type of allMessageTypes()) {
      const def = getMessageDef(type);
      expect(def, type).toBeDefined();
      expect(def?.request, type).toBeDefined();
      expect(def?.response, type).toBeDefined();
    }
  });

  it('(5) chrome.* is only touched in src/platform and shared/messaging/transports.ts', () => {
    const allowed = (rel: string): boolean =>
      rel.startsWith('platform/') || rel === 'shared/messaging/transports.ts';
    const violations = prodFiles
      .filter((f) => !allowed(f.rel) && /\bchrome\s*\./.test(f.code))
      .map((f) => f.rel);
    expect(violations).toEqual([]);
  });

  it('(6) a feature with content-targeted messages declares content injection', () => {
    // Инвариант инспекционного слоя (TASK-013): если фича шлёт сообщения,
    // адресованные content-скрипту (`target: 'content'`), она обязана декларировать
    // `content: { world, injectOn }` — контракт инъекции по требованию, который
    // ядро гарантирует через `ensureContentScript`. Так поле дескриптора остаётся
    // нагруженным (его удаление ломает CI), а не декоративным.
    const violations: string[] = [];
    for (const feature of allFeatures()) {
      const hasContentMsg = (feature.messages ?? []).some((m) => m.target === 'content');
      if (hasContentMsg && feature.content === undefined) {
        violations.push(feature.id);
      }
    }
    expect(violations).toEqual([]);
  });

  it('(7) lazy feature bodies + decoupled UI/background barrels (F1/F2/F6 TASK-046)', () => {
    const byRel = (rel: string): SourceFile | undefined => prodFiles.find((f) => f.rel === rel);

    // SW тянет ТОЛЬКО background-барель, а не UI-барель `@/features` — иначе тела фич
    // (`ui.tsx`) и render-код попали бы в граф service worker'а.
    const sw = byRel('background/index.ts');
    expect(sw, 'background/index.ts').toBeDefined();
    expect(sw?.imports).toContain('@/features/background');
    expect(sw?.imports).not.toContain('@/features');

    // UI-барель `@/features` не импортирует фоновой код фич (перехватчики/DNR/CDP и т.п.),
    // чтобы граф popup/sidepanel оставался без него.
    const uiBarrel = byRel('features/index.ts');
    expect(uiBarrel, 'features/index.ts').toBeDefined();
    const barrelBackgroundImports = (uiBarrel?.imports ?? []).filter((s) =>
      s.endsWith('background'),
    );
    expect(barrelBackgroundImports).toEqual([]);

    // Ни один дескриптор фичи (`features/<f>/index.ts`) не тянет своё тело СТАТИЧЕСКИ —
    // только ленивым `import('./ui')` (динамический import не попадает в `imports`).
    const eagerUiBodies = prodFiles
      .filter((f) => /^features\/[^/]+\/index\.ts$/.test(f.rel))
      .filter((f) => f.imports.includes('./ui'))
      .map((f) => f.rel);
    expect(eagerUiBodies).toEqual([]);
  });

  it('(8) every registered feature is reachable from the nav catalog', () => {
    // Навигация v3 (Home → Tool) строится ИЗ каталога (`src/ui/shell/taxonomy.ts`),
    // а не напрямую из реестра фич. Зарегистрированная, но не отображённая в каталоге
    // фича собирается и «работает», но недостижима в UI — нет ни строки каталога, ни
    // результата поиска. Этот страж делает связку обязательной: новая фича обязана
    // попасть в каталог (`TOOLS`). `settings-sync` — исключение: он живёт в экране
    // настроек, а не в каталоге инструментов (REACHABLE_VIA_SETTINGS).
    const REACHABLE_VIA_SETTINGS = new Set(['settings-sync']);
    const mapped = new Set(TOOLS.map((tool) => tool.id));
    const unreachable = allFeatures()
      .map((f) => f.id)
      .filter((id) => !mapped.has(id) && !REACHABLE_VIA_SETTINGS.has(id));
    expect(unreachable).toEqual([]);
  });

  it('sanity: the feature barrel self-registered a non-empty registry', () => {
    // Барель `@/features` (side-effect импорт выше) должен наполнить оба реестра —
    // сам факт саморегистрации фич и их сообщений; конкретные id не фиксируем.
    expect(allFeatures().length).toBeGreaterThan(0);
    expect(allMessageTypes().length).toBeGreaterThan(0);
  });
});
