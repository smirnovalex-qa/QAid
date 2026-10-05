/**
 * Sender-транспорт replay (TASK-038). Выполняет реальный `fetch` из контекста
 * расширения (background/service worker) — так запрос идёт с host-правом и в обход
 * CORS страницы (ожидаемое поведение QA-инструмента, ADR sender-в-background).
 *
 * Тестируемость: реализация `fetch` инъектируется (`createSender({ fetchImpl })`),
 * платформенного seam НЕТ и импорт `@/platform` запрещён — это тонкая обёртка над
 * стандартным `fetch`. Никогда не бросает наружу: сеть/таймаут/превышение размера
 * возвращаются дискриминируемым `ReplayResult` (сбой — это данные, не исключение).
 */
import { buildUrl, toHeaderPairs } from '../logic';
import { REPLAY_LIMITS } from '../types';
import type { ReplayError, ReplayResult, RequestSpec, ResponseMeta } from '../types';

/** Инъектируемая реализация fetch (по умолчанию — глобальный `fetch`). */
export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface SenderOptions {
  /** Реализация fetch (тесты подставляют фейк). */
  fetchImpl?: FetchImpl;
  /** Таймаут отправки, мс. */
  timeoutMs?: number;
  /** Максимум байт тела ответа (защита памяти); превышение → сбой `too-large`. */
  maxBytes?: number;
  /** Источник времени (тесты — для детерминированного тайминга). */
  now?: () => number;
}

export interface Sender {
  send(spec: RequestSpec): Promise<ReplayResult>;
}

function fail(kind: ReplayError['kind'], message: string): ReplayResult {
  return { ok: false, error: { kind, message } };
}

/**
 * Читает тело ответа с ограничением размера. Если доступен `ReadableStream`
 * (`body.getReader`) — стримит и обрывает при превышении капа (не буферизует
 * гигантский ответ целиком). Иначе — `text()` с пост-проверкой размера. Возвращает
 * `null` при превышении лимита.
 */
async function readCappedBody(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; size: number } | null> {
  const cl = res.headers.get('content-length');
  if (cl !== null && cl !== '') {
    const declared = Number(cl);
    if (Number.isFinite(declared) && declared > maxBytes) return null;
  }

  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (body != null && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return { text: new TextDecoder().decode(merged), size };
  }

  const text = await res.text();
  const size = new TextEncoder().encode(text).length;
  if (size > maxBytes) return null;
  return { text, size };
}

/** Снимает заголовки ответа в стабильный список пар. */
function collectHeaders(headers: Headers): ResponseMeta['headers'] {
  const out: ResponseMeta['headers'] = [];
  headers.forEach((value, key) => {
    out.push({ key, value });
  });
  return out;
}

/**
 * Создаёт sender с внедрёнными зависимостями. Возвращает объект с единственным
 * методом `send` — по одному запросу за раз, только по явному вызову (никакого
 * автоповтора; безопасность мутирующих методов обеспечивает UI подтверждением).
 */
export function createSender(options: SenderOptions = {}): Sender {
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? REPLAY_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? REPLAY_LIMITS.maxBytes;
  const now = options.now ?? (() => Date.now());

  async function send(spec: RequestSpec): Promise<ReplayResult> {
    const method = spec.method.toUpperCase().trim();
    if (method === '') return fail('bad-request', 'Empty HTTP method');
    const url = buildUrl(spec.url, spec.query);
    if (url === '') return fail('bad-request', 'Empty URL');

    const init: RequestInit = { method, redirect: 'follow' };
    const headers = toHeaderPairs(spec.headers);
    if (headers.length > 0) init.headers = headers;
    if (method !== 'GET' && method !== 'HEAD' && spec.bodyMode !== 'none' && spec.body !== '') {
      init.body = spec.body;
    }

    // Единственный источник abort — таймер ниже, поэтому `signal.aborted` в catch
    // однозначно означает таймаут (отдельный флаг не нужен — TS не отслеживает его
    // мутацию в колбэке, а `signal.aborted` читается как живое свойство).
    const controller = new AbortController();
    init.signal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const started = now();
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch (e) {
      clearTimeout(timer);
      if (controller.signal.aborted)
        return fail('timeout', `Request exceeded ${String(timeoutMs)} ms`);
      return fail('network', e instanceof Error ? e.message : String(e));
    }

    try {
      const read = await readCappedBody(res, maxBytes);
      if (read === null) return fail('too-large', `Response exceeds ${String(maxBytes)} bytes`);
      const durationMs = Math.max(0, Math.round(now() - started));
      const response: ResponseMeta = {
        status: res.status,
        statusText: res.statusText,
        headers: collectHeaders(res.headers),
        body: read.text,
        truncated: false,
        sizeBytes: read.size,
        durationMs,
        url: res.url === '' ? url : res.url,
      };
      return { ok: true, response };
    } catch (e) {
      if (controller.signal.aborted)
        return fail('timeout', `Request exceeded ${String(timeoutMs)} ms`);
      return fail('network', e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  return { send };
}
