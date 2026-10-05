/**
 * Юнит-тесты чистого строителя deep-link (TASK-040): валидаторы схемы/репо/cwd,
 * детерминированный порядок и URL-энкод параметров, а также ЖЁСТКАЯ гарантия лимита
 * промпта по энкоженой длине (усечение с сохранением указателя на файл). Цель —
 * покрыть все ветки (канон «core ~100%»).
 */
import { describe, expect, it } from 'vitest';
import { DEEP_LINK_PROMPT_LIMIT, type DeepLinkSpec } from '../types';
import { buildDeepLink, validateCwd, validateRepo, validateScheme } from '../deep-link';

/** Достаёт значение промпт-параметра (последнего) и декодирует его. */
const decodePrompt = (url: string, param = 'q'): string => {
  const q = url.slice(url.indexOf('?') + 1);
  const pair = q.split('&').find((p) => p.startsWith(`${param}=`));
  return decodeURIComponent((pair ?? '').slice(param.length + 1));
};

describe('validateScheme', () => {
  it('принимает валидные схемы', () => {
    for (const s of ['claude-cli', 'codex', 'vscode', 'a', 'x1+.-']) {
      expect(validateScheme(s).ok).toBe(true);
    }
  });
  it('отклоняет невалидные схемы', () => {
    for (const s of ['1abc', 'Claude', 'has space', '', '-lead']) {
      const r = validateScheme(s);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.kind).toBe('invalid-scheme');
    }
  });
});

describe('validateRepo', () => {
  it('принимает owner/name', () => {
    for (const r of ['owner/name', 'a.b_c-d/x.y_z-1']) {
      expect(validateRepo(r).ok).toBe(true);
    }
  });
  it('отклоняет отсутствие/лишний слэш и края', () => {
    for (const r of ['ownername', 'owner/name/extra', '/name', 'owner/', 'owner name/x']) {
      const res = validateRepo(r);
      expect(res.ok).toBe(false);
      expect(!res.ok && res.error.kind).toBe('invalid-repo');
    }
  });
});

describe('validateCwd', () => {
  it('принимает абсолютные POSIX/Windows пути', () => {
    for (const c of ['/home/user/proj', 'C:\\Users\\user\\proj', 'C:/Users/user/proj']) {
      expect(validateCwd(c).ok).toBe(true);
    }
  });
  it('отклоняет пустое', () => {
    expect(validateCwd('').ok).toBe(false);
  });
  it('отклоняет сегмент ".." (оба вида слэшей)', () => {
    expect(validateCwd('/home/../etc').ok).toBe(false);
    expect(validateCwd('C:\\a\\..\\b').ok).toBe(false);
  });
  it('отклоняет UNC/сетевые пути', () => {
    expect(validateCwd('\\\\srv\\share').ok).toBe(false);
    expect(validateCwd('//srv/share').ok).toBe(false);
  });
  it('отклоняет управляющие символы', () => {
    expect(validateCwd('/home/\u0000x').ok).toBe(false);
    expect(validateCwd('/home/\u007Fx').ok).toBe(false);
  });
  it('отклоняет невидимые/bidi-символы', () => {
    expect(validateCwd('/home/\u202Eproj').ok).toBe(false);
    expect(validateCwd('/home/\u200Bproj').ok).toBe(false);
    expect(validateCwd('/home/\uFEFFproj').ok).toBe(false);
  });
  it('отклоняет неабсолютные пути', () => {
    const r = validateCwd('relative/path');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });
});

