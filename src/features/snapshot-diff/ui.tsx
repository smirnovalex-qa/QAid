/**
 * UI фичи «Snapshot-diff» (TASK-028 · редизайн v3) — потребитель инспекционного слоя
 * (TASK-013), поверхность side panel / popup.
 *
 * Поток снятия не изменён: клик по плитке-шагу (жест) → брокер прав (`scripting` + host
 * ко всем http/https) → id активной вкладки → RPC `inspection/scan` c inspectorId
 * `snapshot`. Токен сессии против устаревших ответов и «Отмена» сохранены.
 *
 * Диф РЕАКТИВЕН: снимки A/B держатся в памяти сессии, `diffSnapshots` считается чистой
 * логикой один раз, а чипы (Структура/Стили/Текст) переключают показ без повторного
 * снятия. Клик по строке → `inspection/highlight`. Экспорт JSON/Markdown.
 *
 * Представление перестроено к v3: интро + две плитки-шага «Шаг 1 До» / «Шаг 2 После»
 * (пунктир пустой → акцент со «✓»), чипы-фильтры со счётчиками и строки дифа со
 * значковой плиткой (+ − ~), моно-селектором и деталью «было → стало».
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, Chip } from '@/ui';
import { copyText } from '@/ui';
import { useToast } from '@/ui/components';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { cn } from '@/ui/cn';
import { t, locale } from '@/i18n';
import { useSettings } from '@/shared/storage';
import { SNAPSHOT_INSPECTOR_ID } from '@/shared/inspection/snapshot/collector';
import { parseSnapshot } from '@/shared/inspection/snapshot/types';
import type { Snapshot } from '@/shared/inspection/snapshot/types';
import { buildDiffReport, diffSnapshots, isEmptyDiff } from './logic';
import type { DiffResult } from './logic';
import { snapshotDiffBinding } from './settings';
import styles from './snapshot-diff.module.css';

/**
 * Права инспектора: `scripting` + постоянный host-доступ ко всем http/https-страницам
 * (не `activeTab`: панель обязана переживать переключение вкладок, ADR-0022).
 */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Брокер создаётся лениво при первом клике (не на импорте) — рендер остаётся чистым. */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Слот снимка: какое состояние снимаем. */
type Slot = 'A' | 'B';

/** Категория строки дифа (чипы-фильтры). */
type Category = 'structure' | 'styles' | 'text';

/** Одна строка дифа для показа. */
interface DiffRow {
  readonly category: Category;
  readonly sym: '+' | '−' | '~';
  readonly selector: string;
  readonly detail: string;
}

/** Отображает пустую строку как `∅` для читаемости. */
function shown(value: string | null): string {
  return value === null || value === '' ? t('snapshotDiff.empty') : value;
}

/** Форматирует метку времени снятия (HH:MM) в локали. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Разворачивает `DiffResult` в плоский список строк по категориям (без пересбора). */
function toRows(diff: DiffResult): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const n of diff.added) {
    rows.push({
      category: 'structure',
      sym: '+',
      selector: n.selector,
      detail: t('snapshotDiff.rowAdded'),
    });
  }
  for (const n of diff.removed) {
    rows.push({
      category: 'structure',
      sym: '−',
      selector: n.selector,
      detail: t('snapshotDiff.rowRemoved'),
    });
  }
  for (const c of diff.changed) {
    if (c.textChange !== null) {
      rows.push({
        category: 'text',
        sym: '~',
        selector: c.selector,
        detail: `"${shown(c.textChange.before)}" → "${shown(c.textChange.after)}"`,
      });
    }
    for (const st of c.styleChanges) {
      rows.push({
        category: 'styles',
        sym: '~',
        selector: c.selector,
        detail: `${st.prop}: ${shown(st.before)} → ${shown(st.after)}`,
      });
    }
    for (const a of c.attrChanges) {
      rows.push({
        category: 'styles',
        sym: '~',
        selector: c.selector,
        detail: `[${a.name}]: ${shown(a.before)} → ${shown(a.after)}`,
      });
    }
  }
  return rows;
}

