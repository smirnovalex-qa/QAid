/**
 * UI фичи «Cookies & storage» (TASK-017 + TASK-031), поверхность side panel.
 * Редизайн v3: строка сайта (зелёная точка · mono-хост ·
 * «current tab»), горизонтально прокручиваемые табы со счётчиками, фильтр + «+ Add»,
 * список-карточка с разворачиваемыми строками (mono-ключ · превью · флаг-теги),
 * грид «Save/Load snapshot» с диф-превью импорта и двухшаговая очистка всех данных
 * сайта. Тело рендерится внутри оболочки tool-view — без собственного хедера.
 *
 * Функциональность сохранена целиком: права (`scripting`/`cookies`), content-RPC,
 * экспорт/импорт снимка с диф-превью, подтверждаемые разрушительные действия, токен
 * сессии против устаревших ответов, scope-селекторы IndexedDB (DB/STORE) и Cache.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Alert, Button, Chip, Field, Input, SegmentedControl, copyText, useToast } from '@/ui';
import { cn } from '@/ui/cn';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import {
  diffSnapshot,
  parseSnapshot,
  serializeSnapshot,
  tryPrettyJson,
  validateCookieAttrs,
} from '@/shared/inspection/storage/logic';
import type { SnapshotDiff } from '@/shared/inspection/storage/logic';
import {
  SAME_SITE_VALUES,
  type CookieRecord,
  type SameSite,
  type StorageEntry,
  type StorageSnapshot,
  type StorageTab,
  type WebStorageArea,
} from '@/shared/inspection/storage/types';
import {
  parseEditValue,
  serializeSnapshot as serializeIdbSnapshot,
} from '@/shared/inspection/idb/logic';
import type { IdbDatabaseSummary, IdbRecord, IdbSnapshot } from '@/shared/inspection/idb/types';
import { serializeSnapshot as serializeCacheSnapshot } from '@/shared/inspection/cache/logic';
import type { CacheEntry, CacheSnapshot, CacheSummary } from '@/shared/inspection/cache/types';
import { storageEditorBinding, type EditorTab } from './settings';
import styles from './storage-editor.module.css';

/** Права для web storage: `scripting` + постоянный host-доступ ко всем http/https. */
const STORAGE_PERMS: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };
/** Права для cookies: то же + `cookies` (запрашивается при открытии cookies-таба). */
const COOKIE_PERMS: PermissionRequest = { optional: ['scripting', 'cookies'], host: ['*://*/*'] };

let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Подтверждаемое разрушительное действие (немодальный confirm). */
type Pending =
  | { kind: 'import'; snapshot: StorageSnapshot }
  | { kind: 'confirm'; text: string; run: () => void }
  | null;

const asArea = (tab: EditorTab): WebStorageArea => (tab === 'session' ? 'session' : 'local');

/** Классические web-вкладки TASK-017 (cookies/local/session) против новых TASK-031. */
function isWebTab(tab: EditorTab): tab is StorageTab {
  return tab === 'cookies' || tab === 'local' || tab === 'session';
}

/** Локализованный список причин невалидности cookie. */
function reasonsText(codes: readonly string[]): string {
  return codes.map((c) => t(`storage.reason.${c}`)).join(', ');
}

/** Хост из origin (http/https) для строки сайта; пусто → без строки. */
function hostOf(origin: string): string {
  if (origin === '') return '';
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

// ── визуальные примитивы редизайна ────────────────────────────────────────────

type ValueType = 'json' | 'number' | 'bool' | 'string';

/** Эвристический тип значения web-storage (для бейджа/подсветки). */
function valueType(v: string): ValueType {
  const s = v.trim();
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      JSON.parse(s);
      return 'json';
    } catch {
      /* не JSON — падаем к следующим проверкам */
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
  if (s === 'true' || s === 'false') return 'bool';
  return 'string';
}

const TYPE_BADGE: Record<ValueType, string | undefined> = {
  string: styles.badgeString,
  json: styles.badgeJson,
  number: styles.badgeNumber,
  bool: styles.badgeBool,
};

/** HTTP-статус → тон бейджа. */
function statusTone(status: number): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 0 || status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 200 && status < 300) return 'success';
  return 'neutral';
}

const STATUS_BADGE: Record<'success' | 'danger' | 'warning' | 'neutral', string | undefined> = {
  success: styles.badgeSuccess,
  danger: styles.badgeDanger,
  warning: styles.badgeWarning,
  neutral: styles.badgeNeutral,
};

function fmtSize(n: number): string {
  return n < 1024 ? `${String(n)} B` : `${(n / 1024).toFixed(1)} KB`;
}

const SearchIcon = (): JSX.Element => (
  <svg
    class={styles.searchIcon}
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke-linecap="round" />
  </svg>
);

interface CardShellProps {
  open: boolean;
  onToggle: () => void;
  badgeLabel?: string;
  badgeClass?: string | undefined;
  keyText: string;
  preview: string;
  size?: string;
  /** Флаг-теги справа в строке (HttpOnly, Secure, content-type…). */
  flags?: string[];
  children?: ComponentChildren;
}

/** Строка списка: голова (бейдж·ключ·превью·флаги·шеврон) + editor при раскрытии. */
function CardShell(props: CardShellProps): JSX.Element {
  return (
    <div class={cn(styles.card, props.open && styles.cardOpen)}>
      <button
        type="button"
        class={styles.cardHead}
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        {props.badgeLabel !== undefined ? (
          <span class={cn(styles.badge, props.badgeClass)}>{props.badgeLabel}</span>
        ) : null}
        <span class={styles.cardMain}>
          <span class={styles.cardKey} title={props.keyText}>
            {props.keyText}
          </span>
          <span class={styles.cardPreview}>{props.preview}</span>
        </span>
        {props.flags && props.flags.length > 0 ? (
          <span class={styles.flags}>
            {props.flags.map((f) => (
              <span key={f} class={styles.flag}>
                {f}
              </span>
            ))}
          </span>
        ) : null}
        {props.size !== undefined && props.size !== '' ? (
          <span class={styles.cardSize}>{props.size}</span>
        ) : null}
        <span class={styles.chev} aria-hidden="true">
          {props.open ? '▾' : '▸'}
        </span>
      </button>
      {props.open ? <div class={styles.editor}>{props.children}</div> : null}
    </div>
  );
}

interface EmptyStateProps {
  text: string;
}

function EmptyState(props: EmptyStateProps): JSX.Element {
  return (
    <div class={styles.empty}>
      <div class={styles.emptyGlyph} aria-hidden="true">
        {'{ }'}
      </div>
      <div class={styles.emptyText}>{props.text}</div>
    </div>
  );
}

interface ScopeBoxProps {
  rows: {
    label: string;
    pills: { id: string; label: string; active: boolean; onClick: () => void }[];
  }[];
}