describe('buildDeepLink — базовая сборка', () => {
  it('claude-cli style: repo + промпт с переводом строки', () => {
    const r = buildDeepLink({
      scheme: 'claude-cli',
      path: 'open',
      target: { repo: 'owner/name' },
      prompt: 'hi\nthere',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('claude-cli://open?repo=owner%2Fname&q=hi%0Athere');
    expect(r.value.truncated).toBe(false);
  });

  it('newline энкодится как %0A', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'a\nb' });
    expect(r.ok && r.value.url.includes('%0A')).toBe(true);
  });

  it('вариант cwd', () => {
    const r = buildDeepLink({
      scheme: 'claude-cli',
      path: 'open',
      target: { cwd: 'C:\\Users\\u\\p' },
      prompt: 'go',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toContain('cwd=C%3A%5CUsers%5Cu%5Cp');
    expect(r.value.url).not.toContain('repo=');
  });

  it('extraParams сортируются по ключу, промпт — последним', () => {
    const r = buildDeepLink({
      scheme: 'x',
      prompt: 'p',
      extraParams: { zeta: '1', alpha: '2', mid: '3' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('x://?alpha=2&mid=3&zeta=1&q=p');
  });

  it('promptParam переопределяется', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', promptParam: 'prompt' });
    expect(r.ok && r.value.url).toBe('x://?prompt=p');
  });

  it('без таргета — параметров repo/cwd нет (схема их не требует)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe('x://?q=p');
  });

  it('repo и cwd вместе — repo идёт первым', () => {
    const r = buildDeepLink({
      scheme: 'x',
      prompt: 'p',
      target: { repo: 'o/n', cwd: '/abs' },
    });
    expect(r.ok && r.value.url).toBe('x://?repo=o%2Fn&cwd=%2Fabs&q=p');
  });
});

describe('buildDeepLink — отказы (данными)', () => {
  it('невалидная схема', () => {
    const r = buildDeepLink({ scheme: '1bad', prompt: 'p' });
    expect(!r.ok && r.error.kind).toBe('invalid-scheme');
  });
  it('невалидный repo (нет слэша)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { repo: 'noslash' } });
    expect(!r.ok && r.error.kind).toBe('invalid-repo');
  });
  it('невалидный repo (два слэша)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { repo: 'a/b/c' } });
    expect(!r.ok && r.error.kind).toBe('invalid-repo');
  });
  it('невалидный cwd (..)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { cwd: '/a/../b' } });
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });
  it('невалидный cwd (UNC)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { cwd: '\\\\srv\\share' } });
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });
  it('невалидный cwd (control char)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { cwd: '/a/\u0001b' } });
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });
  it('невалидный cwd (bidi char)', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { cwd: '/a/\u202Eb' } });
    expect(!r.ok && r.error.kind).toBe('invalid-cwd');
  });
  it('no-target: таргет присутствует, но оба поля пусты', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: { repo: '', cwd: '' } });
    expect(!r.ok && r.error.kind).toBe('no-target');
  });
  it('no-target: пустой объект таргета', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'p', target: {} });
    expect(!r.ok && r.error.kind).toBe('no-target');
  });
});

describe('buildDeepLink — гарантия лимита', () => {
  it('усекает длинный промпт по энкоженой длине, сохраняя указатель', () => {
    const limit = 120;
    const filePointer = '.qanvil/bug-reports/latest.md';
    const r = buildDeepLink({
      scheme: 'x',
      prompt: 'A'.repeat(5000),
      limit,
      filePointer,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.promptLength).toBeLessThanOrEqual(limit);
    const decoded = decodePrompt(r.value.url);
    expect(decoded).toContain(filePointer);
    expect(decoded).toContain('truncated');
  });

  it('усечение без filePointer — общая пометка', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'B'.repeat(500), limit: 40 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.promptLength).toBeLessThanOrEqual(40);
    expect(decodePrompt(r.value.url)).toContain('truncated');
  });

  it('дефолтный лимит — DEEP_LINK_PROMPT_LIMIT', () => {
    const r = buildDeepLink({ scheme: 'x', prompt: 'C'.repeat(DEEP_LINK_PROMPT_LIMIT + 100) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.promptLength).toBeLessThanOrEqual(DEEP_LINK_PROMPT_LIMIT);
  });

  it('мультибайтовый промпт (emoji/кириллица) уважает энкоженый лимит без обрыва суррогатов', () => {
    const limit = 100;
    const r = buildDeepLink({
      scheme: 'x',
      prompt: '🐛'.repeat(200) + 'кириллица'.repeat(50),
      limit,
      filePointer: 'f.md',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(true);
    expect(r.value.promptLength).toBeLessThanOrEqual(limit);
    // Декодирование не должно бросать (суррогатные пары целы).
    expect(() => decodePrompt(r.value.url)).not.toThrow();
    expect(decodePrompt(r.value.url)).toContain('f.md');
  });

  it('промпт ровно в лимит — не усекается', () => {
    const spec: DeepLinkSpec = { scheme: 'x', prompt: 'D'.repeat(DEEP_LINK_PROMPT_LIMIT) };
    const r = buildDeepLink(spec);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(false);
    expect(r.value.promptLength).toBe(DEEP_LINK_PROMPT_LIMIT);
  });
});
