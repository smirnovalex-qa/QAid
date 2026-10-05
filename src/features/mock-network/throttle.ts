/**
 * Троттлинг/офлайн мока сети (TASK-023) — чистая логика расчёта задержки от размера
 * тела. Без DOM/chrome/zod: тестируется на числах. Троттлинг — это action движка
 * правил (TASK-022), а не отдельный перехватчик; MAIN-перехватчик применяет ту же
 * формулу инлайново (осознанное дублирование под контракт самодостаточности, ADR-0028).
 *
 * Модель канала: `throttleKbps` — «скорость» в килобитах в секунду. Время передачи
 * `sizeBytes` байт: `bits / (kbps · 1000)` секунд ⇒ в миллисекундах ровно
 * `sizeBytes · 8 / kbps`. Итоговая задержка = фиксированная `delayMs` + транспортная.
 */

/** Параметры расчёта задержки (совпадают с полями скомпилированного действия). */
export interface ThrottleParams {
  /** Фиксированная задержка, мс (>=0). */
  delayMs: number;
  /** Ограничение канала в кбит/с (null — без ограничения). */
  throttleKbps: number | null;
}

/**
 * Транспортная задержка передачи `sizeBytes` при канале `throttleKbps` (кбит/с), мс.
 * null/≤0 канал → 0. Округление вверх: даже крошечное тело на медленном канале даёт
 * заметную, а не нулевую задержку.
 */
export function transferDelayMs(sizeBytes: number, throttleKbps: number | null): number {
  if (throttleKbps === null || throttleKbps <= 0 || sizeBytes <= 0) return 0;
  return Math.ceil((sizeBytes * 8) / throttleKbps);
}

/** Полная задержка ответа: фиксированная + транспортная (по размеру тела). */
export function computeThrottleDelay(sizeBytes: number, params: ThrottleParams): number {
  const base = params.delayMs > 0 ? Math.floor(params.delayMs) : 0;
  return base + transferDelayMs(sizeBytes, params.throttleKbps);
}

/** Пресет-профиль канала: человекочитаемая метка + скорость (кбит/с). */
export interface ThrottleProfile {
  id: string;
  /** i18n-ключ метки (резолвится в UI, чтобы логика не тянула каталог). */
  labelKey: string;
  /** null — «офлайн» (не скорость, а режим обрыва сети). */
  kbps: number | null;
  offline: boolean;
}

/**
 * Профили канала (грубо соответствуют DevTools-пресетам). `custom`/точная настройка
 * — через поле правила; здесь — быстрые заготовки для UI.
 */
export const THROTTLE_PROFILES: readonly ThrottleProfile[] = [
  { id: 'gprs', labelKey: 'feature.mock.throttle.gprs', kbps: 50, offline: false },
  { id: 'slow-3g', labelKey: 'feature.mock.throttle.slow3g', kbps: 400, offline: false },
  { id: 'fast-3g', labelKey: 'feature.mock.throttle.fast3g', kbps: 1600, offline: false },
  { id: 'offline', labelKey: 'feature.mock.throttle.offline', kbps: null, offline: true },
];
