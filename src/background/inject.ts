/**
 * Обобщённый менеджер инъекции content-хостов по требованию (TASK-062; вынесено из
 * `background/inspection.ts` TASK-013/ADR-0020 без смены поведения).
 *
 * Инъекция — по требованию (`chrome.scripting.executeScript({ files })`), а не статические
 * `content_scripts` (least-privilege): самодостаточный IIFE-бандл попадает в страницу только
 * когда QA осознанно запустил инструмент, и только в целевую вкладку. Модуль параметризуется
 * {@link ContentScriptSpec} (имя бандла + опциональный тип ping'а живости), поэтому его
 * переиспользуют и инспекционный слой, и откреплённая плавающая панель — классификация ошибок,
 * идемпотентность и дедлайны едины.
 */
import type { Result } from '@/shared/result';
import { ok, err } from '@/shared/result';
import type { AppError } from '@/shared/errors';
import { appError, AppErrorException } from '@/shared/errors';
import { tabsTransport } from '@/shared/messaging/transports';
import { makeEnvelope, parseEnvelope, isErrorEnvelope } from '@/shared/messaging/envelope';
import { scripting as platformScripting } from '@/platform';
import { logger } from '@/shared/logger';

/** Дедлайн пробы живости content-хоста (мс). Короткий: живой хост отвечает мгновенно. */
export const DEFAULT_PING_TIMEOUT_MS = 500;
/**
 * Дедлайн форвардинга (мс). Щедрый: долгоживущие запросы (`inspection/pick`) ждут действий
 * пользователя. Проба живости уже отсекла мёртвую вкладку — это лишь страховка от «висячей»
 * вкладки, не подвешивающая UI навсегда.
 */
export const DEFAULT_FORWARD_TIMEOUT_MS = 300_000;

/** Минимальный seam платформенной инъекции — для юнит-тестов без Chrome. */
export interface ScriptingSeam {
  executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown>;
}

export interface InjectDeps {
  scripting?: ScriptingSeam;
  /** Отправка сырого конверта в вкладку (по умолчанию — `tabsTransport`). */
  sendToTab?: (tabId: number, raw: unknown) => Promise<unknown>;
  pingTimeoutMs?: number;
  forwardTimeoutMs?: number;
}

/** Описание инъектируемого самодостаточного content-бандла. */
export interface ContentScriptSpec {
  /**
   * Имя собранного IIFE-бандла в `dist/` (совпадает с выходом `scripts/build-content.mjs`).
   * `executeScript({ files })` грузит его как классический (не-module) скрипт.
   */
  readonly file: string;
  /**
   * Тип ping-сообщения для пробы живости. Задаётся для хостов с runtime-роутером
   * (инспекция): живой хост отвечает — повторной инъекции нет. Если не задан, хост
   * идемпотентен собственным guard-флагом (`window.__qatb_*`) и всегда (ре)инъектируется —
   * повторный `executeScript` над уже смонтированным бандлом безопасен (IIFE делает no-op).
   */
  readonly pingType?: string;
}

/** Promise с дедлайном: отклоняется таймаутом, но не «течёт» (таймер снимается). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timeout'));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function defaultSendToTab(tabId: number, raw: unknown): Promise<unknown> {
  return tabsTransport(tabId).send(raw);
}

/**
 * Классифицирует ошибку инъекции в типизированный `AppError` с `messageKey` для UI.
 *
 * Порядок ветвей важен: сначала распознаём привилегированную страницу по СХЕМЕ/ТИПУ
 * (`chrome://`, магазин, error-page), и лишь затем — нехватку host-доступа. Иначе
 * характерное сообщение «Cannot access contents of the page. Extension manifest
 * must request permission to access the respective host.» ловилось бы обобщённым
 * «cannot access» и ошибочно выдавалось как «служебная страница» вместо «нет прав».
 */
