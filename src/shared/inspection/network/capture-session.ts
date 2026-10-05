/**
 * Разделяемая сессия перехвата сети с подсчётом потребителей (ref-count).
 *
 * ЗАЧЕМ. Логирование сети (наблюдение за всеми fetch/XHR) и мокинг (правила подмены)
 * живут в ОДНОМ MAIN-перехватчике на вкладку. Разным фичам нужна разная его половина:
 * «Мок сети» (TASK-022) ставит правила, «Экспорт бага» (TASK-025) — только лог. Раньше
 * каждая фича командовала перехватчиком напрямую (install/clear), из-за чего они друг
 * друга затирали: армирование лога сбрасывало правила мока, а выключение одной фичи
 * убивало сессию другой.
 *
 * ЧТО ДЕЛАЕТ. Единый владелец жизненного цикла MAIN-перехватчика на вкладку:
 *  - Потребители регистрируются по строковому токену (`consumer`). Перехватчик живёт,
 *    пока есть хотя бы один потребитель; снимается — когда ушёл последний.
 *  - Действующий набор правил — ОБЪЕДИНЕНИЕ вкладов всех потребителей (наблюдатель даёт
 *    пустой набор; мок — свои правила). Логирование включено всегда, мокинг — оверлей.
 *  - Ре-инъекция при навигации (MAIN-состояние не переживает смену документа) — один раз,
 *    здесь, а не в каждой фиче.
 *
 * КАК. Generic и БЕЗ `chrome.*` (ADR-0014): платформенные операции инъекции/снятия/
 * чтения и события вкладок инъектируются как зависимости — модуль юнит-тестируется без
 * Chrome. Единственный инстанс на движок создаёт владелец (фон мока), прочие фичи ходят
 * к нему через контракты сообщений (fitness §12.1: фичи не импортируют друг друга).
 */

/** Событие обновления вкладки (структурное подмножество платформенного `tabEvents`). */
export interface CaptureTabEvents {
  onUpdated: {
    addListener(cb: (tabId: number, changeInfo: { status?: string }) => void): void;
  };
  onRemoved: {
    addListener(cb: (tabId: number) => void): void;
  };
}

/** Платформенные операции над MAIN-перехватчиком (инъектируются; testable без Chrome). */
export interface CaptureSessionDeps<Rule, Entry> {
  /**
   * Инъектирует/переинъектирует перехватчик с ОБЪЕДИНЁННЫМ набором правил.
   * `immediate` — для ре-инъекции при навигации (успеть до скриптов страницы).
   */
  install(tabId: number, rules: Rule[], immediate: boolean): Promise<void>;
  /** Снимает перехватчик со вкладки. */
  clear(tabId: number): Promise<void>;
  /** Возвращает снимок лога пойманных запросов (пусто, если перехватчик не стоит). */
  read(tabId: number): Promise<Entry[]>;
  tabEvents: CaptureTabEvents;
  /** Диагностика нефатальных сбоев (по умолчанию — тихий no-op). */
  onError?: (scope: string, error: unknown) => void;
}

/** Итог регистрации потребителя: успех либо причина отказа инъекции. */
export interface AcquireResult {
  ok: boolean;
  reason?: string;
}

export interface NetworkCaptureSession<Rule, Entry> {
  /**
   * Регистрирует (или обновляет вклад) потребителя на вкладке и ставит перехватчик с
   * объединёнными правилами. Идемпотентно по паре `(consumer, tabId)`.
   */
  acquire(consumer: string, tabId: number, rules: Rule[]): Promise<AcquireResult>;
  /**
   * Снимает потребителя. Если он был последним — снимает перехватчик и забывает вкладку;
   * иначе переинъектирует с оставшимися объединёнными правилами. No-op, если не был
   * зарегистрирован.
   */
  release(consumer: string, tabId: number): Promise<void>;
  /** Снимок лога пойманных запросов вкладки (делегирует `deps.read`). */
  read(tabId: number): Promise<Entry[]>;
  /** Есть ли на вкладке хотя бы один потребитель (перехватчик стоит). */
  isActive(tabId: number): boolean;
}

/**
 * Создаёт менеджер сессии перехвата. Реестр вкладок → (потребитель → его правила)
 * живёт в замыкании (память SW); слушатели вкладок ставятся лениво один раз.
 */
export function createNetworkCaptureSession<Rule, Entry>(
  deps: CaptureSessionDeps<Rule, Entry>,
): NetworkCaptureSession<Rule, Entry> {
  /** Вкладка → (потребитель → его вклад правил). Порядок вставки = приоритет объединения. */
  const tabs = new Map<number, Map<string, Rule[]>>();
  let lifecycleInstalled = false;

  const report = (scope: string, error: unknown): void => {
    deps.onError?.(scope, error);
  };

  /** Объединённые правила всех потребителей вкладки (наблюдатель даёт пусто). */
  const mergedRules = (consumers: Map<string, Rule[]>): Rule[] => {
    const out: Rule[] = [];
    for (const rules of consumers.values()) out.push(...rules);
    return out;
  };

  /** Ленивая установка слушателей навигации/закрытия вкладок (единожды). */
  const installLifecycle = (): void => {
    if (lifecycleInstalled) return;
    lifecycleInstalled = true;

    deps.tabEvents.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status !== 'loading') return;
      const consumers = tabs.get(tabId);
      if (consumers === undefined || consumers.size === 0) return;
      // Навигация сбросила MAIN-перехватчик — ставим заново как можно раньше.
      void deps.install(tabId, mergedRules(consumers), true).catch((e: unknown) => {
        report('reinject', e);
      });
    });

    deps.tabEvents.onRemoved.addListener((tabId) => {
      tabs.delete(tabId);
    });
  };

  const acquire = async (
    consumer: string,
    tabId: number,
    rules: Rule[],
  ): Promise<AcquireResult> => {
    installLifecycle();
    const consumers = tabs.get(tabId) ?? new Map<string, Rule[]>();
    const hadConsumer = consumers.has(consumer);
    consumers.set(consumer, rules);
    tabs.set(tabId, consumers);
    try {
      await deps.install(tabId, mergedRules(consumers), false);
      return { ok: true };
    } catch (error) {
      report('acquire', error);
      // Откат ТОЛЬКО собственной регистрации (не трогаем уже стоящих потребителей):
      // если добавляли нового и вкладка осиротела — забываем её.
      if (!hadConsumer) {
        consumers.delete(consumer);
        if (consumers.size === 0) tabs.delete(tabId);
      }
      return { ok: false, reason: 'install-failed' };
    }
  };

  const release = async (consumer: string, tabId: number): Promise<void> => {
    const consumers = tabs.get(tabId);
    if (!consumers?.has(consumer)) return;
    consumers.delete(consumer);
    if (consumers.size === 0) {
      tabs.delete(tabId);
      // best-effort: вкладка могла быть уже закрыта/недоступна.
      await deps.clear(tabId).catch((e: unknown) => {
        report('release.clear', e);
      });
      return;
    }
    // Остались другие потребители — переинъектируем с их объединёнными правилами
    // (напр. наблюдатель ушёл → правила мока сохраняются; мок ушёл → остаётся чистый лог).
    await deps.install(tabId, mergedRules(consumers), false).catch((e: unknown) => {
      report('release.reinstall', e);
    });
  };

  return {
    acquire,
    release,
    read: (tabId: number) => deps.read(tabId),
    isActive: (tabId: number) => (tabs.get(tabId)?.size ?? 0) > 0,
  };
}