/** Scope-селектор (IndexedDB DB/STORE, Cache buckets) — surface2-бокс с рядами пилюль. */
function ScopeBox(props: ScopeBoxProps): JSX.Element {
  return (
    <div class={styles.scopeBox}>
      {props.rows.map((row) => (
        <div key={row.label} class={styles.scopeRow}>
          <span class={styles.scopeLabel}>{row.label}</span>
          <div class={cn(styles.scopeScroll, 'qatb-scroll')}>
            {row.pills.map((p) => (
              <button
                key={p.id}
                type="button"
                class={cn(styles.pill, p.active && styles.pillActive)}
                onClick={p.onClick}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StorageEditorPanel(): JSX.Element {
  const settings = useSettings(storageEditorBinding);
  const ready = settings.ready.value;

  const [tab, setTab] = useState<EditorTab>(storageEditorBinding.value.value.tab);
  const [seeded, setSeeded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [query, setQuery] = useState('');

  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [origin, setOrigin] = useState('');
  const [cookies, setCookies] = useState<CookieRecord[]>([]);
  const [domain, setDomain] = useState('');
  const [host, setHost] = useState('');
  const [cookiesDenied, setCookiesDenied] = useState(false);
  const [loadedTab, setLoadedTab] = useState<EditorTab | null>(null);

  // Редизайн: раскрытая карточка, форма добавления, счётчики типов-табов.
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [draftVal, setDraftVal] = useState('');
  const [counts, setCounts] = useState<Partial<Record<EditorTab, number>>>({});

  // Снимки: раскрытие импорта + двухшаговая очистка всех данных сайта.
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importDiff, setImportDiff] = useState<SnapshotDiff | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const { show } = useToast();

  const sessionRef = useRef(0);
  const aliveRef = useRef<boolean>(true);

  useEffect(() => {
    if (!ready || seeded) return;
    setTab(storageEditorBinding.value.value.tab);
    setSeeded(true);
  }, [ready, seeded]);

  // Лучшая попытка узнать хост активной вкладки для строки сайта (до загрузки данных).
  useEffect(() => {
    void (async () => {
      try {
        const tabId = await tabs.queryActive();
        if (tabId === undefined) return;
        const url = await tabs.getUrl(tabId);
        if (!aliveRef.current || url === undefined) return;
        setHost(hostOf(url));
      } catch {
        /* нет права host — строка сайта появится после первой загрузки */
      }
    })();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Счётчики web-вкладок держим синхронными с данными (загрузка, add/remove).
  useEffect(() => {
    if (loadedTab === 'local' || loadedTab === 'session') {
      setCounts((c) => ({ ...c, [loadedTab]: entries.length }));
    }
  }, [entries, loadedTab]);
  useEffect(() => {
    if (loadedTab === 'cookies') setCounts((c) => ({ ...c, cookies: cookies.length }));
  }, [cookies, loadedTab]);

  // Хост берём из загруженных данных (origin для storage, domain для cookies).
  useEffect(() => {
    const h = hostOf(origin);
    if (h !== '') setHost(h);
  }, [origin]);
  useEffect(() => {
    if (domain !== '') setHost((prev) => (prev === '' ? domain : prev));
  }, [domain]);

  /** Общий враппер: токен сессии, сброс ошибки, `busy` со сбросом в `finally`. */
  const run = async (fn: (isCurrent: () => boolean) => Promise<void>): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;
    setError('');
    setBusy(true);
    try {
      await fn(isCurrent);
    } catch (e) {
      logger.error('storage-editor', e);
      if (isCurrent()) setError(t('storage.error.generic'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /** Гарантирует права и возвращает id активной вкладки (или null при отказе/ошибке). */
  const ensureTab = async (
    request: PermissionRequest,
    isCurrent: () => boolean,
  ): Promise<number | null> => {
    const granted = await getBroker().ensure(request);
    if (!isCurrent()) return null;
    if (!granted) {
      setError(t('storage.error.permissionDenied'));
      return null;
    }
    const tabId = await tabs.queryActive();
    if (!isCurrent()) return null;
    if (tabId === undefined) {
      setError(t('storage.error.noTab'));
      return null;
    }
    return tabId;
  };

  const loadStorage = (area: WebStorageArea): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('storage/list', { tabId, area });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(res.error.messageKey ? t(res.error.messageKey) : t('storage.error.generic'));
        return;
      }
      setEntries(res.value.items);
      setOrigin(res.value.origin);
      setLoadedTab(area === 'session' ? 'session' : 'local');
    });

  const loadCookies = (): Promise<void> =>
    run(async (isCurrent) => {
      const granted = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      if (!granted) {
        setCookiesDenied(true);
        return;
      }
      setCookiesDenied(false);
      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('storage.error.noTab'));
        return;
      }
      const res = await sendMessage('cookies/list', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(res.error.messageKey ? t(res.error.messageKey) : t('storage.error.generic'));
        return;
      }
      setCookies(res.value.cookies);
      setDomain(res.value.domain);
      setLoadedTab('cookies');
    });

  const load = (which: EditorTab): Promise<void> => {
    if (which === 'cookies') return loadCookies();
    if (which === 'local' || which === 'session') return loadStorage(asArea(which));
    return Promise.resolve();
  };

  const onTabChange = (next: string): void => {
    const nextTab = next as EditorTab;
    setTab(nextTab);
    setQuery('');
    setError('');
    setReport('');
    setPending(null);
    setOpenId(null);
    setAdding(false);
    setClearArmed(false);
    void storageEditorBinding.update({ tab: nextTab });
    void load(nextTab);
  };

  // ── web storage операции ───────────────────────────────────────────────────

  const saveEntry = (key: string, value: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('storage/set', { tabId, area: asArea(tab), key, value });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(t('storage.error.generic'));
        return;
      }
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.key === key);
        if (idx === -1) return [...prev, { key, value }];
        const next = prev.slice();
        next[idx] = { key, value };
        return next;
      });
      setReport(t('storage.report.saved'));
    });

  const removeEntry = (key: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('storage/remove', { tabId, area: asArea(tab), key });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(t('storage.error.generic'));
        return;
      }
      setEntries((prev) => prev.filter((e) => e.key !== key));
      setReport(t('storage.report.removed'));
    });

  // ── cookies операции ───────────────────────────────────────────────────────

  const saveCookie = (cookie: CookieRecord): Promise<void> =>
    run(async (isCurrent) => {
      const check = validateCookieAttrs(cookie);
      if (!check.valid) {
        setError(t('storage.error.invalidCookie', { reasons: reasonsText(check.errors) }));
        return;
      }
      const granted = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      if (!granted) {
        setCookiesDenied(true);
        return;
      }
      const tabId = await tabs.queryActive();
      if (!isCurrent() || tabId === undefined) return;
      const res = await sendMessage('cookies/set', { tabId, cookie });
      if (!isCurrent()) return;
      if (!res.ok || !res.value.ok) {
        setError(t('storage.error.generic'));
        return;
      }
      setCookies((prev) => {
        const idx = prev.findIndex(
          (c) => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path,
        );
        if (idx === -1) return [...prev, cookie];
        const next = prev.slice();
        next[idx] = cookie;
        return next;
      });
      setReport(t('storage.report.saved'));
    });

  const removeCookie = (cookie: CookieRecord): Promise<void> =>
    run(async (isCurrent) => {
      const granted = await getBroker().ensure(COOKIE_PERMS);
      if (!isCurrent()) return;
      if (!granted) {
        setCookiesDenied(true);
        return;
      }
      const tabId = await tabs.queryActive();
      if (!isCurrent() || tabId === undefined) return;
      const res = await sendMessage('cookies/remove', {
        tabId,
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
      });
      if (!isCurrent()) return;
      if (!res.ok || !res.value.ok) {
        setError(t('storage.error.generic'));
        return;
      }
      setCookies((prev) =>
        prev.filter(
          (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path),
        ),
      );
      setReport(t('storage.report.removed'));
    });

  // ── снимок: сбор, экспорт, импорт ──────────────────────────────────────────

  const collectSnapshot = async (tabId: number, withCookies: boolean): Promise<StorageSnapshot> => {
    const localRes = await sendMessage('storage/list', { tabId, area: 'local' });
    const sessionRes = await sendMessage('storage/list', { tabId, area: 'session' });
    let cookieList: CookieRecord[] = [];
    if (withCookies) {
      const cookieRes = await sendMessage('cookies/list', { tabId });
      if (cookieRes.ok) cookieList = cookieRes.value.cookies;
    }
    return {
      cookies: cookieList,
      local: localRes.ok ? localRes.value.items : [],
      session: sessionRes.ok ? sessionRes.value.items : [],
    };
  };

  const onExport = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = !cookiesDenied && (await getBroker().has(COOKIE_PERMS));
      if (!isCurrent()) return;
      const snapshot = await collectSnapshot(tabId, withCookies);
      if (!isCurrent()) return;
      const okFlag = await copyText(serializeSnapshot(snapshot));
      if (isCurrent() && okFlag) show(t('toast.copied'), { severity: 'success' });
    });

  const onPreviewImport = (): Promise<void> =>
    run(async (isCurrent) => {
      const parsed = parseSnapshot(importText);
      if (!parsed.ok) {
        setError(t('storage.importInvalid'));
        setImportDiff(null);
        return;
      }
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const withCookies = !cookiesDenied && (await getBroker().has(COOKIE_PERMS));
      if (!isCurrent()) return;
      const current = await collectSnapshot(tabId, withCookies);
      if (!isCurrent()) return;
      setImportDiff(diffSnapshot(current, parsed.value));
      setPending({ kind: 'import', snapshot: parsed.value });
    });

  const applyImport = (snapshot: StorageSnapshot): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      let count = 0;
      for (const e of snapshot.local) {
        const res = await sendMessage('storage/set', {
          tabId,
          area: 'local',
          key: e.key,
          value: e.value,
        });
        if (res.ok) count += 1;
      }
      for (const e of snapshot.session) {
        const res = await sendMessage('storage/set', {
          tabId,
          area: 'session',
          key: e.key,
          value: e.value,
        });
        if (res.ok) count += 1;
      }
      const canCookies = !cookiesDenied && (await getBroker().has(COOKIE_PERMS));
      if (canCookies) {
        for (const c of snapshot.cookies) {
          if (!validateCookieAttrs(c).valid) continue;
          const res = await sendMessage('cookies/set', { tabId, cookie: c });
          if (res.ok && res.value.ok) count += 1;
        }
      }
      if (!isCurrent()) return;
      setImportDiff(null);
      setImportText('');
      setShowImport(false);
      setReport(t('storage.report.imported', { count }));
      await load(tab);
    });

  /** Двухшаговая «очистка всех данных сайта» (local + session + cookies). */
  const wipeSite = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      let count = 0;
      for (const area of ['local', 'session'] as const) {
        const res = await sendMessage('storage/clear', { tabId, area });
        if (res.ok) count += res.value.removed;
      }
      const canCookies = !cookiesDenied && (await getBroker().has(COOKIE_PERMS));
      if (canCookies) {
        const res = await sendMessage('cookies/clear', { tabId });
        if (res.ok) count += res.value.removed;
      }
      if (!isCurrent()) return;
      setEntries([]);
      setCookies([]);
      setReport(t('storage.report.wiped', { count }));
      show(t('storage.wipeToast', { count }), { severity: 'success' });
    });

  // ── подтверждение разрушительных действий (idb/cache + импорт) ──────────────

  const confirmPending = (): void => {
    const p = pending;
    setPending(null);
    if (p === null) return;
    if (p.kind === 'confirm') p.run();
    else void applyImport(p.snapshot);
  };

  const confirmText = (): string => {
    if (pending === null) return '';
    if (pending.kind === 'confirm') return pending.text;
    return t('storage.confirmImport');
  };

  const requestConfirm = (text: string, action: () => void): void => {
    setPending({ kind: 'confirm', text, run: action });
  };

  const setTabCount = (which: EditorTab, n: number): void => {
    setCounts((c) => ({ ...c, [which]: n }));
  };

  // ── фильтрация web-данных ──────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === ''
      ? entries
      : entries.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [entries, query]);

  const filteredCookies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === ''
      ? cookies
      : cookies.filter(
          (c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q),
        );
  }, [cookies, query]);

  const toggleOpen = (id: string): void => {
    setOpenId((cur) => (cur === id ? null : id));
    setAdding(false);
  };

  const submitAdd = (): void => {
    const key = draftKey.trim();
    if (key === '') return;
    if (tab === 'cookies') {
      void saveCookie({
        name: key,
        value: draftVal,
        domain,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax',
      });
    } else {
      void saveEntry(key, draftVal);
    }
    setAdding(false);
    setDraftKey('');
    setDraftVal('');
  };

  const TYPE_TABS: { id: EditorTab; label: string }[] = [
    { id: 'cookies', label: t('storage.tab.cookies') },
    { id: 'local', label: t('storage.tab.local') },
    { id: 'session', label: t('storage.tab.session') },
    { id: 'indexeddb', label: t('storage.tab.indexeddb') },
    { id: 'cache', label: t('storage.tab.cache') },
  ];

  // ── web-представление (cookies/local/session) ──────────────────────────────
  const renderWeb = (): JSX.Element => {
    const isCookies = tab === 'cookies';
    const loaded = loadedTab === tab;
    const list = isCookies ? filteredCookies : filteredEntries;

    return (
      <>
        <div class={styles.filterRow}>
          <div class={styles.searchBox}>
            <SearchIcon />
            <input
              class={styles.filterInput}
              placeholder={isCookies ? t('storage.searchCookie') : t('storage.search')}
              aria-label={isCookies ? t('storage.searchCookie') : t('storage.search')}
              value={query}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
              }}
            />
          </div>
          <Button
            size="md"
            onClick={() => {
              setAdding((a) => !a);
              setOpenId(null);
              setDraftKey('');
              setDraftVal('');
            }}
          >
            + {t('storage.add')}
          </Button>
        </div>

        {isCookies ? <p class={styles.note}>{t('storage.httpOnlyNote')}</p> : null}

        {adding ? (
          <div class={styles.addForm}>
            <Field label={isCookies ? t('storage.newKey.cookie') : t('storage.newKey')}>
              {(control) => (
                <Input
                  {...control}
                  class={styles.input}
                  placeholder={
                    isCookies ? t('storage.keyPlaceholder.cookie') : t('storage.keyPlaceholder')
                  }
                  value={draftKey}
                  onInput={(e) => {
                    setDraftKey(e.currentTarget.value);
                  }}
                />
              )}
            </Field>
            <label class={styles.label} for="storage-add-value">
              {t('storage.value')}
            </label>
            <textarea
              id="storage-add-value"
              class={styles.area}
              placeholder={t('storage.valuePlaceholder')}
              value={draftVal}
              onInput={(e) => {
                setDraftVal(e.currentTarget.value);
              }}
            />
            <div class={styles.formActions}>
              <Button size="md" block disabled={busy || draftKey.trim() === ''} onClick={submitAdd}>
                {t('storage.add')}
              </Button>
              <Button
                size="md"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                }}
              >
                {t('storage.cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        <div
          class={styles.cardList}
          data-testid={isCookies ? 'storage-cookies' : 'storage-entries'}
        >
          {!loaded ? (
            <EmptyState text={t('storage.empty')} />
          ) : list.length === 0 ? (
            <EmptyState
              text={query.trim() !== '' ? t('storage.emptyFilter') : t('storage.emptyAdd')}
            />
          ) : isCookies ? (
            filteredCookies.map((c) => {
              const id = `${c.name} ${c.domain} ${c.path}`;
              return (
                <CookieCard
                  key={id}
                  cookie={c}
                  open={openId === id}
                  busy={busy}
                  onToggle={() => {
                    toggleOpen(id);
                  }}
                  onSave={(next) => {
                    void saveCookie(next);
                  }}
                  onRemove={() => {
                    void removeCookie(c);
                  }}
                  onCopy={() => {
                    void copyText(c.value).then((ok) => {
                      if (ok) show(t('toast.copied'), { severity: 'success' });
                    });
                  }}
                />
              );
            })
          ) : (
            filteredEntries.map((e) => (
              <StorageEntryCard
                key={e.key}
                entry={e}
                open={openId === e.key}
                busy={busy}
                onToggle={() => {
                  toggleOpen(e.key);
                }}
                onSave={(value) => {
                  void saveEntry(e.key, value);
                }}
                onRemove={() => {
                  void removeEntry(e.key);
                }}
                onCopy={() => {
                  void copyText(e.value).then((ok) => {
                    if (ok) show(t('toast.copied'), { severity: 'success' });
                  });
                }}
              />
            ))
          )}
        </div>

        <div class={styles.snapGrid}>
          <Button
            size="md"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void onExport();
            }}
          >
            {t('storage.snapshotSave')}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={() => {
              setShowImport((v) => !v);
            }}
          >
            {t('storage.snapshotLoad')}
          </Button>
        </div>

        {showImport ? (
          <div class={styles.importBox}>
            <label class={styles.importLabel} for="storage-import-text">
              {t('storage.import')}
            </label>
            <textarea
              id="storage-import-text"
              class={styles.area}
              placeholder={t('storage.importPlaceholder')}
              value={importText}
              onInput={(e) => {
                setImportText(e.currentTarget.value);
              }}
              data-testid="storage-import-text"
            />
            <Button
              size="md"
              variant="secondary"
              disabled={busy || importText.trim() === ''}
              onClick={() => {
                void onPreviewImport();
              }}
            >
              {t('storage.importPreview')}
            </Button>
            {importDiff !== null ? (
              <p class={styles.diff} data-testid="storage-import-diff">
                {t('storage.diff', {
                  added: importDiff.total.added,
                  changed: importDiff.total.changed,
                  removed: importDiff.total.removed,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <Button
          block
          size="md"
          variant={clearArmed ? 'danger' : 'secondary'}
          disabled={busy}
          onClick={() => {
            if (clearArmed) {
              setClearArmed(false);
              void wipeSite();
            } else {
              setClearArmed(true);
            }
          }}
        >
          {clearArmed ? t('storage.clearAllConfirm') : t('storage.clearAll')}
        </Button>
        {clearArmed ? <p class={styles.clearWarn}>{t('storage.clearWarn')}</p> : null}
      </>
    );
  };

  return (
    <div class={styles.panel} data-testid="storage-editor">
      <div class={styles.topRow}>
        {host !== '' ? (
          <span class={styles.siteLine}>
            <span class={styles.siteDot} aria-hidden="true" />
            <span class={styles.siteHost}>{host}</span>
            <span class={styles.siteTab}>{t('storage.currentTab')}</span>
          </span>
        ) : (
          <span class={styles.siteLine} />
        )}
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={busy}
          onClick={() => {
            if (isWebTab(tab)) void load(tab);
            else setReloadNonce((n) => n + 1);
          }}
        >
          {loadedTab === tab ? t('storage.reload') : t('storage.load')}
        </Button>
      </div>

      <div
        class={cn(styles.typeRow, 'qatb-scroll')}
        role="tablist"
        aria-label={t('feature.storageEditor.title')}
      >
        {TYPE_TABS.map((tt) => {
          const active = tab === tt.id;
          const count = counts[tt.id];
          return (
            <button
              key={tt.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tt.label}
              class={cn(styles.typePill, active && styles.typePillActive)}
              onClick={() => {
                onTabChange(tt.id);
              }}
            >
              <span>{tt.label}</span>
              {count !== undefined ? (
                <span
                  aria-hidden="true"
                  class={cn(styles.typeCount, active && styles.typeCountActive)}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error !== '' && (
        <p role="alert" class={styles.error} data-testid="storage-error">
          {error}
        </p>
      )}

      <p class={styles.report} role="status" aria-live="polite" data-testid="storage-report">
        {report}
      </p>

      {pending !== null && (
        <div class={styles.confirm} role="alertdialog" aria-label={t('storage.confirm')}>
          <p>{confirmText()}</p>
          <div class={styles.confirmActions}>
            <Button size="md" variant="danger" onClick={confirmPending}>
              {t('storage.confirm')}
            </Button>
            <Button
              size="md"
              variant="secondary"
              onClick={() => {
                setPending(null);
                setImportDiff(null);
              }}
            >
              {t('storage.cancel')}
            </Button>
          </div>
        </div>
      )}

      {isWebTab(tab) ? (
        tab === 'cookies' && cookiesDenied ? (
          <div data-testid="storage-cookies-denied">
            <Alert tone="warn">
              <p>{t('storage.cookiesDenied')}</p>
              <Button
                size="sm"
                onClick={() => {
                  void loadCookies();
                }}
              >
                {t('storage.grantCookies')}
              </Button>
            </Alert>
          </div>
        ) : (
          renderWeb()
        )
      ) : tab === 'indexeddb' ? (
        <IdbTab
          nonce={reloadNonce}
          busy={busy}
          run={run}
          ensureTab={ensureTab}
          setReport={setReport}
          setError={setError}
          requestConfirm={requestConfirm}
          onLoaded={(n) => {
            setLoadedTab('indexeddb');
            setTabCount('indexeddb', n);
          }}
        />
      ) : (
        <CacheTab
          nonce={reloadNonce}
          busy={busy}
          run={run}
          ensureTab={ensureTab}
          setReport={setReport}
          setError={setError}
          requestConfirm={requestConfirm}
          onLoaded={(n) => {
            setLoadedTab('cache');
            setTabCount('cache', n);
          }}
        />
      )}
    </div>
  );
}

// ── карточка web-storage записи ────────────────────────────────────────────────

interface StorageEntryCardProps {
  entry: StorageEntry;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (value: string) => void;
  onRemove: () => void;
  onCopy: () => void;
}

function StorageEntryCard(props: StorageEntryCardProps): JSX.Element {
  const [draft, setDraft] = useState(props.entry.value);
  const dirty = draft !== props.entry.value;
  const tp = valueType(props.entry.value);

  useEffect(() => {
    setDraft(props.entry.value);
  }, [props.entry.value]);

  return (
    <CardShell
      open={props.open}
      onToggle={props.onToggle}
      badgeLabel={tp}
      badgeClass={TYPE_BADGE[tp]}
      keyText={props.entry.key}
      preview={props.entry.value}
      size={fmtSize(props.entry.value.length)}
    >
      <div class={styles.editorHead}>
        <span class={styles.label}>{t('storage.value')}</span>
        {valueType(draft) === 'json' ? (
          <button
            type="button"
            class={styles.prettify}
            onClick={() => {
              setDraft(tryPrettyJson(draft));
            }}
          >
            {t('storage.prettyJson')}
          </button>
        ) : null}
      </div>
      <textarea
        class={styles.area}
        value={draft}
        aria-label={props.entry.key}
        onInput={(e) => {
          setDraft(e.currentTarget.value);
        }}
      />
      <div class={styles.actions}>
        <Button
          size="sm"
          disabled={props.busy || !dirty}
          onClick={() => {
            props.onSave(draft);
          }}
        >
          {t('storage.save')}
        </Button>
        <Button size="sm" variant="secondary" onClick={props.onCopy}>
          {t('storage.copy')}
        </Button>
        <span class={styles.spacer} />
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onRemove}>
          {t('storage.remove')}
        </Button>
      </div>
    </CardShell>
  );
}

// ── карточка cookie ─────────────────────────────────────────────────────────

const SAME_SITE_LABEL: Record<SameSite, string> = {
  unspecified: 'Auto',
  lax: 'Lax',
  strict: 'Strict',
  no_restriction: 'None',
};

/** Дата-время-локаль ↔ секунды эпохи для поля «Истекает». */
function toLocalInput(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CookieCardProps {
  cookie: CookieRecord;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (cookie: CookieRecord) => void;
  onRemove: () => void;
  onCopy: () => void;
}

function CookieCard(props: CookieCardProps): JSX.Element {
  const c = props.cookie;
  const [value, setValue] = useState(c.value);
  const [domain, setDomain] = useState(c.domain);
  const [path, setPath] = useState(c.path);
  const [secure, setSecure] = useState(c.secure);
  const [httpOnly, setHttpOnly] = useState(c.httpOnly);
  const [sameSite, setSameSite] = useState<SameSite>(c.sameSite);
  const [expires, setExpires] = useState(toLocalInput(c.expirationDate));

  useEffect(() => {
    setValue(c.value);
    setDomain(c.domain);
    setPath(c.path);
    setSecure(c.secure);
    setHttpOnly(c.httpOnly);
    setSameSite(c.sameSite);
    setExpires(toLocalInput(c.expirationDate));
  }, [c]);

  const build = (): CookieRecord => {
    const base = { name: c.name, value, domain, path, secure, httpOnly, sameSite };
    if (expires.trim() === '') return base;
    const ms = Date.parse(expires);
    return Number.isNaN(ms) ? base : { ...base, expirationDate: Math.floor(ms / 1000) };
  };

  const flags: string[] = [];
  if (c.httpOnly) flags.push('HttpOnly');
  if (c.secure) flags.push('Secure');

  return (
    <CardShell
      open={props.open}
      onToggle={props.onToggle}
      keyText={c.name}
      preview={c.value}
      flags={flags}
    >
      <label class={styles.label} for={`cookie-value-${c.name}`}>
        {t('storage.value')}
      </label>
      <textarea
        id={`cookie-value-${c.name}`}
        class={styles.area}
        value={value}
        aria-label={`${c.name} ${t('storage.value')}`}
        onInput={(e) => {
          setValue(e.currentTarget.value);
        }}
      />
      <div class={styles.cookieGrid}>
        <Field label={t('storage.domain')} class={styles.field}>
          {(control) => (
            <Input
              {...control}
              class={styles.input}
              value={domain}
              onInput={(e) => {
                setDomain(e.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label={t('storage.path')} class={styles.field}>
          {(control) => (
            <Input
              {...control}
              class={styles.input}
              value={path}
              onInput={(e) => {
                setPath(e.currentTarget.value);
              }}
            />
          )}
        </Field>
      </div>
      <Field label={t('storage.expires')}>
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            class={styles.input}
            value={expires}
            onInput={(e) => {
              setExpires(e.currentTarget.value);
            }}
          />
        )}
      </Field>
      <div class={styles.field}>
        <span class={styles.label}>{t('storage.sameSite')}</span>
        <SegmentedControl
          size="sm"
          label={t('storage.sameSite')}
          value={sameSite}
          options={SAME_SITE_VALUES.map((v) => ({ value: v, label: SAME_SITE_LABEL[v] }))}
          onChange={(v) => {
            setSameSite(v as SameSite);
          }}
        />
      </div>
      <div class={styles.chipRow}>
        <Chip
          pressed={secure}
          onClick={() => {
            setSecure((x) => !x);
          }}
        >
          {t('storage.secure')}
        </Chip>
        <Chip
          pressed={httpOnly}
          onClick={() => {
            setHttpOnly((x) => !x);
          }}
        >
          {t('storage.httpOnly')}
        </Chip>
      </div>
      <div class={styles.actions}>
        <Button
          size="sm"
          disabled={props.busy}
          onClick={() => {
            props.onSave(build());
          }}
        >
          {t('storage.save')}
        </Button>
        <Button size="sm" variant="secondary" onClick={props.onCopy}>
          {t('storage.copy')}
        </Button>
        <span class={styles.spacer} />
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onRemove}>
          {t('storage.remove')}
        </Button>
      </div>
    </CardShell>
  );
}

// ── IndexedDB / Cache под-вкладки (TASK-031) ──────────────────────────────────

interface SubTabProps {
  readonly nonce: number;
  readonly busy: boolean;
  readonly run: (fn: (isCurrent: () => boolean) => Promise<void>) => Promise<void>;
  readonly ensureTab: (
    request: PermissionRequest,
    isCurrent: () => boolean,
  ) => Promise<number | null>;
  readonly setReport: (msg: string) => void;
  readonly setError: (msg: string) => void;
  readonly requestConfirm: (text: string, action: () => void) => void;
  readonly onLoaded: (count: number) => void;
}

function IdbTab(props: SubTabProps): JSX.Element {
  const { run, ensureTab, setReport, setError, requestConfirm, onLoaded } = props;
  const { show } = useToast();

  const [databases, setDatabases] = useState<IdbDatabaseSummary[]>([]);
  const [selDb, setSelDb] = useState<string | null>(null);
  const [selStore, setSelStore] = useState<string | null>(null);
  const [records, setRecords] = useState<IdbRecord[]>([]);
  const [recTruncated, setRecTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const errorText = (key: string | undefined): string =>
    key !== undefined ? t(key) : t('storage.error.generic');

  const totalRecords = (dbs: IdbDatabaseSummary[]): number =>
    dbs.reduce((a, db) => a + db.stores.reduce((b, st) => b + st.count, 0), 0);

  const openStore = (db: string, store: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('idb/get', { tabId, db, store });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setSelDb(db);
      setSelStore(store);
      setRecords(res.value.records);
      setRecTruncated(res.value.truncated);
      setOpenId(null);
    });

  const loadList = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('idb/list', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      const dbs = res.value.databases;
      setDatabases(dbs);
      setRecords([]);
      setLoaded(true);
      onLoaded(totalRecords(dbs));
      // Автовыбор первой базы/стора для сразу-видимого содержимого.
      const firstDb = dbs[0];
      const firstStore = firstDb?.stores[0];
      if (firstDb && firstStore) void openStore(firstDb.name, firstStore.name);
      else {
        setSelDb(null);
        setSelStore(null);
      }
    });

  useEffect(() => {
    void loadList();
  }, [props.nonce]);

  const saveRecord = (record: IdbRecord, text: string): Promise<void> =>
    run(async (isCurrent) => {
      const parsed = parseEditValue(text);
      if (!parsed.ok) {
        setError(t('storage.idb.badValue'));
        return;
      }
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null || selDb === null || selStore === null) return;
      const payload =
        record.keyText !== null
          ? { tabId, db: selDb, store: selStore, key: record.keyText, value: text }
          : { tabId, db: selDb, store: selStore, value: text };
      const res = await sendMessage('idb/set', payload);
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setReport(t('storage.report.saved'));
      await openStore(selDb, selStore);
    });

  const removeRecord = (record: IdbRecord): Promise<void> =>
    run(async (isCurrent) => {
      if (record.keyText === null) return;
      const key = record.keyText;
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null || selDb === null || selStore === null) return;
      const res = await sendMessage('idb/remove', { tabId, db: selDb, store: selStore, key });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setRecords((prev) => prev.filter((r) => r.keyText !== key));
      setReport(t('storage.report.removed'));
    });

  const clearStore = (db: string, store: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('idb/clear', { tabId, db, store });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setRecords([]);
      setReport(t('storage.report.cleared', { count: res.value.removed }));
      await loadList();
    });

  const deleteDb = (db: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('idb/clear', { tabId, db });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setReport(t('storage.report.cleared', { count: res.value.removed }));
      await loadList();
    });

  const wipeAll = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('idb/clear', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setReport(t('storage.report.wiped', { count: res.value.removed }));
      await loadList();
    });

  const collectSnapshot = async (tabId: number): Promise<IdbSnapshot> => {
    const listRes = await sendMessage('idb/list', { tabId });
    const dbs = listRes.ok ? listRes.value.databases : [];
    const originValue = listRes.ok ? listRes.value.origin : '';
    const out: IdbSnapshot['databases'][number][] = [];
    for (const db of dbs) {
      const stores: IdbSnapshot['databases'][number]['stores'][number][] = [];
      for (const st of db.stores) {
        const gRes = await sendMessage('idb/get', { tabId, db: db.name, store: st.name });
        if (gRes.ok) {
          stores.push({ ...st, records: gRes.value.records, truncated: gRes.value.truncated });
        } else {
          stores.push({ ...st, records: [], truncated: true });
        }
      }
      out.push({ name: db.name, version: db.version, stores });
    }
    return { origin: originValue, databases: out };
  };

  const exportSnapshot = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const snapshot = await collectSnapshot(tabId);
      if (!isCurrent()) return;
      const okFlag = await copyText(serializeIdbSnapshot(snapshot));
      if (isCurrent() && okFlag) show(t('toast.copied'), { severity: 'success' });
    });

  const activeDb = databases.find((db) => db.name === selDb) ?? null;
  const flt = filter.trim().toLowerCase();
  const shownRecords =
    flt === ''
      ? records
      : records.filter(
          (r) =>
            r.keyDisplay.toLowerCase().includes(flt) ||
            JSON.stringify(r.value).toLowerCase().includes(flt),
        );

  if (!loaded) {
    return (
      <div data-testid="idb-panel">
        <EmptyState text={t('storage.empty')} />
      </div>
    );
  }

  if (databases.length === 0) {
    return (
      <div data-testid="idb-panel">
        <EmptyState text={t('storage.idb.noDatabases')} />
      </div>
    );
  }

  return (
    <div data-testid="idb-panel">
      <ScopeBox
        rows={[
          {
            label: 'DB',
            pills: databases.map((db) => ({
              id: db.name,
              label: db.name,
              active: db.name === selDb,
              onClick: () => {
                const st = db.stores[0];
                if (st) void openStore(db.name, st.name);
              },
            })),
          },
          {
            label: 'STORE',
            pills: (activeDb?.stores ?? []).map((st) => ({
              id: st.name,
              label: `${st.name} (${String(st.count)})`,
              active: st.name === selStore,
              onClick: () => {
                if (selDb !== null) void openStore(selDb, st.name);
              },
            })),
          },
        ]}
      />

      <div class={styles.filterRow}>
        <div class={styles.searchBox}>
          <SearchIcon />
          <input
            class={styles.filterInput}
            placeholder={t('storage.search')}
            aria-label={t('storage.search')}
            value={filter}
            onInput={(e) => {
              setFilter(e.currentTarget.value);
            }}
          />
        </div>
      </div>

      <div class={styles.summaryRow}>
        <span class={styles.summary}>
          {records.length} {t('storage.summary.records')}
        </span>
        <span class={styles.scopeHint} title={`${selDb ?? ''} ▸ ${selStore ?? ''}`}>
          {selDb} ▸ {selStore}
        </span>
      </div>

      {recTruncated ? <p class={styles.note}>{t('storage.idb.truncated')}</p> : null}

      <div class={styles.cardList} data-testid="idb-records">
        {shownRecords.length === 0 ? (
          <EmptyState text={flt !== '' ? t('storage.emptyFilter') : t('storage.idb.noRecords')} />
        ) : (
          shownRecords.map((r, i) => {
            const id = r.keyText ?? `#${String(i)}`;
            return (
              <IdbRecordCard
                key={id}
                record={r}
                open={openId === id}
                busy={props.busy}
                onToggle={() => {
                  setOpenId((cur) => (cur === id ? null : id));
                }}
                onSave={(text) => {
                  void saveRecord(r, text);
                }}
                onRemove={() => {
                  void removeRecord(r);
                }}
                onCopy={() => {
                  void copyText(JSON.stringify(r.value)).then((ok) => {
                    if (ok) show(t('toast.copied'), { severity: 'success' });
                  });
                }}
              />
            );
          })
        )}
      </div>

      <div class={styles.snapGrid}>
        <Button
          size="md"
          variant="secondary"
          disabled={props.busy}
          onClick={() => {
            void exportSnapshot();
          }}
        >
          {t('storage.snapshotSave')}
        </Button>
        {selDb !== null && selStore !== null ? (
          <Button
            size="md"
            variant="secondary"
            disabled={props.busy}
            onClick={() => {
              requestConfirm(t('storage.idb.confirmClearStore', { store: selStore }), () => {
                void clearStore(selDb, selStore);
              });
            }}
          >
            {t('storage.idb.clearStore')}
          </Button>
        ) : null}
      </div>
      <div class={styles.snapGrid}>
        {selDb !== null ? (
          <Button
            size="md"
            variant="secondary"
            disabled={props.busy}
            onClick={() => {
              requestConfirm(t('storage.idb.confirmDeleteDb', { db: selDb }), () => {
                void deleteDb(selDb);
              });
            }}
          >
            {t('storage.idb.deleteDb')}
          </Button>
        ) : null}
        <Button
          block
          size="md"
          variant="danger"
          disabled={props.busy}
          onClick={() => {
            requestConfirm(t('storage.idb.confirmWipe'), () => {
              void wipeAll();
            });
          }}
        >
          {t('storage.idb.wipe')}
        </Button>
      </div>
    </div>
  );
}

interface IdbRecordCardProps {
  record: IdbRecord;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (value: string) => void;
  onRemove: () => void;
  onCopy: () => void;
}

function IdbRecordCard(props: IdbRecordCardProps): JSX.Element {
  const initial = JSON.stringify(props.record.value, null, 2);
  const [draft, setDraft] = useState(initial);
  const dirty = draft !== initial;
  const editable = props.record.keyText !== null && !props.record.truncated;
  const preview = JSON.stringify(props.record.value);

  useEffect(() => {
    setDraft(JSON.stringify(props.record.value, null, 2));
  }, [props.record.value]);

  return (
    <CardShell
      open={props.open}
      onToggle={props.onToggle}
      badgeLabel="json"
      badgeClass={styles.badgeJson}
      keyText={props.record.keyDisplay}
      preview={preview}
      size={fmtSize(preview.length)}
    >
      <span class={styles.label}>{t('storage.value')}</span>
      <textarea
        class={styles.area}
        value={draft}
        readOnly={!editable}
        aria-label={props.record.keyDisplay}
        onInput={(e) => {
          setDraft(e.currentTarget.value);
        }}
      />
      <div class={styles.actions}>
        <Button
          size="sm"
          disabled={props.busy || !editable || !dirty}
          onClick={() => {
            props.onSave(draft);
          }}
        >
          {t('storage.save')}
        </Button>
        <Button size="sm" variant="secondary" onClick={props.onCopy}>
          {t('storage.copy')}
        </Button>
        <span class={styles.spacer} />
        <Button
          size="sm"
          variant="ghost"
          disabled={props.busy || props.record.keyText === null}
          onClick={props.onRemove}
        >
          {t('storage.remove')}
        </Button>
      </div>
    </CardShell>
  );
}

function CacheTab(props: SubTabProps): JSX.Element {
  const { run, ensureTab, setReport, setError, requestConfirm, onLoaded } = props;
  const { show } = useToast();

  const [caches, setCaches] = useState<CacheSummary[]>([]);
  const [selCache, setSelCache] = useState<string | null>(null);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const errorText = (key: string | undefined): string =>
    key !== undefined ? t(key) : t('storage.error.generic');

  const openCache = (name: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('cache/get', { tabId, cache: name });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setSelCache(name);
      setEntries(res.value.entries);
      setTruncated(res.value.truncated);
      setOpenId(null);
    });

  const loadList = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('cache/list', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      const list = res.value.caches;
      setCaches(list);
      setEntries([]);
      setLoaded(true);
      onLoaded(list.reduce((a, c) => a + c.count, 0));
      const first = list[0];
      if (first) void openCache(first.name);
      else setSelCache(null);
    });

  useEffect(() => {
    void loadList();
  }, [props.nonce]);

  const removeEntry = (entry: CacheEntry): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null || selCache === null) return;
      const res = await sendMessage('cache/remove', {
        tabId,
        cache: selCache,
        reqUrl: entry.reqUrl,
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setEntries((prev) => prev.filter((e) => e.reqUrl !== entry.reqUrl));
      setReport(t('storage.report.removed'));
    });

  const deleteCache = (name: string): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('cache/clear', { tabId, cache: name });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setReport(t('storage.report.cleared', { count: res.value.removed }));
      await loadList();
    });

  const wipeAll = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('cache/clear', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(errorText(res.error.messageKey));
        return;
      }
      setReport(t('storage.report.wiped', { count: res.value.removed }));
      await loadList();
    });

  const collectSnapshot = async (tabId: number): Promise<CacheSnapshot> => {
    const listRes = await sendMessage('cache/list', { tabId });
    const names = listRes.ok ? listRes.value.caches : [];
    const originValue = listRes.ok ? listRes.value.origin : '';
    const out: CacheSnapshot['caches'][number][] = [];
    for (const summary of names) {
      const gRes = await sendMessage('cache/get', { tabId, cache: summary.name });
      if (gRes.ok) {
        out.push({
          name: summary.name,
          entries: gRes.value.entries,
          truncated: gRes.value.truncated,
        });
      } else {
        out.push({ name: summary.name, entries: [], truncated: true });
      }
    }
    return { origin: originValue, caches: out };
  };

  const exportSnapshot = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(STORAGE_PERMS, isCurrent);
      if (tabId === null) return;
      const snapshot = await collectSnapshot(tabId);
      if (!isCurrent()) return;
      const okFlag = await copyText(serializeCacheSnapshot(snapshot));
      if (isCurrent() && okFlag) show(t('toast.copied'), { severity: 'success' });
    });

  const flt = filter.trim().toLowerCase();
  const shown = flt === '' ? entries : entries.filter((e) => e.reqUrl.toLowerCase().includes(flt));

  if (!loaded) {
    return (
      <div data-testid="cache-panel">
        <EmptyState text={t('storage.empty')} />
      </div>
    );
  }

  if (caches.length === 0) {
    return (
      <div data-testid="cache-panel">
        <EmptyState text={t('storage.cache.noCaches')} />
      </div>
    );
  }

  return (
    <div data-testid="cache-panel">
      <ScopeBox
        rows={[
          {
            label: 'CACHE',
            pills: caches.map((c) => ({
              id: c.name,
              label: `${c.name} (${String(c.count)})`,
              active: c.name === selCache,
              onClick: () => {
                void openCache(c.name);
              },
            })),
          },
        ]}
      />

      <div class={styles.filterRow}>
        <div class={styles.searchBox}>
          <SearchIcon />
          <input
            class={styles.filterInput}
            placeholder={t('storage.search')}
            aria-label={t('storage.search')}
            value={filter}
            onInput={(e) => {
              setFilter(e.currentTarget.value);
            }}
          />
        </div>
      </div>

      <div class={styles.summaryRow}>
        <span class={styles.summary}>
          {entries.length} {t('storage.summary.responses')}
        </span>
        <span class={styles.scopeHint} title={selCache ?? ''}>
          {selCache}
        </span>
      </div>

      {truncated ? <p class={styles.note}>{t('storage.idb.truncated')}</p> : null}

      <div class={styles.cardList} data-testid="cache-entries">
        {shown.length === 0 ? (
          <EmptyState text={flt !== '' ? t('storage.emptyFilter') : t('storage.cache.noEntries')} />
        ) : (
          shown.map((e) => (
            <CacheEntryCard
              key={e.reqUrl}
              entry={e}
              open={openId === e.reqUrl}
              busy={props.busy}
              onToggle={() => {
                setOpenId((cur) => (cur === e.reqUrl ? null : e.reqUrl));
              }}
              onRemove={() => {
                void removeEntry(e);
              }}
              onCopy={() => {
                void copyText(e.reqUrl).then((ok) => {
                  if (ok) show(t('toast.copied'), { severity: 'success' });
                });
              }}
            />
          ))
        )}
      </div>

      <div class={styles.snapGrid}>
        <Button
          size="md"
          variant="secondary"
          disabled={props.busy}
          onClick={() => {
            void exportSnapshot();
          }}
        >
          {t('storage.snapshotSave')}
        </Button>
        {selCache !== null ? (
          <Button
            size="md"
            variant="secondary"
            disabled={props.busy}
            onClick={() => {
              requestConfirm(t('storage.cache.confirmDeleteCache', { cache: selCache }), () => {
                void deleteCache(selCache);
              });
            }}
          >
            {t('storage.cache.deleteCache')}
          </Button>
        ) : null}
      </div>
      <Button
        block
        size="md"
        variant="danger"
        disabled={props.busy}
        onClick={() => {
          requestConfirm(t('storage.cache.confirmWipe'), () => {
            void wipeAll();
          });
        }}
      >
        {t('storage.cache.wipe')}
      </Button>
    </div>
  );
}