export function classifyInjectionError(thrown: unknown): AppError {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  const lower = message.toLowerCase();
  // Служебные страницы браузера — недоступны по политике, никаким правом не чинятся.
  if (
    lower.includes('chrome://') ||
    lower.includes('edge://') ||
    lower.includes('chrome-extension://') ||
    lower.includes('view-source') ||
    lower.includes('extension gallery') ||
    lower.includes('web store') ||
    lower.includes('showing error page')
  ) {
    return appError('PRIVILEGED_PAGE', message, undefined, 'inspection.error.privilegedPage');
  }
  // Нет host-доступа к обычной странице (право не выдано/отозвано) — чинится грантом.
  if (
    lower.includes('cannot access contents') ||
    lower.includes('must request permission') ||
    lower.includes('respective host') ||
    lower.includes('permission') ||
    lower.includes('activetab') ||
    lower.includes('host')
  ) {
    return appError('PERMISSION_DENIED', message, undefined, 'inspection.error.permission');
  }
  return appError('INJECTION_FAILED', message, undefined, 'inspection.error.injectionFailed');
}

/** Проба живости: отправляет ping заданного типа и ждёт корректный ответ в дедлайн. */
export async function pingContent(
  tabId: number,
  type: string,
  send: (tabId: number, raw: unknown) => Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const raw = await withTimeout(
      send(tabId, makeEnvelope(type, {}, crypto.randomUUID())),
      timeoutMs,
    );
    if (isErrorEnvelope(raw)) return false;
    return parseEnvelope(raw)?.type === type;
  } catch {
    // Нет слушателя (скрипт не инъектирован) / таймаут — не живой.
    return false;
  }
}

/**
 * Гарантирует наличие content-хоста в вкладке. Идемпотентно: при заданном `spec.pingType`
 * живой хост (отвечает на ping) не переинъектируется; без ping'а хост защищён собственным
 * guard-флагом. Ошибки инъекции (нет права, привилегированная страница) — типизированный
 * `AppError` с `messageKey`, без исключений наружу.
 */
export async function ensureContentScript(
  tabId: number,
  spec: ContentScriptSpec,
  deps: InjectDeps = {},
): Promise<Result<void>> {
  const send = deps.sendToTab ?? defaultSendToTab;
  const scripting = deps.scripting ?? platformScripting;

  if (
    spec.pingType !== undefined &&
    (await pingContent(tabId, spec.pingType, send, deps.pingTimeoutMs ?? DEFAULT_PING_TIMEOUT_MS))
  ) {
    return ok(undefined);
  }

  try {
    await scripting.executeScript({ target: { tabId }, files: [spec.file] });
    return ok(undefined);
  } catch (thrown) {
    const error = classifyInjectionError(thrown);
    // Привилегированная страница (`chrome://`, Web Store) и отсутствие host-доступа
    // — ожидаемые пользовательские состояния, а не сбой расширения: логируем тихо
    // (debug, no-op в prod). Непредвиденную ошибку инъекции — как ошибку.
    if (error.code === 'INJECTION_FAILED') {
      logger.error('ensureContentScript', thrown);
    } else {
      logger.debug('ensureContentScript: handled', error.code, error.message);
    }
    return err(error);
  }
}

/**
 * Гарантирует инъекцию и пересылает валидированный запрос в целевую вкладку,
 * возвращая её ответ (payload). Ошибки — типизированный `AppErrorException`,
 * чтобы роутер донёс точный `AppError`/`messageKey` до UI.
 */
export async function forwardToContent(
  type: string,
  req: { tabId: number },
  spec: ContentScriptSpec,
  deps: InjectDeps = {},
): Promise<unknown> {
  const send = deps.sendToTab ?? defaultSendToTab;
  const ensured = await ensureContentScript(req.tabId, spec, deps);
  if (!ensured.ok) throw new AppErrorException(ensured.error);
  const raw = await withTimeout(
    send(req.tabId, makeEnvelope(type, req, crypto.randomUUID())),
    deps.forwardTimeoutMs ?? DEFAULT_FORWARD_TIMEOUT_MS,
  );
  if (isErrorEnvelope(raw)) throw new AppErrorException(raw.error);
  const parsed = parseEnvelope(raw);
  if (!parsed) throw new AppErrorException(appError('INTERNAL', 'bad content response'));
  return parsed.payload;
}
