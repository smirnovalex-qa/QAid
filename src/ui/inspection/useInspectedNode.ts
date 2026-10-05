/**
 * `useInspectedNode` (TASK-052) — единый носитель общего потока осмотра узла, ранее
 * скопированного по каждой `inspector-*` фиче: ленивый брокер прав + `ensure` под
 * жестом, `tabs.queryActive`, `inspection/pick`, `inspection/navigate`, авто-`collect`
 * сборщика фичи после каждого шага, токен сессии против гонок, `busy`/`error`,
 * коалесинг быстрых шагов (зажатая стрелка) и `Esc`/«Отмена» с best-effort `teardown`.
 *
 * Инвариант границ сред (ADR-0049): навигация — команда над якорем. Хук не держит
 * DOM-узлы, только сериализуемое {@link NavigationState}; host двигает `lastPicked` и
 * возвращает снимок. Клавиатура (`↑/↓/←/→`, `Esc`) активна, пока идёт сессия осмотра.
 *
 * Слой UI: `chrome.*` не трогает (только платформенный шов `@/platform` + шина сообщений).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import type { NavigationState, NavigationStep } from '@/shared/inspection/types';

/**
 * Права инспектора: `scripting` (инъекция по требованию) + постоянный host-доступ ко
 * всем http/https-страницам (ADR-0022 — панель обязана переживать смену вкладки). Оба
 * запрашиваются одним `permissions.request` под жестом.
 */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/**
 * Брокер прав создаётся лениво при первом жесте (не на импорте): его конструктор вешает
 * слушатели `permissions.onAdded/onRemoved`, которых нет в тестовой среде.
 */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Переопределяемые ключи локализации ошибок общего потока. */
type ErrorKey = 'permissionDenied' | 'noTab' | 'generic';

export interface UseInspectedNodeOptions<T> {
  /**
   * Если задан — после `pick` и после каждого шага навигации хук сам запускает
   * `inspection/collect` этого сборщика на новом якоре и кладёт результат в `data`.
   * Не задан (напр. `probe`) — только навигация, без сбора.
   */
  inspectorId?: string;
  /**
   * (Де)сериализация/валидация результата сборщика (данные пересекают границу как
   * `unknown`). `null` из `parse` — «данные невалидны», `data` не обновляется.
   */
  parse?: (data: unknown) => T | null;
  /** Переопределение ключей локализации ошибок (по умолчанию — `inspection.error.*`). */
  errorKeys?: Partial<Record<ErrorKey, string>>;
  /**
   * Живой режим осмотра курсором (TASK-056): `pick` вооружает персистентную сессию и
   * пере-вооружает `inspection/pickLive` после каждого клика, а не делает одноразовый
   * `inspection/pick`. Между кликами хук интерактивен (стрелки/breadcrumb работают).
   */
  live?: boolean;
}

export interface UseInspectedNodeResult<T> {
  /** Идёт запрос (pick/navigate/collect) — гейт против повторного запуска. */
  busy: boolean;
  /** Ключ локализации текущей ошибки (уже готов к `t(...)`) или `''`. */
  error: string;
  /** Состояние навигации активного якоря или `null` (сессии нет). */
  state: NavigationState | null;
  /** Последний результат сборщика фичи (если `inspectorId` задан) или `null`. */
  data: T | null;
  /** Активен ли живой режим (сессия ждёт очередной клик по странице). */
  live: boolean;
  /** Запустить выбор элемента (под жестом): права → вкладка → `pick` → (collect). */
  pick: () => void;
  /** Сделать шаг навигации по текущему якорю (коалесит быстрые повторы). */
  navigate: (step: NavigationStep, depth?: number) => void;
  /**
   * Остановить живой режим, СОХРАНИВ последний узел/состояние (`Esc` в live / выкл.
   * тумблера): best-effort `inspection/pickLiveStop`, выход из pick-цикла, `live=false`.
   * Не чистит state/data и НЕ забывает вкладку — стрелки/breadcrumb работают дальше.
   */
  stopLive: () => void;
  /**
   * Обратная подсветка (TASK-056): шлёт `inspection/highlight` с текущей вкладкой и
   * селектором (best-effort, no-op без активной вкладки). Держит шину сообщений вне
   * UI-фичи — компонент только вызывает колбэк.
   */
  highlightTarget: (selector: string) => void;
  /** Завершить сессию: снять оверлей/пикер (best-effort `teardown`), очистить путь. */
  cancel: () => void;
  /** Полный сброс: как `cancel` + очистка `data`/`error`. */
  reset: () => void;
}

