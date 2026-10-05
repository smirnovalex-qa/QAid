import { describe, it, expect } from 'vitest';
import {
  areMethodsValid,
  buildRequestSpecFromCaught,
  buildUrl,
  compilePattern,
  compileRule,
  compileRules,
  defaultContentType,
  emptyRequestSpec,
  findMatch,
  globToRegexSource,
  isMutatingMethod,
  matchRule,
  mergeResponseHeaders,
  methodAllowsBody,
  parseUrl,
  resolveBody,
  resolveStatus,
  toCurl,
  toHeaderPairs,
  prettyJson,
  minifyJson,
  MAX_PATTERN_LENGTH,
} from '../logic';
import type { CaughtRequest, CompiledRule, KeyValue, RequestSpec } from '../types';
import { makeRequest, makeRule } from './fixtures/requests';

/** Строит снимок пойманного запроса для тестов префилла replay. */
function makeCaught(over?: Partial<CaughtRequest>): CaughtRequest {
  return {
    id: 1,
    method: 'GET',
    url: 'https://api.example.com/users',
    status: 200,
    mocked: false,
    ruleId: null,
    source: 'fetch',
    sizeBytes: 0,
    durationMs: 0,
    startedAt: 0,
    error: null,
    ...over,
  };
}

function kv(key: string, value: string, enabled = true): KeyValue {
  return { key, value, enabled };
}

describe('globToRegexSource', () => {
  it('переводит * и ? в безопасные конструкции и анкорит', () => {
    expect(globToRegexSource('a*b')).toBe('^a.*b$');
    expect(globToRegexSource('a?b')).toBe('^a.b$');
  });

  it('экранирует regex-метасимволы литерала', () => {
    expect(globToRegexSource('a.b+c')).toBe('^a\\.b\\+c$');
    // Точка не должна стать «любой символ» — только реальный `?`/`*`.
    const re = new RegExp(globToRegexSource('a.b'));
    expect(re.test('axb')).toBe(false);
    expect(re.test('a.b')).toBe(true);
  });

  it('glob со * матчит подстроку через regex', () => {
    const re = new RegExp(globToRegexSource('https://api.example.com/*'), 'i');
    expect(re.test('https://api.example.com/users')).toBe(true);
    expect(re.test('https://other.com/users')).toBe(false);
  });
});

describe('compilePattern', () => {
  it('glob → source+flags', () => {
    expect(compilePattern('a*', 'glob')).toEqual({ source: '^a.*$', flags: 'i' });
  });

  it('regex — сырой source без анкоринга', () => {
    expect(compilePattern('users/\\d+', 'regex')).toEqual({ source: 'users/\\d+', flags: 'i' });
  });

  it('невалидный regex → null (fail-safe)', () => {
    expect(compilePattern('(unclosed', 'regex')).toBeNull();
  });

  it('слишком длинный паттерн → null', () => {
    expect(compilePattern('a'.repeat(MAX_PATTERN_LENGTH + 1), 'glob')).toBeNull();
  });
});

describe('compileRule / compileRules', () => {
  it('компилирует правило: методы в upper, delay floor', () => {
    const rule = makeRule({
      matcher: {
        methods: ['get', 'post'] as never,
        pattern: '*/users',
        patternKind: 'glob',
        headerPredicates: [],
      },
      action: {
        status: 201,
        statusText: '',
        headers: [],
        bodyMode: 'json',
        body: '{}',
        delayMs: 10.9,
        throttleKbps: null,
        offline: false,
      },
      once: 3,
    });
    const c = compileRule(rule);
    expect(c).not.toBeNull();
    expect(c?.methods).toEqual(['GET', 'POST']);
    expect(c?.action.delayMs).toBe(10);
    expect(c?.remaining).toBe(3);
  });

  it('битый паттерн → null', () => {
    const rule = makeRule({
      matcher: { methods: [], pattern: '(', patternKind: 'regex', headerPredicates: [] },
    });
    expect(compileRule(rule)).toBeNull();
  });

  it('compileRules: только включённые, порядок сохранён, битые отброшены', () => {
    const a = makeRule({
      id: 'a',
      matcher: { methods: [], pattern: 'a', patternKind: 'glob', headerPredicates: [] },
    });
    const disabled = makeRule({ id: 'b', enabled: false });
    const broken = makeRule({
      id: 'c',
      matcher: { methods: [], pattern: '(', patternKind: 'regex', headerPredicates: [] },
    });
    const d = makeRule({
      id: 'd',
      matcher: { methods: [], pattern: 'd', patternKind: 'glob', headerPredicates: [] },
    });
    const out = compileRules([a, disabled, broken, d]);
    expect(out.map((r) => r.id)).toEqual(['a', 'd']);
  });
});

