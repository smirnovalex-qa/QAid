/**
 * UI фичи «Mock requests» (TASK-022) — поверхность side panel/popup, пересобрана под
 * v3-дизайн (handoff «Network & mocks»).
 *
 * Мастер-карточка «Intercept requests on this tab» под жестом запрашивает права
 * брокером, берёт id активной вкладки и включает перехват (`mock/apply`); при активном
 * перехвате панель опрашивает лог (`mock/poll`). Три вкладки: Requests (живой список
 * пойманных запросов — фильтр, деталь, «Mock this»/«Send again»/«Copy cURL»), Rules
 * (редактор правил + экспорт/импорт) и Scenarios (скорость сети, сценарий «один
 * активный», строгий режим CDP). Вся логика перехвата/правил/сценариев/replay
 * сохранена; презентация новая.
 *
 * Ошибки не бросаются — выводятся в `Alert role="alert"`; `busy` сбрасывается в
 * `finally`. Приватность: перехваченные данные приходят только в этот UI по опросу.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  Alert,
  Button,
  Chip,
  FeaturePanel,
  MetaTable,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  Toggle,
  useCopy,
  useToast,
} from '@/ui';
import { cn } from '@/ui/cn';
import { setToolStatus } from '@/ui/shell';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import { applyMock, clearMock, pollMock, replayRequest, statusMock } from './bridge';
import { createRule, parseRuleSet, serializeRuleSet } from './rules';
import { buildRequestSpecFromCaught, toCurl } from './logic';
import {
  createScenario,
  normalizeActiveScenarioId,
  pruneRuleFromScenarios,
  resolveActiveRules,
} from './scenarios';
import { mockNetworkBinding } from './settings';
import { DEFAULT_ACTION } from './types';
import type {
  CaughtRequest,
  HttpMethod,
  MockNetworkSettingsState,
  MockRule,
  MockScenario,
} from './types';
import styles from './mock-network.module.css';

/** Права мока: `scripting` (MAIN-инъекция перехватчика) + постоянный host-доступ. */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

const POLL_INTERVAL_MS = 1000;
const MAX_ENTRIES = 300;

/** Зарезервированное правило «Network speed» (глобальный троттлинг в ручном режиме). */
const SPEED_RULE_ID = 'qatb-reserved-network-speed';
/** Префикс описания зарезервированных «готовых» сценариев дизайна (см. Scenarios). */
const RESERVED_SCEN_PREFIX = 'qatb-canned:';

type NetSpeed = 'normal' | 'slow' | 'offline';
type CannedKind = 'err500' | 'empty' | 'slow' | 'auth';

/** Опции метода редактора правила (ANY = любой метод). */
const METHOD_OPTIONS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const STATUS_CHOICES = [200, 201, 404, 500, 503] as const;

/** Черновик редактора правила (плоская форма для v3-карточки). */
interface RuleDraft {
  id: string | null;
  method: string;
  url: string;
  status: number;
  body: string;
  delay: string;
  once: boolean;
}

/** 2xx/3xx — успешный ответ (зелёная пилюля); иначе — опасная (красная). */
function isOkStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