interface CacheEntryCardProps {
  entry: CacheEntry;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onCopy: () => void;
}

/** Локализованная причина отсутствия тела ответа в кэше. */
function bodyOmittedText(reason: string): string {
  return t(`storage.cache.omitted.${reason}`);
}

function CacheEntryCard(props: CacheEntryCardProps): JSX.Element {
  const e = props.entry;
  const statusLabel = e.status === 0 ? '—' : `${String(e.status)} ${e.statusText}`.trim();
  const size = e.bodyText !== null ? fmtSize(e.bodyText.length) : '';
  const flags: string[] = [];
  if (e.contentType !== null) flags.push(e.contentType);
  if (e.responseType !== 'basic') flags.push(e.responseType);

  const metaRows: { k: string; v: string }[] = [
    { k: 'Status', v: statusLabel },
    { k: 'Method', v: e.reqMethod },
    { k: 'Type', v: e.contentType ?? '—' },
    { k: 'Response', v: e.responseType },
  ];
  if (e.bodyText !== null) metaRows.push({ k: 'Size', v: fmtSize(e.bodyText.length) });

  return (
    <CardShell
      open={props.open}
      onToggle={props.onToggle}
      badgeLabel={e.status === 0 ? '—' : String(e.status)}
      badgeClass={cn(styles.badgeStatus, STATUS_BADGE[statusTone(e.status)])}
      keyText={e.reqUrl}
      preview={e.reqMethod}
      size={size}
      flags={flags}
    >
      <div class={styles.metaTable}>
        {metaRows.map((m) => (
          <div key={m.k} class={styles.metaRow}>
            <span class={styles.metaKey}>{m.k}</span>
            <span class={styles.metaVal}>{m.v}</span>
          </div>
        ))}
      </div>
      <span class={styles.label}>{t('storage.responseBody')}</span>
      {e.bodyText !== null ? (
        <pre class={styles.codeBox}>{e.bodyText}</pre>
      ) : (
        <p class={styles.meta}>{e.bodyOmitted !== null ? bodyOmittedText(e.bodyOmitted) : ''}</p>
      )}
      {e.bodyTruncated ? <p class={styles.note}>{t('storage.idb.truncated')}</p> : null}
      <div class={styles.actions}>
        <Button size="sm" variant="secondary" onClick={props.onCopy}>
          {t('storage.copy')}
        </Button>
        <span class={styles.spacer} />
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onRemove}>
          {t('storage.remove')}
        </Button>
      </div>
    </CardShell>
  );
}