export function SnapshotDiffPanel(): JSX.Element {
  const settings = useSettings(snapshotDiffBinding);
  const ready = settings.ready.value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [snapshotA, setSnapshotA] = useState<Snapshot | null>(null);
  const [snapshotB, setSnapshotB] = useState<Snapshot | null>(null);
  const [takenAt, setTakenAt] = useState<{ A: number | null; B: number | null }>({
    A: null,
    B: null,
  });

  // Чипы-фильтры категорий (локальное представление; засеяно из персистентного фильтра).
  const [cats, setCats] = useState<Record<Category, boolean>>({
    structure: true,
    styles: true,
    text: true,
  });
  const [seeded, setSeeded] = useState(false);

  const { show } = useToast();

  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  const scanTabRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || seeded) return;
    const f = snapshotDiffBinding.value.value.filter;
    setCats(
      f === 'all'
        ? { structure: true, styles: true, text: true }
        : { structure: f === 'structure', styles: f === 'styles', text: f === 'text' },
    );
    setSeeded(true);
  }, [ready, seeded]);

  const diff = useMemo(
    () => (snapshotA !== null && snapshotB !== null ? diffSnapshots(snapshotA, snapshotB) : null),
    [snapshotA, snapshotB],
  );
  const rows = useMemo(() => (diff !== null ? toRows(diff) : []), [diff]);
  const catCount = useMemo(() => {
    const c: Record<Category, number> = { structure: 0, styles: 0, text: 0 };
    for (const r of rows) c[r.category] += 1;
    return c;
  }, [rows]);
  const visibleRows = rows.filter((r) => cats[r.category]);

  const onCapture = async (slot: Slot): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(t('snapshotDiff.error.permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('snapshotDiff.error.noTab'));
        return;
      }
      activeTabRef.current = tabId;

      const res = await sendMessage('inspection/scan', {
        tabId,
        inspectorId: SNAPSHOT_INSPECTOR_ID,
      });
      if (!isCurrent()) return;

      if (!res.ok) {
        setError(
          res.error.messageKey !== undefined
            ? t(res.error.messageKey)
            : t('snapshotDiff.error.generic'),
        );
        return;
      }

      const parsed = parseSnapshot(res.value.data);
      if (parsed === null) {
        setError(t('snapshotDiff.error.generic'));
        return;
      }
      scanTabRef.current = tabId;
      const now = Date.now();
      if (slot === 'A') setSnapshotA(parsed);
      else setSnapshotB(parsed);
      setTakenAt((prev) => ({ ...prev, [slot]: now }));
      show(t('snapshotDiff.saved'), { severity: 'success' });
    } catch (e) {
      logger.error('snapshot-diff.capture', e);
      if (isCurrent()) setError(t('snapshotDiff.error.generic'));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        activeTabRef.current = null;
      }
    }
  };

  const onCancel = (): void => {
    const tabId = activeTabRef.current;
    sessionRef.current += 1;
    activeTabRef.current = null;
    setBusy(false);
    if (tabId !== null) {
      void sendMessage('inspection/teardown', { tabId }).catch(() => undefined);
    }
  };

  const onClear = (): void => {
    setSnapshotA(null);
    setSnapshotB(null);
    setTakenAt({ A: null, B: null });
    setError('');
  };

  const toggleCat = (cat: Category): void => {
    const next = { ...cats, [cat]: !cats[cat] };
    setCats(next);
    const on = (['structure', 'styles', 'text'] as Category[]).filter((c) => next[c]);
    const persisted = on.length === 1 ? on[0] : 'all';
    void snapshotDiffBinding.update({ filter: persisted ?? 'all' });
  };

  const onHighlight = (selector: string): void => {
    const tabId = scanTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector })
      .then((res) => {
        if (!res.ok || !res.value.found) {
          show(t('snapshotDiff.notFound'), { severity: 'info' });
        }
      })
      .catch(() => {
        show(t('snapshotDiff.notFound'), { severity: 'info' });
      });
  };

  const onExport = (format: 'json' | 'markdown'): void => {
    if (diff === null) return;
    void copyText(buildDiffReport(diff, format)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const symClass = (sym: DiffRow['sym']): string | undefined =>
    sym === '+' ? styles.markAdd : sym === '−' ? styles.markRemove : styles.markChange;

  const steps: { slot: Slot; step: string; label: string; snap: Snapshot | null }[] = [
    { slot: 'A', step: t('snapshotDiff.step1'), label: t('snapshotDiff.before'), snap: snapshotA },
    { slot: 'B', step: t('snapshotDiff.step2'), label: t('snapshotDiff.after'), snap: snapshotB },
  ];

  return (
    <div class={styles.panel}>
      <p class={styles.intro}>{t('snapshotDiff.diffIntro')}</p>

      <div class={styles.steps}>
        {steps.map((s) => {
          const taken = s.snap !== null;
          const at = takenAt[s.slot];
          return (
            <button
              key={s.slot}
              type="button"
              class={cn(styles.step, taken && styles.stepTaken)}
              data-testid={`snapshot-step-${s.slot.toLowerCase()}`}
              disabled={busy}
              onClick={() => {
                void onCapture(s.slot);
              }}
            >
              <span class={styles.stepTop}>{s.step}</span>
              <span class={styles.stepLabel}>{taken ? `✓ ${s.label}` : s.label}</span>
              <span class={styles.stepMeta}>
                {taken
                  ? t('snapshotDiff.tileTaken', {
                      time: at !== null ? formatTime(at) : '',
                      count: s.snap?.nodes.length ?? 0,
                    })
                  : t('snapshotDiff.tileEmpty')}
              </span>
            </button>
          );
        })}
      </div>

      {error !== '' && (
        <p role="alert" class={styles.error} data-testid="snapshot-error">
          {error}
        </p>
      )}

      {busy && (
        <Button variant="secondary" onClick={onCancel}>
          {t('snapshotDiff.cancel')}
        </Button>
      )}

      {diff !== null && (
        <>
          <p class={styles.srOnly} role="status" aria-live="polite" data-testid="snapshot-summary">
            {t('snapshotDiff.summary', {
              added: diff.summary.added,
              removed: diff.summary.removed,
              changed: diff.summary.changed,
            })}
          </p>

          {isEmptyDiff(diff) ? (
            <p class={styles.meta}>{t('snapshotDiff.noChanges')}</p>
          ) : (
            <>
              <div class={styles.chips}>
                {(['structure', 'styles', 'text'] as Category[]).map((cat) => (
                  <Chip
                    key={cat}
                    pressed={cats[cat]}
                    count={catCount[cat]}
                    aria-label={t(`snapshotDiff.filter.${cat}`)}
                    onClick={() => {
                      toggleCat(cat);
                    }}
                  >
                    {t(`snapshotDiff.filter.${cat}`)}
                  </Chip>
                ))}
              </div>

              {visibleRows.length === 0 ? (
                <p class={styles.meta}>{t('snapshotDiff.noneForFilter')}</p>
              ) : (
                <div class={styles.list} data-testid="snapshot-diff-rows">
                  {visibleRows.map((r, i) => (
                    <button
                      key={`${r.selector}-${String(i)}`}
                      type="button"
                      class={styles.row}
                      title={t('snapshotDiff.highlightHint')}
                      onClick={() => {
                        onHighlight(r.selector);
                      }}
                    >
                      <span class={cn(styles.mark, symClass(r.sym))} aria-hidden="true">
                        {r.sym}
                      </span>
                      <span class={styles.rowBody}>
                        <span class={styles.selector}>{r.selector}</span>
                        <span class={styles.detail}>{r.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div class={styles.actions}>
                <button
                  type="button"
                  class={styles.secondary}
                  disabled={isEmptyDiff(diff)}
                  onClick={() => {
                    onExport('json');
                  }}
                >
                  {t('snapshotDiff.export.json')}
                </button>
                <button
                  type="button"
                  class={styles.secondary}
                  disabled={isEmptyDiff(diff)}
                  onClick={() => {
                    onExport('markdown');
                  }}
                >
                  {t('snapshotDiff.export.markdown')}
                </button>
                <button type="button" class={styles.ghost} onClick={onClear}>
                  {t('snapshotDiff.startOver')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {diff === null && (snapshotA !== null || snapshotB !== null) && (
        <p class={styles.meta}>{t('snapshotDiff.needBoth')}</p>
      )}
    </div>
  );
}
