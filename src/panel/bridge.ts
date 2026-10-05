/**
 * Мост тела панели (iframe-сторона) к content-обёртке (TASK-062, ADR-0053).
 *
 * Тело панели (эта extension-страница) живёт в cross-origin iframe внутри обёртки на
 * странице. RPC к background идёт обычным `chrome.runtime`-bus (как в popup/side panel);
 * этот мост — ТОЛЬКО служебная координация жизненного цикла с обёрткой по `window.postMessage`
 * с per-mount nonce (обёртка передала его в `#hash` URL iframe).
 *
 * Критично: на старте мост шлёт обёртке `ready` — иначе обёртка по дедлайну решит, что
 * фрейминг заблокирован строгой CSP страницы, и покажет фолбэк. Остальные методы
 * (`collapse`/`expand`/`close`/`resize`) — для управления окном из тела (напр. хоткей);
 * оконный chrome (drag/свернуть/закрыть) по умолчанию рисует обёртка.
 *
 * Если `nonce` отсутствует (страница открыта не как тело панели, а напрямую — dev/standalone),
 * мост инертен: сообщения не шлются, слушатель не вешается.
 */
import {
  ToPanelSchema,
  decodePanelMessage,
  encodePanelMessage,
  type FromPanelMessage,
  type ToPanelMessage,
} from '@/shared/panel/protocol';

export interface PanelBridge {
  /** Per-mount nonce из `#hash` URL (null — страница открыта не в обёртке). */
  readonly nonce: string | null;
  /** Запросить сворачивание/разворачивание/закрытие окна у обёртки. */
  collapse(): void;
  expand(): void;
  close(): void;
  /** Запросить желаемый размер тела (резерв под свободный resize). */
  resize(size: { width?: number; height?: number }): void;
  /** Подписаться на `state` от обёртки (восстановленное/обновлённое состояние окна). */
  onState(cb: (state: ToPanelMessage) => void): () => void;
  /** Снять слушатель. Идемпотентно. */
  destroy(): void;
}

/**
 * Инициализирует мост: читает nonce из `location.hash`, шлёт обёртке `ready`, слушает
 * `state`. `win` инъектируется для тестов.
 */
export function initPanelBridge(win: Window = window): PanelBridge {
  const hash = win.location.hash.startsWith('#') ? win.location.hash.slice(1) : '';
  const nonce = hash.length > 0 ? hash : null;
  const parent = win.parent;
  const active = nonce !== null && parent !== win;

  const listeners = new Set<(state: ToPanelMessage) => void>();

  const post = (msg: FromPanelMessage): void => {
    if (nonce === null || !active) return;
    parent.postMessage(encodePanelMessage(nonce, msg), '*');
  };

  const onMessage = (event: MessageEvent): void => {
    if (nonce === null) return;
    // Защита — per-mount nonce + схема (page-скрипт не знает nonce, см. protocol.ts):
    // этого достаточно, отдельная сверка источника тут избыточна (обёртка — единственный,
    // кто знает nonce). Источник сверяет обёртка на своей стороне (host.ts).
    const msg = decodePanelMessage(event.data, nonce, ToPanelSchema);
    if (!msg) return;
    for (const cb of listeners) cb(msg);
  };

  if (active) {
    win.addEventListener('message', onMessage);
    post({ type: 'ready' });
  }

  return {
    nonce,
    collapse: () => {
      post({ type: 'collapse' });
    },
    expand: () => {
      post({ type: 'expand' });
    },
    close: () => {
      post({ type: 'close' });
    },
    resize: (size) => {
      post({ type: 'resize', ...size });
    },
    onState: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy: () => {
      listeners.clear();
      if (active) win.removeEventListener('message', onMessage);
    },
  };
}