export function useInspectedNode<T = unknown>(
  options: UseInspectedNodeOptions<T> = {},
): UseInspectedNodeResult<T> {
  const { inspectorId, parse, errorKeys } = options;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<NavigationState | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [live, setLive] = useState(false);

  // Токен сессии осмотра: инкремент инвалидирует устаревшие ответы (гонки/отмена).
  const sessionRef = useRef(0);
  // Вкладка активной сессии — держится до отмены/сброса (не как одноразовый pick).
  const tabRef = useRef<number | null>(null);
  // Single-flight навигации + коалесинг последнего шага (зажатая стрелка).
  const navBusyRef = useRef(false);
  const queuedRef = useRef<{ step: NavigationStep; depth: number | undefined } | null>(null);

  const errKey = (name: ErrorKey): string => errorKeys?.[name] ?? `inspection.error.${name}`;

  /** Прогоняет сборщик фичи на текущем якоре и кладёт результат в `data`. */
  const collectInto = async (tabId: number, session: number): Promise<void> => {
    if (inspectorId === undefined) return;
    const res = await sendMessage('inspection/collect', { tabId, inspectorId });
    if (sessionRef.current !== session) return;
    if (!res.ok) {
      setError(res.error.messageKey ?? errKey('generic'));
      return;
    }
    const parsed = parse ? parse(res.value.data) : (res.value.data as T);
    if (parsed !== null && parsed !== undefined) setData(parsed);
  };

  const doPick = async (): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setState(null);
    setData(null);
    setBusy(true);
    tabRef.current = null;
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(errKey('permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(errKey('noTab'));
        return;
      }

      const res = await sendMessage('inspection/pick', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(res.error.messageKey ?? errKey('generic'));
        return;
      }
      if (res.value === null) return; // отмена по Esc — молча

      tabRef.current = tabId;
      // `navigation` по контракту всегда присутствует, но осознанно защищаемся от его
      // отсутствия (устойчивость к неполным ответам) — отсюда явный `| undefined`.
      const nav = res.value.navigation as NavigationState | undefined;
      setState(nav ?? null);
      await collectInto(tabId, session);
    } catch (e) {
      logger.error('useInspectedNode.pick', e);
      if (isCurrent()) setError(errKey('generic'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /**
   * Живой pick-цикл (TASK-056): под жестом вооружает персистентную сессию и повторно
   * ждёт `inspection/pickLive`, обновляя якорь/сбор после каждого клика по странице.
   * Между кликами `busy=false` — стрелки/breadcrumb работают. `null` от `pickLive` —
   * выход из режима (последний узел сохраняется). Токен сессии инвалидирует устаревшие
   * ответы; `stopLive`/`cancel` бампят его, чтобы цикл вышел после текущего запроса.
   */
  const doPickLive = async (): Promise<void> => {
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setState(null);
    setData(null);
    setBusy(true);
    setLive(true);
    tabRef.current = null;
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(errKey('permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(errKey('noTab'));
        return;
      }
      tabRef.current = tabId;
      setBusy(false); // интерактив между кликами (стрелки/breadcrumb доступны в ожидании)

      while (isCurrent()) {
        const res = await sendMessage('inspection/pickLive', { tabId });
        if (!isCurrent()) return;
        if (!res.ok) {
          setError(res.error.messageKey ?? errKey('generic'));
          break;
        }
        if (res.value === null) break; // вышли из live — сохраняем последний узел
        // `navigation` по контракту всегда присутствует, но осознанно защищаемся от его
        // отсутствия (устойчивость к неполным ответам) — отсюда явный `| undefined`.
        const nav = res.value.navigation as NavigationState | undefined;
        setState(nav ?? null);
        await collectInto(tabId, session);
        if (!isCurrent()) return;
      }
    } catch (e) {
      logger.error('useInspectedNode.pickLive', e);
      if (isCurrent()) setError(errKey('generic'));
    } finally {
      if (isCurrent()) {
        setLive(false);
        setBusy(false);
      }
    }
  };

  /**
   * Остановить живой режим, СОХРАНИВ узел/состояние: бампит сессию (цикл выйдет, как
   * только текущий `pickLive` резолвится), гасит `live`/`busy` и шлёт best-effort
   * `inspection/pickLiveStop`. Вкладку не забываем — степпер/стрелки работают дальше.
   */
  const stopLive = (): void => {
    const tabId = tabRef.current;
    sessionRef.current += 1; // инвалидируем цикл → он выйдет после awaited pickLive
    setLive(false);
    setBusy(false);
    if (tabId !== null) {
      void sendMessage('inspection/pickLiveStop', { tabId }).catch(() => undefined);
    }
  };

  /** Обратная подсветка узла по селектору в текущей вкладке (best-effort). */
  const highlightTarget = (selector: string): void => {
    const tabId = tabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector }).catch(() => undefined);
  };

  const runNavigate = async (step: NavigationStep, depth?: number): Promise<void> => {
    const tabId = tabRef.current;
    if (tabId === null) return;
    const session = sessionRef.current; // навигация не бампит сессию — идём внутри неё
    navBusyRef.current = true;
    setBusy(true);
    try {
      const res = await sendMessage('inspection/navigate', { tabId, step, depth });
      if (sessionRef.current !== session) return;
      if (!res.ok) {
        setError(res.error.messageKey ?? errKey('generic'));
        return;
      }
      if (res.value === null) return; // якоря нет — сессия завершена/сброшена
      setState(res.value);
      await collectInto(tabId, session);
    } catch (e) {
      logger.error('useInspectedNode.navigate', e);
      if (sessionRef.current === session) setError(errKey('generic'));
    } finally {
      navBusyRef.current = false;
      // Коалесинг: если во время запроса пришёл ещё шаг — исполняем ТОЛЬКО последний,
      // чтобы зажатая стрелка не копила RPC и итог соответствовал последнему нажатию.
      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued !== null && sessionRef.current === session && tabRef.current !== null) {
        void runNavigate(queued.step, queued.depth);
      } else if (sessionRef.current === session) {
        setBusy(false);
      }
    }
  };

  const navigate = (step: NavigationStep, depth?: number): void => {
    if (tabRef.current === null) return; // нет активной сессии осмотра
    if (navBusyRef.current) {
      queuedRef.current = { step, depth }; // коалесим до завершения текущего шага
      return;
    }
    void runNavigate(step, depth);
  };

  const cancel = (): void => {
    const tabId = tabRef.current;
    sessionRef.current += 1;
    tabRef.current = null;
    queuedRef.current = null;
    navBusyRef.current = false;
    setBusy(false);
    setLive(false);
    setState(null);
    if (tabId !== null) {
      // Полное закрытие: останавливаем возможную live-сессию контента и снимаем оверлей.
      void sendMessage('inspection/pickLiveStop', { tabId }).catch(() => undefined);
      void sendMessage('inspection/teardown', { tabId }).catch(() => undefined);
    }
  };

  const reset = (): void => {
    cancel();
    setData(null);
    setError('');
  };

  // Клавиатура активна, пока идёт сессия осмотра. Слушатель — на документе панели;
  // обёрнут через ref-и, чтобы не пересоздаваться на каждый шаг. Ввод в полях не крадём.
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const stopLiveRef = useRef(stopLive);
  stopLiveRef.current = stopLive;
  const liveRef = useRef(live);
  liveRef.current = live;
  // Живой режим ждёт клика ещё до первого узла — клавиатура нужна и тогда (Esc гасит live).
  const active = live || state !== null;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          navRef.current('parent');
          break;
        case 'ArrowDown':
          event.preventDefault();
          navRef.current('firstChild');
          break;
        case 'ArrowLeft':
          event.preventDefault();
          navRef.current('previousSibling');
          break;
        case 'ArrowRight':
          event.preventDefault();
          navRef.current('nextSibling');
          break;
        case 'Escape':
          event.preventDefault();
          // В live: Esc лишь выходит из режима, СОХРАНЯЯ узел; иначе — полное закрытие.
          if (liveRef.current) stopLiveRef.current();
          else cancelRef.current();
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return {
    busy,
    error,
    state,
    data,
    live,
    pick: () => {
      if (options.live) void doPickLive();
      else void doPick();
    },
    navigate,
    stopLive,
    highlightTarget,
    cancel,
    reset,
  };
}
