/**
 * Транспорты — сменные каналы под единым интерфейсом (ADR-0012). Код фичи не
 * знает, через какой канал идёт сообщение.
 *
 * Это один из двух модулей (второй — `src/platform`), которым разрешён прямой
 * доступ к `chrome.*` (граница платформы, ADR-0014).
 */
import { logger } from '@/shared/logger';
import { MARKER } from './envelope';

export interface MessageMeta {
  tabId?: number;
  source: 'runtime' | 'tabs' | 'window';
}

export interface Transport {
  /** Клиентский вызов: отправить конверт и получить ответ. */
  send(raw: unknown): Promise<unknown>;
  /** Приёмник: подписаться на входящие конверты; возвращает функцию отписки. */
  onMessage(cb: (raw: unknown, meta: MessageMeta) => Promise<unknown>): () => void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isMarked(v: unknown): v is Record<string, unknown> {
  return isRecord(v) && v[MARKER] === true;
}

/** `chrome.runtime` — основной канал UI/content → background. */
export function runtimeTransport(): Transport {
  return {
    send(raw) {
      return chrome.runtime.sendMessage(raw);
    },
    onMessage(cb) {
      const listener = (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ): boolean => {
        const tabId = sender.tab?.id;
        const meta: MessageMeta =
          tabId === undefined ? { source: 'runtime' } : { source: 'runtime', tabId };
        // Асинхронный ответ в MV3 требует вернуть true из нативного listener'а —
        // инкапсулировано здесь, наружу торчит только promise-based onMessage.
        void cb(message, meta)
          .then((response) => {
            sendResponse(response);
          })
          .catch((error: unknown) => {
            logger.error('runtimeTransport.onMessage', error);
            sendResponse(undefined);
          });
        return true;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    },
  };
}

/** `chrome.tabs.sendMessage` — background → content (ISOLATED), адресация по `tabId`. Send-only. */
export function tabsTransport(tabId: number): Transport {
  return {
    send(raw) {
      return chrome.tabs.sendMessage(tabId, raw);
    },
    onMessage() {
      throw new Error('tabsTransport is send-only; принимай в content через runtimeTransport');
    },
  };
}

/**
 * `window.postMessage` — content (ISOLATED) ↔ page (MAIN world). MAIN не имеет
 * `chrome.*`, поэтому это единственный канал наружу. Фильтрация по маркеру и
 * `event.source` — в приёмнике (безопасность, ARCHITECTURE §11).
 */
export function windowTransport(target: Window): Transport {
  return {
    send(raw) {
      return new Promise((resolve) => {
        const correlationId =
          isRecord(raw) && typeof raw.correlationId === 'string'
            ? raw.correlationId
            : crypto.randomUUID();
        const onReply = (event: MessageEvent): void => {
          if (event.source !== target) return;
          const data: unknown = event.data;
          if (!isMarked(data) || data.__reply__ !== true) return;
          if (data.correlationId !== correlationId) return;
          target.removeEventListener('message', onReply);
          resolve(data.payload);
        };
        target.addEventListener('message', onReply);
        const base = isRecord(raw) ? raw : {};
        target.postMessage({ ...base, [MARKER]: true, correlationId }, '*');
      });
    },
    onMessage(cb) {
      const listener = (event: MessageEvent): void => {
        if (event.source !== target) return;
        const data: unknown = event.data;
        if (!isMarked(data) || data.__reply__ === true) return;
        void cb(data, { source: 'window' })
          .then((response) => {
            target.postMessage(
              {
                [MARKER]: true,
                __reply__: true,
                correlationId: data.correlationId,
                payload: response,
              },
              '*',
            );
          })
          .catch((error: unknown) => {
            logger.error('windowTransport.onMessage', error);
          });
      };
      target.addEventListener('message', listener);
      return () => {
        target.removeEventListener('message', listener);
      };
    },
  };
}
