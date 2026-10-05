/**
 * postMessage-протокол координации «content-обёртка ↔ iframe тела панели»
 * (TASK-062, ADR-0053). Чистый слой `shared` — без `chrome.*`/Preact/DOM-специфики
 * (только типы и zod). Транспорт наружу к странице тут НЕ описывается: тело панели
 * (iframe — extension-контекст) ходит к background тем же `chrome.runtime`-bus, что
 * popup/side panel. Здесь — ТОЛЬКО служебная координация жизненного цикла/drag/размера
 * между содержащей обёрткой (content-реалм) и её iframe.
 *
 * Безопасность (ARCHITECTURE §11): iframe виден скриптам страницы, поэтому КАЖДОЕ
 * сообщение несёт per-mount крипто-nonce (обёртка генерит его на монтаж и передаёт в
 * `#hash` URL iframe). Обе стороны валидируют marker+nonce+схему и ИГНОРИРУЮТ всё
 * без nonce / с чужим nonce / не прошедшее схему — скрипт страницы не сможет закрыть,
 * подвинуть панель или подсунуть данные.
 */
import { z } from 'zod';

/** Маркер-сигнатура служебного сообщения панели (фильтр `window.postMessage`). */
export const PANEL_MARKER = '__qatbPanel__';

/** Границы ширины панели (используются и настройками, и clamp'ом размера). */
export const PANEL_MIN_WIDTH = 320;
export const PANEL_MAX_WIDTH = 720;
/** Ширина по умолчанию (воспроизводит привычную ширину popup). */
export const PANEL_DEFAULT_WIDTH = 380;

// ─── Сообщения iframe → обёртка ──────────────────────────────────────────────
/** Тело панели загрузилось и готово принимать состояние (обёртка шлёт `state`). */
const ReadyMsg = z.object({ type: z.literal('ready') });
/** Намерение свернуть/развернуть/закрыть из тела панели (напр. хоткей внутри UI). */
const CollapseMsg = z.object({ type: z.literal('collapse') });
const ExpandMsg = z.object({ type: z.literal('expand') });
const CloseMsg = z.object({ type: z.literal('close') });
/** Желаемый размер тела (резерв под будущий свободный resize; обёртка — источник истины). */
const ResizeMsg = z.object({
  type: z.literal('resize'),
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
});

// ─── Сообщения обёртка → iframe ──────────────────────────────────────────────
/** Текущее состояние окна панели (восстановленное/после действий обёртки). */
const StateMsg = z.object({
  type: z.literal('state'),
  collapsed: z.boolean(),
  width: z.number().finite(),
});

/** Сообщение, отправляемое телом панели (iframe) содержащей обёртке. */
export const FromPanelSchema = z.discriminatedUnion('type', [
  ReadyMsg,
  CollapseMsg,
  ExpandMsg,
  CloseMsg,
  ResizeMsg,
]);
/** Сообщение, отправляемое обёрткой телу панели (iframe). */
export const ToPanelSchema = z.discriminatedUnion('type', [StateMsg]);

export type FromPanelMessage = z.infer<typeof FromPanelSchema>;
export type ToPanelMessage = z.infer<typeof ToPanelSchema>;

/** Конверт служебного сообщения панели «на проводе» (через `window.postMessage`). */
interface PanelEnvelope {
  readonly [PANEL_MARKER]: true;
  readonly nonce: string;
  readonly msg: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Собирает конверт для отправки: маркер + per-mount nonce + полезное сообщение.
 * Сериализацию (`postMessage`) делает вызывающий транспорт — слой чист от DOM.
 */
export function encodePanelMessage(nonce: string, msg: FromPanelMessage | ToPanelMessage): unknown {
  return { [PANEL_MARKER]: true, nonce, msg } satisfies PanelEnvelope;
}

/**
 * Валидирует входящий конверт и извлекает сообщение заданной схемы. Возвращает `null`
 * (сообщение игнорируется), если это не наш маркер, nonce отсутствует/не совпадает с
 * ожидаемым, либо тело не проходит схему. Никогда не бросает.
 */
export function decodePanelMessage<T>(
  raw: unknown,
  expectedNonce: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  if (!isRecord(raw) || raw[PANEL_MARKER] !== true) return null;
  if (typeof raw.nonce !== 'string' || raw.nonce !== expectedNonce) return null;
  const parsed = schema.safeParse(raw.msg);
  return parsed.success ? parsed.data : null;
}
