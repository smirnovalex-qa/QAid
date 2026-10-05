import { describe, it, expect } from 'vitest';
import {
  buildEnableParams,
  createCdpFetchProcessor,
  planRequestStage,
  planResponseStage,
  toBase64,
  toHeaderList,
} from '../transport';
import type { CdpRequestPausedEvent } from '../transport';
import { compileRule } from '../../logic';
import { DEFAULT_ACTION, DEFAULT_MATCHER } from '../../types';
import type { CompiledRule, MockAction } from '../../types';
import { makeRule } from '../../__tests__/fixtures/requests';

/** Компилирует правило для транспорта: glob-матчер на путь /api, с переопределениями действия. */
function rule(action: Partial<MockAction>, over?: { once?: number | null }): CompiledRule {
  const compiled = compileRule(
    makeRule({
      matcher: { ...DEFAULT_MATCHER, pattern: '*/api', patternKind: 'glob' },
      action: { ...DEFAULT_ACTION, ...action },
      once: over?.once ?? null,
    }),
  );
  if (compiled === null) throw new Error('compile failed');
  return compiled;
}

function reqEvent(over?: Partial<CdpRequestPausedEvent>): CdpRequestPausedEvent {
  return {
    requestId: 'req-1',
    request: { url: 'https://x.test/api', method: 'GET', headers: {} },
    ...over,
  };
}

/** UTF-8-безопасное декодирование base64 (обратное к `toBase64`). */
function fromBase64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface SeamCall {
  method: string;
  params: Record<string, unknown>;
}

/** Мок CDP-seam: пишет команды, отдаёт синтетический реальный ответ на getResponseBody. */
function makeSeam(): {
  calls: SeamCall[];
  sendCommand: (t: number, m: string, p?: object) => Promise<unknown>;
} {
  const calls: SeamCall[] = [];
  return {
    calls,
    sendCommand: (_tabId: number, method: string, params?: object): Promise<unknown> => {
      calls.push({ method, params: (params ?? {}) as Record<string, unknown> });
      if (method === 'Fetch.getResponseBody') {
        return Promise.resolve({ body: '{"real":true}', base64Encoded: false });
      }
      return Promise.resolve({});
    },
  };
}

describe('pure helpers', () => {
  it('buildEnableParams перехватывает всё на стадии Request', () => {
    expect(buildEnableParams()).toEqual({ patterns: [{ urlPattern: '*' }] });
  });

  it('toHeaderList / toBase64 round-trip', () => {
    expect(toHeaderList({ 'content-type': 'text/plain' })).toEqual([
      { name: 'content-type', value: 'text/plain' },
    ]);
    expect(fromBase64(toBase64('héllo {}'))).toBe('héllo {}');
  });
});

describe('planRequestStage', () => {
  it('offline → fail с сетевой ошибкой', () => {
    const plan = planRequestStage(rule({ offline: true, delayMs: 5 }), reqEvent());
    expect(plan.kind).toBe('fail');
    if (plan.kind === 'fail') {
      expect(plan.errorReason).toBe('Failed');
      expect(plan.delayMs).toBe(5);
    }
  });

  it('json → fulfill с телом/статусом/дефолтным content-type', () => {
    const plan = planRequestStage(
      rule({ bodyMode: 'json', body: '{"a":1}', status: 201 }),
      reqEvent(),
    );
    expect(plan.kind).toBe('fulfill');
    if (plan.kind === 'fulfill') {
      expect(plan.responseCode).toBe(201);
      expect(plan.body).toBe('{"a":1}');
      expect(plan.headers).toContainEqual({
        name: 'content-type',
        value: 'application/json; charset=utf-8',
      });
    }
  });

  it('подставляет плейсхолдеры тела (переиспользует logic.resolveBody)', () => {
    const plan = planRequestStage(
      rule({ bodyMode: 'literal', body: '{{method}} {{url}}' }),
      reqEvent(),
    );
    expect(plan.kind === 'fulfill' && plan.body).toBe('GET https://x.test/api');
  });

  it('passthrough → перехват стадии Response', () => {
    expect(planRequestStage(rule({ bodyMode: 'passthrough' }), reqEvent()).kind).toBe(
      'intercept-response',
    );
  });
});