export function MockNetworkPanel(): JSX.Element {
  const settings = useSettings(mockNetworkBinding);
  const ready = settings.ready.value;
  const { show } = useToast();
  const { copy } = useCopy();

  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState<MockRule[]>([]);
  const [scenarios, setScenarios] = useState<MockScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [strategy, setStrategy] = useState<'main' | 'cdp'>('main');
  const [seeded, setSeeded] = useState(false);

  const [tab, setTab] = useState<'requests' | 'rules' | 'scenarios'>('requests');
  const [entries, setEntries] = useState<CaughtRequest[]>([]);
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [reqFilter, setReqFilter] = useState<'all' | 'err' | 'mock'>('all');
  const [editor, setEditor] = useState<RuleDraft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reconciled, setReconciled] = useState(false);

  const tabIdRef = useRef<number | null>(null);

  // Засев из сохранённых настроек единожды. `enabled` в НАСТРОЙКАХ не хранится (дал бы
  // «фантомно-включённую» панель без привязки к реально стоящему перехватчику), поэтому
  // здесь он не восстанавливается — живую активность доносит сверка с фоном ниже.
  useEffect(() => {
    if (!ready || seeded) return;
    const s = mockNetworkBinding.value.value;
    setRules(s.rules);
    setScenarios(s.scenarios);
    setActiveScenarioId(normalizeActiveScenarioId(s.scenarios, s.activeScenarioId));
    setFilter(s.filter);
    setStrategy(s.strategy);
    setSeeded(true);
  }, [ready, seeded]);

  // Сверка с фоном при маунте (источник истины о реальной активности). Инъектированный
  // перехватчик живёт в СТРАНИЦЕ и переживает закрытие popup/side panel — фон его
  // переинъектирует при навигации. Без этой сверки переоткрытая панель показывала бы
  // «выключено», пока сайт продолжает получать моки, и пользователь не понимал бы, почему
  // страница сломана. Спрашиваем фон про активную вкладку и восстанавливаем живое
  // состояние (`enabled`/`tabIdRef`/`strategy`), чтобы UI не расходился с реальностью.
  useEffect(() => {
    if (!ready || reconciled) return;
    let cancelled = false;
    void tabs.queryActive().then((tabId) => {
      if (cancelled) return;
      if (tabId === undefined) {
        setReconciled(true);
        return;
      }
      void statusMock(tabId).then((st) => {
        if (cancelled) return;
        if (st.active) {
          tabIdRef.current = tabId;
          setStrategy(st.strategy);
          setEnabled(true);
        }
        setReconciled(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, reconciled]);

  // Опрос лога, пока перехват активен.
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = async (): Promise<void> => {
      const tabId = tabIdRef.current;
      if (tabId === null) return;
      const { entries: caught, active } = await pollMock(tabId);
      if (stopped) return;
      setEntries((prev) => mergeEntries(prev, caught));
      if (strategy === 'cdp' && !active) {
        stopped = true;
        tabIdRef.current = null;
        setEnabled(false);
        show(t('feature.mock.cdp.detached'), { severity: 'info' });
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, strategy]);

  // id правил, принадлежащих служебным сущностям (speed-правило + готовые сценарии) —
  // они управляются своими контролами и не показываются в списке «Rules».
  const reservedRuleIds = useMemo(() => {
    const set = new Set<string>([SPEED_RULE_ID]);
    for (const s of scenarios) {
      if (s.description.startsWith(RESERVED_SCEN_PREFIX)) for (const id of s.ruleIds) set.add(id);
    }
    return set;
  }, [scenarios]);

  const activeRules = resolveActiveRules(rules, scenarios, activeScenarioId);
  const nOn = activeRules.filter((r) => r.id !== SPEED_RULE_ID).length;
  const visibleRules = rules.filter((r) => !reservedRuleIds.has(r.id));

  const speed: NetSpeed = useMemo(() => {
    const r = rules.find((x) => x.id === SPEED_RULE_ID);
    if (!r?.enabled) return 'normal';
    if (r.action.offline) return 'offline';
    return r.action.throttleKbps !== null ? 'slow' : 'normal';
  }, [rules]);

  // Зеркалим активность в оболочку (список «Активно на этой вкладке» + пилюля). Запись
  // в модульный signal откладываем микротаском: синхронная запись внутри фазы коммита/
  // обработчика события реентрантно дренит общую очередь ре-рендеров preact.
  useEffect(() => {
    const next = enabled
      ? {
          live: false,
          text:
            t('feature.mock.status.rules', { n: nOn }) +
            (speed === 'normal' ? '' : ` · ${speedLabel(speed)}`),
        }
      : null;
    queueMicrotask(() => {
      setToolStatus('mock-network', next);
    });
  }, [enabled, nOn, speed]);
  useEffect(
    () => () => {
      queueMicrotask(() => {
        setToolStatus('mock-network', null);
      });
    },
    [],
  );

  const persist = (patch: Partial<MockNetworkSettingsState>): void => {
    void mockNetworkBinding.update(patch);
  };

  /** Ре-применяет действующий набор правил в активный перехватчик без смены `enabled`. */
  const resyncActive = (
    nextRules: MockRule[],
    nextScenarios: MockScenario[],
    nextActiveId: string | null,
  ): void => {
    const tabId = tabIdRef.current;
    if (!enabled || tabId === null) return;
    const active = resolveActiveRules(nextRules, nextScenarios, nextActiveId);
    void applyMock(tabId, active, strategy).catch((e: unknown) => {
      logger.debug('mock.resync', e);
    });
  };

  const setRulesPersist = (next: MockRule[]): void => {
    setRules(next);
    persist({ rules: next });
    resyncActive(next, scenarios, activeScenarioId);
  };

  const setActiveScenario = (id: string | null): void => {
    const normalized = normalizeActiveScenarioId(scenarios, id);
    setActiveScenarioId(normalized);
    persist({ activeScenarioId: normalized });
    resyncActive(rules, scenarios, normalized);
  };

  async function enableMain(tabId: number): Promise<boolean> {
    const granted = await getBroker().ensure(REQUIRED);
    if (!granted) {
      setError(t('feature.mock.error.permission'));
      return false;
    }
    const active = resolveActiveRules(rules, scenarios, activeScenarioId);
    const res = await applyMock(tabId, active, 'main');
    if (!res.ok) {
      setError(t('feature.mock.error.apply'));
      return false;
    }
    tabIdRef.current = tabId;
    setEnabled(true);
    show(t('feature.mock.enabled'), { severity: 'success' });
    return true;
  }

  async function enableInterception(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const tabId = await tabs.queryActive();
      if (tabId === undefined) {
        setError(t('feature.mock.error.noTab'));
        return;
      }
      if (strategy === 'cdp') {
        const active = resolveActiveRules(rules, scenarios, activeScenarioId);
        const res = await applyMock(tabId, active, 'cdp');
        if (!res.ok) {
          show(t('feature.mock.cdp.fallback'), { severity: 'info' });
          setStrategy('main');
          persist({ strategy: 'main' });
          await enableMain(tabId);
          return;
        }
        tabIdRef.current = tabId;
        setEnabled(true);
        show(t('feature.mock.cdp.enabled'), { severity: 'success' });
        return;
      }
      await enableMain(tabId);
    } catch (e) {
      logger.error('mock.enable', e);
      setError(t('feature.mock.error.apply'));
    } finally {
      setBusy(false);
    }
  }

  /** Переключает транспорт (main↔cdp). Выключен — фиксируем выбор; активен — переустанавливаем. */
  async function switchStrategy(next: 'main' | 'cdp'): Promise<void> {
    if (next === strategy || busy) return;
    const tabId = tabIdRef.current;
    if (!enabled || tabId === null) {
      setStrategy(next);
      persist({ strategy: next });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const activeNow = resolveActiveRules(rules, scenarios, activeScenarioId);
      if (next === 'main') {
        const granted = await getBroker().ensure(REQUIRED);
        if (!granted) {
          setError(t('feature.mock.error.permission'));
          return;
        }
        await clearMock(tabId);
        setEntries([]);
        setOpenKey(null);
        const res = await applyMock(tabId, activeNow, 'main');
        if (!res.ok) {
          setError(t('feature.mock.error.apply'));
          setEnabled(false);
          tabIdRef.current = null;
          return;
        }
        setStrategy('main');
        persist({ strategy: 'main' });
        show(t('feature.mock.enabled'), { severity: 'success' });
        return;
      }
      await clearMock(tabId);
      setEntries([]);
      setOpenKey(null);
      const res = await applyMock(tabId, activeNow, 'cdp');
      if (!res.ok) {
        show(t('feature.mock.cdp.fallback'), { severity: 'info' });
        const back = await applyMock(tabId, activeNow, 'main');
        if (!back.ok) {
          setError(t('feature.mock.error.apply'));
          setEnabled(false);
          tabIdRef.current = null;
        }
        return;
      }
      setStrategy('cdp');
      persist({ strategy: 'cdp' });
      show(t('feature.mock.cdp.enabled'), { severity: 'success' });
    } catch (e) {
      logger.error('mock.switch', e);
      setError(t('feature.mock.error.apply'));
    } finally {
      setBusy(false);
    }
  }

  async function disableInterception(): Promise<void> {
    setBusy(true);
    try {
      const tabId = tabIdRef.current;
      if (tabId !== null) await clearMock(tabId);
    } catch (e) {
      logger.debug('mock.disable', e);
    } finally {
      setEnabled(false);
      setBusy(false);
    }
  }

  // — Rules —
  const openEditor = (draft: RuleDraft): void => {
    setEditor(draft);
    setTab('rules');
  };

  const newRule = (): void => {
    openEditor({
      id: null,
      method: 'ANY',
      url: '',
      status: 200,
      body: '{}',
      delay: '0',
      once: false,
    });
  };

  const editRule = (rule: MockRule): void => {
    openEditor({
      id: rule.id,
      method: rule.matcher.methods[0] ?? 'ANY',
      url: rule.matcher.pattern,
      status: rule.action.status ?? 200,
      body: rule.action.body,
      delay: String(rule.action.delayMs),
      once: rule.once !== null,
    });
  };

  const mockFromRequest = (req: CaughtRequest): void => {
    const base = req.url.split('?')[0] ?? req.url;
    const method = req.method.toUpperCase();
    openEditor({
      id: null,
      method: (METHOD_OPTIONS as readonly string[]).includes(method) ? method : 'ANY',
      url: `*${base}*`,
      status: req.status >= 400 ? 200 : 500,
      body: '{}',
      delay: '0',
      once: false,
    });
  };

  const saveRule = (): void => {
    if (editor === null) return;
    const methods: HttpMethod[] = editor.method === 'ANY' ? [] : [editor.method as HttpMethod];
    const delayMs = Math.max(0, Number(editor.delay) || 0);
    const once = editor.once ? 1 : null;
    const existing = editor.id !== null ? rules.find((r) => r.id === editor.id) : undefined;
    let next: MockRule[];
    if (existing) {
      const updated: MockRule = {
        ...existing,
        matcher: { ...existing.matcher, methods, pattern: editor.url },
        action: {
          ...existing.action,
          status: editor.status,
          body: editor.body,
          bodyMode: existing.action.bodyMode === 'passthrough' ? 'json' : existing.action.bodyMode,
          delayMs,
        },
        once,
      };
      next = rules.map((r) => (r.id === existing.id ? updated : r));
    } else {
      const created = createRule({
        label: editor.url,
        matcher: { methods, pattern: editor.url || '*', patternKind: 'glob', headerPredicates: [] },
        action: {
          ...DEFAULT_ACTION,
          headers: [],
          status: editor.status,
          body: editor.body,
          bodyMode: 'json',
          delayMs,
        },
        once,
      });
      next = [created, ...rules];
    }
    setRulesPersist(next);
    setEditor(null);
    show(t('feature.mock.ruleCreated'), { severity: 'success' });
  };

  const toggleRule = (rule: MockRule): void => {
    setRulesPersist(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
  };

  const removeRule = (id: string): void => {
    const nextRules = rules.filter((r) => r.id !== id);
    const nextScenarios = pruneRuleFromScenarios(scenarios, id);
    setRules(nextRules);
    setScenarios(nextScenarios);
    persist({ rules: nextRules, scenarios: nextScenarios });
    resyncActive(nextRules, nextScenarios, activeScenarioId);
    setEditor(null);
  };

  const deleteCurrentRule = (): void => {
    if (editor?.id != null) removeRule(editor.id);
  };

  const exportRules = (): void => {
    void copy(serializeRuleSet(visibleRules));
    show(t('feature.mock.exported'), { severity: 'success' });
  };

  const importParsed = importOpen ? parseRuleSet(importText) : null;

  const doImport = (): void => {
    const parsed = parseRuleSet(importText);
    if (!parsed.ok) {
      setError(t('feature.mock.error.import'));
      return;
    }
    setRulesPersist([...rules, ...parsed.rules]);
    setImportText('');
    setImportOpen(false);
    show(t('feature.mock.imported'), { severity: 'success' });
  };

  // — Requests —
  const q = filter.trim().toLowerCase();
  const reqRows = entries
    .filter(
      (e) =>
        (q === '' || e.url.toLowerCase().includes(q)) &&
        (reqFilter === 'all' ||
          (reqFilter === 'err' && e.status >= 400) ||
          (reqFilter === 'mock' && e.mocked)),
    )
    .slice()
    .reverse();
  const errCount = entries.filter((e) => e.status >= 400).length;
  const mockCount = entries.filter((e) => e.mocked).length;

  const sendAgain = (req: CaughtRequest): void => {
    void (async () => {
      const granted = await getBroker().ensure(REQUIRED);
      if (!granted) {
        show(t('feature.mock.replay.err.permission'), { severity: 'danger' });
        return;
      }
      const res = await replayRequest(buildRequestSpecFromCaught(req));
      if (res.ok) {
        show(t('feature.mock.req.sent', { status: res.response.status }), { severity: 'success' });
      } else {
        show(t(`feature.mock.replay.err.${res.error.kind}`), { severity: 'danger' });
      }
    })();
  };

  const copyCurl = (req: CaughtRequest): void => {
    void copy(toCurl(buildRequestSpecFromCaught(req)));
    show(t('feature.mock.replay.curlCopied'), { severity: 'success' });
  };

  // — Scenarios: network speed (reserved rule) —
  const setSpeed = (next: string): void => {
    const others = rules.filter((r) => r.id !== SPEED_RULE_ID);
    if (next === 'normal') {
      setRulesPersist(others);
      return;
    }
    const base = createRule({
      label: 'network-speed',
      matcher: { methods: [], pattern: '*', patternKind: 'glob', headerPredicates: [] },
      action: {
        ...DEFAULT_ACTION,
        headers: [],
        status: null,
        statusText: '',
        bodyMode: 'passthrough',
        body: '',
        delayMs: next === 'slow' ? 200 : 0,
        throttleKbps: next === 'slow' ? 400 : null,
        offline: next === 'offline',
      },
    });
    const reserved: MockRule = { ...base, id: SPEED_RULE_ID, enabled: true };
    setRulesPersist([reserved, ...others]);
  };

  // — Scenarios: canned scenario selection (one active at a time) —
  const buildCanned = (kind: CannedKind): { rules: MockRule[]; scenario: MockScenario } => {
    let rule: MockRule;
    switch (kind) {
      case 'err500':
        rule = createRule({
          label: 'canned-500',
          matcher: { methods: [], pattern: '*/api/*', patternKind: 'glob', headerPredicates: [] },
          action: {
            ...DEFAULT_ACTION,
            headers: [],
            status: 500,
            statusText: 'Internal Server Error',
            body: '{"error":"Internal Server Error"}',
            bodyMode: 'json',
          },
        });
        break;
      case 'empty':
        rule = createRule({
          label: 'canned-empty',
          matcher: {
            methods: ['GET'],
            pattern: '*/api/*',
            patternKind: 'glob',
            headerPredicates: [],
          },
          action: { ...DEFAULT_ACTION, headers: [], status: 200, body: '[]', bodyMode: 'json' },
        });
        break;
      case 'slow':
        rule = createRule({
          label: 'canned-slow',
          matcher: { methods: [], pattern: '*/api/*', patternKind: 'glob', headerPredicates: [] },
          action: {
            ...DEFAULT_ACTION,
            headers: [],
            status: null,
            bodyMode: 'passthrough',
            body: '',
            delayMs: 3000,
          },
        });
        break;
      case 'auth':
      default:
        rule = createRule({
          label: 'canned-401',
          matcher: { methods: [], pattern: '*/api/*', patternKind: 'glob', headerPredicates: [] },
          action: {
            ...DEFAULT_ACTION,
            headers: [],
            status: 401,
            statusText: 'Unauthorized',
            body: '{"error":"Unauthorized"}',
            bodyMode: 'json',
          },
        });
        break;
    }
    // Готовое правило кладётся в `rules` ВЫКЛЮЧЕННЫМ: активным его делает ТОЛЬКО членство
    // в своём сценарии (резолвер игнорирует per-rule `enabled` для членов, scenarios.ts).
    // Будь оно `enabled:true`, выбор «Без сценария» (activeId=null → «только включённые
    // правила») снова поднял бы это скрытое правило — и сценарий продолжал бы исполняться
    // вопреки выключению. `enabled:false` гарантирует, что «Без сценария» действительно гасит.
    const reserved: MockRule = { ...rule, enabled: false };
    const scenario = createScenario({
      label: kind,
      description: RESERVED_SCEN_PREFIX + kind,
      ruleIds: [reserved.id],
    });
    return { rules: [reserved], scenario };
  };

  const selectCanned = (kind: CannedKind): void => {
    const existing = scenarios.find((s) => s.description === RESERVED_SCEN_PREFIX + kind);
    if (existing) {
      setActiveScenario(existing.id);
      return;
    }
    const built = buildCanned(kind);
    const nextRules = [...rules, ...built.rules];
    const nextScenarios = [...scenarios, built.scenario];
    setRules(nextRules);
    setScenarios(nextScenarios);
    setActiveScenarioId(built.scenario.id);
    persist({ rules: nextRules, scenarios: nextScenarios, activeScenarioId: built.scenario.id });
    resyncActive(nextRules, nextScenarios, built.scenario.id);
  };

  const scenOpts: { value: string; label: string; help: string }[] = [
    { value: 'none', label: t('feature.mock.scen.none'), help: t('feature.mock.scen.none.help') },
    {
      value: 'err500',
      label: t('feature.mock.scen.err500'),
      help: t('feature.mock.scen.err500.help'),
    },
    {
      value: 'empty',
      label: t('feature.mock.scen.empty'),
      help: t('feature.mock.scen.empty.help'),
    },
    { value: 'slow', label: t('feature.mock.scen.slow'), help: t('feature.mock.scen.slow.help') },
    { value: 'auth', label: t('feature.mock.scen.auth'), help: t('feature.mock.scen.auth.help') },
    ...scenarios
      .filter((s) => !s.description.startsWith(RESERVED_SCEN_PREFIX))
      .map((s) => ({
        value: `user:${s.id}`,
        label: s.label || s.id,
        help: t('feature.mock.status.rules', { n: s.ruleIds.length }),
      })),
  ];

  const currentScen: string = (() => {
    if (activeScenarioId === null) return 'none';
    const s = scenarios.find((x) => x.id === activeScenarioId);
    if (!s) return 'none';
    if (s.description.startsWith(RESERVED_SCEN_PREFIX))
      return s.description.slice(RESERVED_SCEN_PREFIX.length);
    return `user:${s.id}`;
  })();

  const selectScen = (value: string): void => {
    if (value === 'none') {
      setActiveScenario(null);
      return;
    }
    if (value.startsWith('user:')) {
      setActiveScenario(value.slice(5));
      return;
    }
    selectCanned(value as CannedKind);
  };

  if (!ready) {
    return (
      <FeaturePanel bare>
        <p class={styles.muted}>{t('feature.mock.loading')}</p>
      </FeaturePanel>
    );
  }

  const masterSub = enabled
    ? t('feature.mock.master.on', { n: nOn, m: entries.length })
    : t('feature.mock.master.off');

  return (
    <FeaturePanel bare>
      <div class={styles.panel} data-testid="mock-network">
        {error !== '' ? <Alert tone="danger">{error}</Alert> : null}

        <Toggle
          variant="card"
          label={t('feature.mock.intercept')}
          help={masterSub}
          checked={enabled}
          disabled={busy}
          onChange={() => void (enabled ? disableInterception() : enableInterception())}
        />

        <Tabs
          tabs={[
            {
              id: 'requests',
              label: `${t('feature.mock.tab.requests')} ${String(entries.length)}`,
            },
            { id: 'rules', label: `${t('feature.mock.tab.rules')} ${String(visibleRules.length)}` },
            { id: 'scenarios', label: t('feature.mock.tab.scenarios') },
          ]}
          activeId={tab}
          onChange={(id) => {
            setTab(id as 'requests' | 'rules' | 'scenarios');
          }}
        >
          {tab === 'requests' ? (
            <div class={styles.reqSection}>
              <input
                class={styles.filterInput}
                value={filter}
                placeholder={t('feature.mock.filter')}
                aria-label={t('feature.mock.filter')}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setFilter(v);
                  persist({ filter: v });
                }}
              />
              <div class={styles.chipRow}>
                <Chip
                  pressed={reqFilter === 'all'}
                  onClick={() => {
                    setReqFilter('all');
                  }}
                >
                  {t('feature.mock.filterAll')}
                </Chip>
                <Chip
                  pressed={reqFilter === 'err'}
                  count={errCount}
                  onClick={() => {
                    setReqFilter('err');
                  }}
                >
                  {t('feature.mock.filterErrors')}
                </Chip>
                <Chip
                  pressed={reqFilter === 'mock'}
                  count={mockCount}
                  onClick={() => {
                    setReqFilter('mock');
                  }}
                >
                  {t('feature.mock.filterMocked')}
                </Chip>
              </div>
              <div class={styles.listCard}>
                {reqRows.length === 0 ? (
                  <p class={styles.empty}>
                    {enabled ? t('feature.mock.req.empty.on') : t('feature.mock.req.empty.off')}
                  </p>
                ) : (
                  reqRows.map((req) => {
                    const open = openKey === req.id;
                    const ok = isOkStatus(req.status);
                    return (
                      <div key={req.id} class={styles.reqItem}>
                        <button
                          type="button"
                          class={styles.reqRow}
                          aria-expanded={open}
                          onClick={() => {
                            setOpenKey(open ? null : req.id);
                          }}
                        >
                          <span class={styles.reqMethod}>{req.method.toUpperCase()}</span>
                          <span class={styles.reqMain}>
                            <span class={styles.reqPath}>{req.url}</span>
                            <span class={styles.reqMeta}>
                              {req.sizeBytes} B · {req.durationMs} ms · {req.source}
                            </span>
                          </span>
                          {req.mocked ? (
                            <span class={styles.mockedTag}>{t('feature.mock.mockedTag')}</span>
                          ) : null}
                          <span class={cn(styles.pill, ok ? styles.pillOk : styles.pillBad)}>
                            {req.status || 'ERR'}
                          </span>
                        </button>
                        {open ? (
                          <div class={styles.reqDetail}>
                            <MetaTable
                              caption={t('feature.mock.detail')}
                              rows={[
                                { k: 'METHOD', v: req.method.toUpperCase() },
                                { k: 'URL', v: req.url },
                                { k: 'STATUS', v: String(req.status) },
                                { k: 'SOURCE', v: req.source },
                                { k: 'SIZE', v: `${String(req.sizeBytes)} B` },
                                { k: 'TIME', v: `${String(req.durationMs)} ms` },
                                ...(req.error ? [{ k: 'ERROR', v: req.error }] : []),
                              ]}
                            />
                            <div class={styles.detailActions}>
                              <Button
                                size="sm"
                                onClick={() => {
                                  mockFromRequest(req);
                                }}
                              >
                                {t('feature.mock.req.mockThis')}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  sendAgain(req);
                                }}
                              >
                                {t('feature.mock.req.sendAgain')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  copyCurl(req);
                                }}
                              >
                                {t('feature.mock.req.copyCurl')}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : tab === 'rules' ? (
            <div class={styles.rulesSection}>
              {editor === null ? (
                <button type="button" class={styles.newRule} onClick={newRule}>
                  + {t('feature.mock.newRule')}
                </button>
              ) : (
                <div class={styles.editorCard}>
                  <span class={styles.editorLabel}>{t('feature.mock.whenReq')}</span>
                  <div class={styles.methodRow}>
                    <Select
                      class={styles.methodSelect}
                      value={editor.method}
                      aria-label={t('feature.mock.rule.method')}
                      options={METHOD_OPTIONS.map((m) => ({ value: m, label: m }))}
                      onChange={(e) => {
                        setEditor({ ...editor, method: e.currentTarget.value });
                      }}
                    />
                    <input
                      class={cn(styles.urlInput, styles.textInput)}
                      value={editor.url}
                      placeholder="*/api/orders*"
                      aria-label={t('feature.mock.urlPattern')}
                      onInput={(e) => {
                        setEditor({ ...editor, url: e.currentTarget.value });
                      }}
                    />
                  </div>
                  <span class={styles.editorLabel}>{t('feature.mock.respond')}</span>
                  <div class={styles.chipRow}>
                    {STATUS_CHOICES.map((s) => (
                      <Chip
                        key={s}
                        check={false}
                        pressed={editor.status === s}
                        onClick={() => {
                          setEditor({ ...editor, status: s });
                        }}
                      >
                        {s}
                      </Chip>
                    ))}
                  </div>
                  <label class={styles.field}>
                    <span class={styles.fieldLabel}>{t('feature.mock.rule.body')}</span>
                    <textarea
                      class={styles.textarea}
                      spellcheck={false}
                      value={editor.body}
                      onInput={(e) => {
                        setEditor({ ...editor, body: e.currentTarget.value });
                      }}
                    />
                  </label>
                  <div class={styles.grid2}>
                    <label class={styles.field}>
                      <span class={styles.fieldLabel}>{t('feature.mock.rule.delay')}</span>
                      <input
                        class={styles.textInput}
                        inputMode="numeric"
                        value={editor.delay}
                        onInput={(e) => {
                          setEditor({ ...editor, delay: e.currentTarget.value });
                        }}
                      />
                    </label>
                    <div class={styles.onceField}>
                      <span class={styles.onceLabel}>{t('feature.mock.rule.once')}</span>
                      <Switch
                        checked={editor.once}
                        aria-label={t('feature.mock.rule.once')}
                        onChange={(next) => {
                          setEditor({ ...editor, once: next });
                        }}
                      />
                    </div>
                  </div>
                  <div class={styles.editorActions}>
                    <Button block onClick={saveRule}>
                      {t('feature.mock.saveRule')}
                    </Button>
                    {editor.id !== null ? (
                      <Button variant="danger" size="md" onClick={deleteCurrentRule}>
                        {t('feature.mock.delete')}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        setEditor(null);
                      }}
                    >
                      {t('feature.mock.cancel')}
                    </Button>
                  </div>
                  <span class={styles.failOpen}>{t('feature.mock.failOpen')}</span>
                </div>
              )}

              <div class={styles.listCard}>
                {visibleRules.map((rule) => (
                  <div key={rule.id} class={styles.ruleRow}>
                    <Switch
                      checked={rule.enabled}
                      aria-label={rule.matcher.pattern || t('feature.mock.unnamed')}
                      onChange={() => {
                        toggleRule(rule);
                      }}
                    />
                    <span class={styles.ruleMain}>
                      <span class={styles.ruleLabel}>
                        {(rule.matcher.methods.join(',') || 'ANY') + ' ' + rule.matcher.pattern}
                      </span>
                      <span class={styles.ruleMeta}>{ruleMeta(rule)}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        editRule(rule);
                      }}
                    >
                      {t('feature.mock.edit')}
                    </Button>
                  </div>
                ))}
              </div>

              <div class={styles.ioRow}>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={visibleRules.length === 0}
                  onClick={exportRules}
                >
                  {t('feature.mock.exportRules')}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setImportOpen((v) => !v);
                  }}
                >
                  {t('feature.mock.importRules')}
                </Button>
              </div>

              {importOpen ? (
                <div class={styles.importPanel}>
                  <textarea
                    class={styles.textarea}
                    spellcheck={false}
                    value={importText}
                    placeholder={t('feature.mock.import.placeholder')}
                    aria-label={t('feature.mock.importRules')}
                    onInput={(e) => {
                      setImportText(e.currentTarget.value);
                    }}
                  />
                  {importText.trim() !== '' ? (
                    <span class={styles.importFound}>
                      {importParsed?.ok === true
                        ? t('feature.mock.import.found', { n: importParsed.rules.length })
                        : t('feature.mock.error.import')}
                    </span>
                  ) : null}
                  <Button size="md" disabled={importParsed?.ok !== true} onClick={doImport}>
                    {t('feature.mock.import.do')}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div class={styles.scenSection}>
              <div class={styles.secGroup}>
                <span class={styles.secLabel}>{t('feature.mock.speed')}</span>
                <SegmentedControl
                  label={t('feature.mock.speed')}
                  value={speed}
                  options={[
                    { value: 'normal', label: t('feature.mock.speed.normal') },
                    { value: 'slow', label: t('feature.mock.speed.slow') },
                    { value: 'offline', label: t('feature.mock.speed.offline') },
                  ]}
                  onChange={setSpeed}
                />
              </div>

              <div class={styles.secGroup}>
                <span class={styles.secLabel}>{t('feature.mock.scenario.title')}</span>
                <div
                  role="radiogroup"
                  aria-label={t('feature.mock.scenario.title')}
                  class={styles.scenGroup}
                  onKeyDown={(e: KeyboardEvent) => {
                    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
                    if (!keys.includes(e.key)) return;
                    e.preventDefault();
                    const i = scenOpts.findIndex((o) => o.value === currentScen);
                    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
                    const ni = (i + (fwd ? 1 : -1) + scenOpts.length) % scenOpts.length;
                    const nextOpt = scenOpts[ni];
                    if (nextOpt) selectScen(nextOpt.value);
                  }}
                >
                  {scenOpts.map((o) => {
                    const on = currentScen === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={on ? 0 : -1}
                        class={cn(styles.scenCard, on && styles.scenCardOn)}
                        onClick={() => {
                          selectScen(o.value);
                        }}
                      >
                        <span
                          class={cn(styles.scenRadio, on && styles.scenRadioOn)}
                          aria-hidden="true"
                        />
                        <span class={styles.scenMain}>
                          <span class={styles.scenLabel}>{o.label}</span>
                          <span class={styles.scenHelp}>{o.help}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div class={styles.strictCard}>
                <Toggle
                  variant="plain"
                  label={t('feature.mock.strict')}
                  help={t('feature.mock.strict.help')}
                  checked={strategy === 'cdp'}
                  disabled={busy}
                  onChange={(next) => void switchStrategy(next ? 'cdp' : 'main')}
                />
              </div>
              {strategy === 'cdp' ? <Alert tone="warn">{t('feature.mock.cdpNote')}</Alert> : null}
            </div>
          )}
        </Tabs>
      </div>
    </FeaturePanel>
  );
}

/** Строка-сводка правила: «Respond 500 · 1200 ms delay · once». */
function ruleMeta(rule: MockRule): string {
  const status = rule.action.status ?? 200;
  let meta = `${t('feature.mock.rule.respond')} ${String(status)}`;
  if (rule.action.delayMs > 0)
    meta += ` · ${String(rule.action.delayMs)} ${t('feature.mock.rule.msDelay')}`;
  if (rule.once !== null) meta += ` · ${t('feature.mock.rule.onceTag')}`;
  return meta;
}

/** Человекочитаемая метка скорости сети (для статуса оболочки). */
function speedLabel(speed: NetSpeed): string {
  if (speed === 'slow') return t('feature.mock.speed.slow');
  if (speed === 'offline') return t('feature.mock.speed.offline');
  return t('feature.mock.speed.normal');
}

/** Сливает новый снимок лога с накопленным (по id), с кэпом на размер. */
function mergeEntries(prev: CaughtRequest[], caught: CaughtRequest[]): CaughtRequest[] {
  if (caught.length === 0) return prev;
  const seen = new Set(prev.map((e) => e.id));
  const merged = [...prev];
  for (const e of caught) {
    if (!seen.has(e.id)) merged.push(e);
  }
  return merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged;
}