describe('matchRule', () => {
  const base = (over?: Partial<CompiledRule>): CompiledRule => ({
    id: 'r',
    methods: [],
    urlRegexSource: '^https://api\\.example\\.com/.*$',
    urlRegexFlags: 'i',
    headerPredicates: [],
    action: {
      status: 200,
      statusText: '',
      headers: [],
      bodyMode: 'json',
      body: '{}',
      delayMs: 0,
      throttleKbps: null,
      offline: false,
    },
    remaining: null,
    ...over,
  });

  it('пустой список методов = любой метод', () => {
    expect(matchRule(base(), makeRequest({ method: 'DELETE' }))).toBe(true);
  });

  it('метод учитывается (регистронезависимо)', () => {
    expect(matchRule(base({ methods: ['POST'] }), makeRequest({ method: 'post' }))).toBe(true);
    expect(matchRule(base({ methods: ['POST'] }), makeRequest({ method: 'GET' }))).toBe(false);
  });

  it('URL по regex', () => {
    expect(matchRule(base(), makeRequest({ url: 'https://api.example.com/x' }))).toBe(true);
    expect(matchRule(base(), makeRequest({ url: 'https://other.com/x' }))).toBe(false);
  });

  it('невалидный regex source → не матчит (fail-safe)', () => {
    expect(matchRule(base({ urlRegexSource: '(' }), makeRequest())).toBe(false);
  });

  it('предикаты по заголовкам (подстрока, регистронезависимо по имени)', () => {
    const rule = base({ headerPredicates: [{ name: 'Authorization', value: 'Bearer' }] });
    expect(matchRule(rule, makeRequest({ requestHeaders: { authorization: 'Bearer x' } }))).toBe(
      true,
    );
    expect(matchRule(rule, makeRequest({ requestHeaders: { authorization: 'Basic y' } }))).toBe(
      false,
    );
    expect(matchRule(rule, makeRequest({ requestHeaders: {} }))).toBe(false);
  });
});

describe('findMatch', () => {
  const mk = (id: string, source: string, remaining: number | null): CompiledRule => ({
    id,
    methods: [],
    urlRegexSource: source,
    urlRegexFlags: 'i',
    headerPredicates: [],
    action: {
      status: 200,
      statusText: '',
      headers: [],
      bodyMode: 'json',
      body: '{}',
      delayMs: 0,
      throttleKbps: null,
      offline: false,
    },
    remaining,
  });

  it('возвращает первое совпадение по приоритету', () => {
    const rules = [mk('a', '^.*users.*$', null), mk('b', '^.*users.*$', null)];
    expect(findMatch(rules, makeRequest({ url: 'x/users' }))?.id).toBe('a');
  });

  it('пропускает исчерпанные (remaining===0)', () => {
    const rules = [mk('a', '^.*$', 0), mk('b', '^.*$', null)];
    expect(findMatch(rules, makeRequest())?.id).toBe('b');
  });

  it('нет совпадения → undefined', () => {
    expect(findMatch([mk('a', '^zzz$', null)], makeRequest())).toBeUndefined();
  });
});

describe('mergeResponseHeaders', () => {
  it('set добавляет и заменяет (регистронезависимо, сохраняя ключ)', () => {
    const out = mergeResponseHeaders({ 'Content-Type': 'text/html' }, [
      { name: 'content-type', value: 'application/json', op: 'set' },
      { name: 'X-New', value: '1', op: 'set' },
    ]);
    expect(out['Content-Type']).toBe('application/json');
    expect(out['X-New']).toBe('1');
  });

  it('remove удаляет существующий; отсутствующий — no-op', () => {
    const out = mergeResponseHeaders({ A: '1', B: '2' }, [
      { name: 'a', value: '', op: 'remove' },
      { name: 'z', value: '', op: 'remove' },
    ]);
    expect(out).toEqual({ B: '2' });
  });

  it('не мутирует базу', () => {
    const base = { A: '1' };
    mergeResponseHeaders(base, [{ name: 'A', value: '2', op: 'set' }]);
    expect(base.A).toBe('1');
  });
});