describe('planResponseStage', () => {
  it('накладывает override-статус и сливает заголовки поверх реальных', () => {
    const plan = planResponseStage(
      rule({
        bodyMode: 'passthrough',
        status: 503,
        headers: [{ name: 'x-mock', value: '1', op: 'set' }],
      }),
      reqEvent({ responseStatusCode: 200, responseHeaders: [{ name: 'server', value: 'nginx' }] }),
    );
    expect(plan.responseCode).toBe(503);
    expect(plan.headers).toContainEqual({ name: 'server', value: 'nginx' });
    expect(plan.headers).toContainEqual({ name: 'x-mock', value: '1' });
  });

  it('без override берёт исходный статус реального ответа', () => {
    const plan = planResponseStage(
      rule({ bodyMode: 'passthrough', status: null }),
      reqEvent({ responseStatusCode: 204, responseHeaders: [] }),
    );
    expect(plan.responseCode).toBe(204);
  });
});

describe('createCdpFetchProcessor', () => {
  it('enable шлёт Fetch.enable с паттернами', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    await proc.enable();
    expect(seam.calls).toContainEqual({ method: 'Fetch.enable', params: buildEnableParams() });
  });

  it('json-правило → fulfillRequest и запись в лог (mocked)', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam, now: () => 100 });
    proc.updateRules([rule({ bodyMode: 'json', body: '{"ok":true}', status: 201 })]);

    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent());
    await flush();

    const fulfill = seam.calls.find((c) => c.method === 'Fetch.fulfillRequest');
    expect(fulfill).toBeDefined();
    expect(fulfill?.params.responseCode).toBe(201);
    expect(fromBase64(fulfill?.params.body as string)).toContain('"ok":true');
    const log = proc.readLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ mocked: true, status: 201, url: 'https://x.test/api' });
  });

  it('offline-правило → failRequest и лог со статусом 0', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([rule({ offline: true })]);

    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent());
    await flush();

    const fail = seam.calls.find((c) => c.method === 'Fetch.failRequest');
    expect(fail?.params).toMatchObject({ requestId: 'req-1', errorReason: 'Failed' });
    expect(proc.readLog()[0]).toMatchObject({
      status: 0,
      mocked: true,
      error: 'offline (emulated)',
    });
  });

  it('несовпавший запрос → наблюдение ответа и запись в лог (паритет с MAIN)', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([rule({ bodyMode: 'json' })]);
    const other = { url: 'https://x.test/other', method: 'GET', headers: {} };

    // Стадия Request: не совпало → continueRequest(interceptResponse), без записи и fulfill.
    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent({ request: other }));
    await flush();
    const cont = seam.calls.find((c) => c.method === 'Fetch.continueRequest');
    expect(cont?.params).toMatchObject({ requestId: 'req-1', interceptResponse: true });
    expect(seam.calls.some((c) => c.method === 'Fetch.fulfillRequest')).toBe(false);
    expect(proc.readLog()).toHaveLength(0);

    // Стадия Response: пишем реальный статус/размер (mocked:false), пропускаем ответ как есть
    // (без getResponseBody — размер из content-length, как MAIN для несовпавших).
    proc.handleEvent(
      { tabId: 7 },
      'Fetch.requestPaused',
      reqEvent({
        request: other,
        responseStatusCode: 200,
        responseHeaders: [{ name: 'content-length', value: '123' }],
      }),
    );
    await flush();
    expect(seam.calls.some((c) => c.method === 'Fetch.continueResponse')).toBe(true);
    expect(seam.calls.some((c) => c.method === 'Fetch.getResponseBody')).toBe(false);
    expect(proc.readLog()).toHaveLength(1);
    expect(proc.readLog()[0]).toMatchObject({
      mocked: false,
      ruleId: null,
      status: 200,
      sizeBytes: 123,
      url: 'https://x.test/other',
    });
  });

  it('наблюдение сетевой ошибки: запись error + release через continueRequest (не подвисает)', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([]); // без правил — наблюдаются все запросы

    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent());
    await flush();
    proc.handleEvent(
      { tabId: 7 },
      'Fetch.requestPaused',
      reqEvent({ responseErrorReason: 'Failed' }),
    );
    await flush();

    expect(proc.readLog()[0]).toMatchObject({ mocked: false, status: 0, error: 'Failed' });
    // Ответ уже провалился → отпускаем через continueRequest (не continueResponse):
    // стадия Request + release после ошибки.
    expect(seam.calls.filter((c) => c.method === 'Fetch.continueRequest')).toHaveLength(2);
    expect(seam.calls.some((c) => c.method === 'Fetch.continueResponse')).toBe(false);
  });

  it('resourceType XHR → source `xhr` в логе наблюдения', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([]);

    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent({ resourceType: 'XHR' }));
    await flush();
    proc.handleEvent(
      { tabId: 7 },
      'Fetch.requestPaused',
      reqEvent({ resourceType: 'XHR', responseStatusCode: 200, responseHeaders: [] }),
    );
    await flush();

    expect(proc.readLog()[0]).toMatchObject({ source: 'xhr', mocked: false });
  });

  it('passthrough: стадия Request перехватывает ответ, стадия Response накладывает override', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([rule({ bodyMode: 'passthrough', status: 503 })]);

    // Стадия Request → continueRequest с interceptResponse.
    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent());
    await flush();
    const cont = seam.calls.find((c) => c.method === 'Fetch.continueRequest');
    expect(cont?.params).toMatchObject({ requestId: 'req-1', interceptResponse: true });

    // Стадия Response → getResponseBody + fulfillRequest с override-статусом.
    proc.handleEvent(
      { tabId: 7 },
      'Fetch.requestPaused',
      reqEvent({ responseStatusCode: 200, responseHeaders: [{ name: 'server', value: 'nginx' }] }),
    );
    await flush();
    expect(seam.calls.some((c) => c.method === 'Fetch.getResponseBody')).toBe(true);
    const fulfill = seam.calls.find((c) => c.method === 'Fetch.fulfillRequest');
    expect(fulfill?.params.responseCode).toBe(503);
    expect(fromBase64(fulfill?.params.body as string)).toContain('"real":true');
    expect(proc.readLog()[0]).toMatchObject({ mocked: true, status: 503 });
  });

  it('лимит `once` исчерпывается: второй совпавший запрос проходит мимо', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([rule({ bodyMode: 'json' }, { once: 1 })]);

    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent({ requestId: 'a' }));
    await flush();
    proc.handleEvent({ tabId: 7 }, 'Fetch.requestPaused', reqEvent({ requestId: 'b' }));
    await flush();

    expect(seam.calls.filter((c) => c.method === 'Fetch.fulfillRequest')).toHaveLength(1);
    const secondContinue = seam.calls.find(
      (c) => c.method === 'Fetch.continueRequest' && c.params.requestId === 'b',
    );
    expect(secondContinue).toBeDefined();
  });

  it('игнорирует чужую вкладку и не-Fetch события', async () => {
    const seam = makeSeam();
    const proc = createCdpFetchProcessor({ tabId: 7, seam });
    proc.updateRules([rule({ bodyMode: 'json' })]);

    proc.handleEvent({ tabId: 99 }, 'Fetch.requestPaused', reqEvent());
    proc.handleEvent({ tabId: 7 }, 'Network.requestWillBeSent', {});
    await flush();

    expect(seam.calls).toHaveLength(0);
  });
});