describe('resolveBody', () => {
  it('подставляет плейсхолдеры (инъектируемые now/rand)', () => {
    const out = resolveBody('{"u":"{{url}}","m":"{{method}}","t":"{{now}}","r":"{{random}}"}', {
      url: 'http://x',
      method: 'GET',
      now: () => 0,
      rand: () => 0,
    });
    expect(out).toContain('"u":"http://x"');
    expect(out).toContain('"m":"GET"');
    expect(out).toContain('1970-01-01T00:00:00.000Z');
    expect(out).toContain('"r":"0"');
  });

  it('неизвестный плейсхолдер остаётся; дефолтные now/rand не падают', () => {
    const out = resolveBody('{{url}} {{unknown}}', { url: 'u', method: 'GET' });
    expect(out).toBe('u {{unknown}}');
  });
});

describe('resolveStatus / defaultContentType / areMethodsValid', () => {
  it('resolveStatus: override либо исходный', () => {
    const action = {
      status: 404,
      statusText: '',
      headers: [],
      bodyMode: 'json' as const,
      body: '',
      delayMs: 0,
      throttleKbps: null,
      offline: false,
    };
    expect(resolveStatus(action, 200)).toBe(404);
    expect(resolveStatus({ ...action, status: null }, 200)).toBe(200);
  });

  it('defaultContentType по режиму', () => {
    expect(defaultContentType('json')).toContain('application/json');
    expect(defaultContentType('literal')).toContain('text/plain');
    expect(defaultContentType('passthrough')).toContain('text/plain');
  });

  it('areMethodsValid', () => {
    expect(areMethodsValid(['GET', 'POST'])).toBe(true);
    expect(areMethodsValid(['GET', 'FOO'])).toBe(false);
  });
});

// ── Replay (TASK-038) ──────────────────────────────────────────────────────────

describe('methodAllowsBody / isMutatingMethod', () => {
  it('methodAllowsBody: не GET/HEAD (регистронезависимо)', () => {
    expect(methodAllowsBody('GET')).toBe(false);
    expect(methodAllowsBody('head')).toBe(false);
    expect(methodAllowsBody('POST')).toBe(true);
    expect(methodAllowsBody('delete')).toBe(true);
  });

  it('isMutatingMethod: не GET/HEAD/OPTIONS', () => {
    expect(isMutatingMethod('GET')).toBe(false);
    expect(isMutatingMethod('HEAD')).toBe(false);
    expect(isMutatingMethod('OPTIONS')).toBe(false);
    expect(isMutatingMethod('POST')).toBe(true);
    expect(isMutatingMethod('put')).toBe(true);
    expect(isMutatingMethod('PATCH')).toBe(true);
    expect(isMutatingMethod('DELETE')).toBe(true);
  });
});

describe('parseUrl', () => {
  it('без query → пустой список', () => {
    expect(parseUrl('https://x.com/a')).toEqual({ base: 'https://x.com/a', query: [] });
  });

  it('разбирает query в пары (percent-decode)', () => {
    const { base, query } = parseUrl('https://x.com/a?b=1&c=hello%20world');
    expect(base).toBe('https://x.com/a');
    expect(query).toEqual([kv('b', '1'), kv('c', 'hello world')]);
  });

  it('отбрасывает fragment (не уходит на сервер)', () => {
    expect(parseUrl('https://x.com/a?b=1#frag')).toEqual({
      base: 'https://x.com/a',
      query: [kv('b', '1')],
    });
    expect(parseUrl('https://x.com/a#frag')).toEqual({ base: 'https://x.com/a', query: [] });
  });

  it('повторяющиеся ключи сохраняются как отдельные строки', () => {
    expect(parseUrl('https://x.com/?a=1&a=2').query).toEqual([kv('a', '1'), kv('a', '2')]);
  });
});

describe('buildUrl', () => {
  it('собирает включённые непустые параметры', () => {
    expect(buildUrl('https://x.com/a', [kv('b', '1'), kv('c', '2')])).toBe(
      'https://x.com/a?b=1&c=2',
    );
  });

  it('пропускает выключенные и с пустым ключом', () => {
    expect(buildUrl('https://x.com/a', [kv('b', '1', false), kv('', 'x'), kv('c', '2')])).toBe(
      'https://x.com/a?c=2',
    );
  });

  it('percent-кодирует значения', () => {
    expect(buildUrl('https://x.com/a', [kv('q', 'a b&c')])).toBe('https://x.com/a?q=a+b%26c');
  });

  it('идемпотентно: усекает лишний ? в базе', () => {
    expect(buildUrl('https://x.com/a?stale=1', [kv('b', '2')])).toBe('https://x.com/a?b=2');
  });

  it('пустой query → база без ?', () => {
    expect(buildUrl('https://x.com/a', [])).toBe('https://x.com/a');
  });

  it('parseUrl∘buildUrl — round-trip', () => {
    const src = 'https://x.com/a?b=1&c=2';
    const { base, query } = parseUrl(src);
    expect(buildUrl(base, query)).toBe(src);
  });
});

describe('buildRequestSpecFromCaught', () => {
  it('префилл метода, URL (без query) и query из пойманного', () => {
    const spec = buildRequestSpecFromCaught(
      makeCaught({ method: 'get', url: 'https://api.example.com/users?page=2' }),
    );
    expect(spec.method).toBe('GET');
    expect(spec.url).toBe('https://api.example.com/users');
    expect(spec.query).toEqual([kv('page', '2')]);
    // Заголовки/тело пойманного не снимаются — начинаются пустыми.
    expect(spec.headers).toEqual([]);
    expect(spec.body).toBe('');
    expect(spec.bodyMode).toBe('none');
  });

  it('для метода с телом bodyMode = raw', () => {
    const spec = buildRequestSpecFromCaught(makeCaught({ method: 'POST' }));
    expect(spec.method).toBe('POST');
    expect(spec.bodyMode).toBe('raw');
  });

  it('нестандартный метод → GET (fail-safe)', () => {
    expect(buildRequestSpecFromCaught(makeCaught({ method: 'PROPFIND' })).method).toBe('GET');
  });
});

describe('emptyRequestSpec', () => {
  it('даёт валидный пустой дефолт', () => {
    expect(emptyRequestSpec()).toEqual({
      method: 'GET',
      url: '',
      query: [],
      headers: [],
      body: '',
      bodyMode: 'none',
    });
  });
});

describe('toHeaderPairs', () => {
  it('только включённые с непустым ключом', () => {
    expect(toHeaderPairs([kv('A', '1'), kv('B', '2', false), kv('', 'x'), kv('C', '3')])).toEqual([
      ['A', '1'],
      ['C', '3'],
    ]);
  });
});

describe('toCurl', () => {
  const base = (over?: Partial<RequestSpec>): RequestSpec => ({
    method: 'GET',
    url: 'https://api.example.com/users',
    query: [],
    headers: [],
    body: '',
    bodyMode: 'none',
    ...over,
  });

  it('GET без -X и без тела', () => {
    expect(toCurl(base())).toBe(`curl 'https://api.example.com/users'`);
  });

  it('query собирается в URL', () => {
    expect(toCurl(base({ query: [kv('page', '2')] }))).toBe(
      `curl 'https://api.example.com/users?page=2'`,
    );
  });

  it('POST c -X, заголовками и --data', () => {
    const cmd = toCurl(
      base({
        method: 'POST',
        headers: [kv('Content-Type', 'application/json'), kv('X-Off', 'v', false)],
        body: '{"a":1}',
        bodyMode: 'json',
      }),
    );
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain(`-H 'Content-Type: application/json'`);
    expect(cmd).not.toContain('X-Off');
    expect(cmd).toContain(`--data '{"a":1}'`);
    expect(cmd).toContain(`'https://api.example.com/users'`);
  });

  it('не добавляет --data для GET даже при непустом теле', () => {
    expect(toCurl(base({ body: 'x', bodyMode: 'raw' }))).not.toContain('--data');
  });

  it('не добавляет --data при bodyMode none', () => {
    expect(toCurl(base({ method: 'POST', body: 'x', bodyMode: 'none' }))).not.toContain('--data');
  });

  it('экранирует одинарные кавычки по POSIX', () => {
    const cmd = toCurl(base({ method: 'POST', body: `it's`, bodyMode: 'raw' }));
    expect(cmd).toContain(`--data 'it'\\''s'`);
  });
});

describe('prettyJson / minifyJson (replay formatting)', () => {
  it('prettyJson форматирует с отступом', () => {
    const res = prettyJson('{"a":1}', { indent: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe('{\n  "a": 1\n}');
  });

  it('minifyJson сжимает', () => {
    const res = minifyJson('{ "a" : 1 }');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe('{"a":1}');
  });

  it('невалидный JSON → ok:false', () => {
    expect(prettyJson('{not json', { indent: 2 }).ok).toBe(false);
    expect(minifyJson('nope').ok).toBe(false);
  });

  it('пустой ввод → ok:false', () => {
    expect(prettyJson('   ', { indent: 2 }).ok).toBe(false);
    expect(minifyJson('').ok).toBe(false);
  });
});
