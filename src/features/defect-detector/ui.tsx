/**
 * UI фичи «Детектор дефектов» (TASK-024 · редизайн v3) — потребитель
 * инспекционного слоя (TASK-013), поверхность side panel / popup.
 *
 * Поток скана не изменён: клик «Сканировать страницу» (жест) → брокер прав
 * (`scripting` + host ко всем http/https) → id активной вкладки → RPC
 * `inspection/scan` (сборщик `defects`). Токен сессии против устаревших ответов и
 * «Отмена» — как в эталоне.
 *
 * Детекция РЕАКТИВНА: сборщик возвращает модель узлов один раз, включённые правила
 * прогоняются чистой `logic.detectDefects` без повторного скана. Фильтр тяжести
 * (Ошибки/Предупреждения/Советы) — локальное представление поверх `groupFindings`,
 * «Советы» по умолчанию выключены. Клик по строке → `inspection/highlight`. Экспорт
 * plain/JSON/CSV. Набор выключенных правил персистится (namespace `defect-detector`).
 *
 * Представление перестроено к v3: единое пустое состояние скана, мета-бар, чипы
 * тяжести со счётчиками, карточки-группы с цветной точкой и строками «Показать», и
 * раскрывающийся блок «Что проверять» с переключателем на каждое правило.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, Chip, Collapsible, Toggle } from '@/ui';
import { copyText } from '@/ui';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { cn } from '@/ui/cn';
import type { ExportFormat } from '@/shared/export/export';
import { t, locale } from '@/i18n';
import { useToast } from '@/ui/components';
import { useSettings } from '@/shared/storage';
import {
  DEFECT_RULES,
  buildReport,
  detectDefects,
  groupFindings,
  summarize,
  toReportRows,
} from '@/shared/inspection/defects/logic';
import type { DefectNode, DefectScanData, DefectSeverity } from '@/shared/inspection/defects/types';
import { DEFECTS_INSPECTOR_ID } from '@/shared/inspection/defects/collector';
import { defectBinding } from './settings';
import styles from './defect-detector.module.css';

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

/** Мягко валидирует ответ сборщика (данные пересекли границу сред как `unknown`). */
function asScanData(data: unknown): DefectScanData | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<DefectScanData>;
  if (!Array.isArray(d.nodes)) return null;
  return {
    nodes: d.nodes as DefectNode[],
    visited: typeof d.visited === 'number' ? d.visited : d.nodes.length,
    budget: typeof d.budget === 'number' ? d.budget : 0,
    truncated: d.truncated === true,
  };
}

/** Форматирует метку времени скана (HH:MM) в локали. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Порядок и локализованные метки тяжести для чипов-фильтров. */
const SEVERITIES: readonly DefectSeverity[] = ['error', 'warning', 'info'];

export function DefectDetectorPanel(): JSX.Element {
  const settings = useSettings(defectBinding);
  const ready = settings.ready.value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [data, setData] = useState<DefectScanData | null>(null);

  // Выключенные правила — локальное состояние, засеянное из настроек и персистящееся.
  const [disabled, setDisabled] = useState<readonly string[]>(
    defectBinding.value.value.disabledRules,
  );
  const [seeded, setSeeded] = useState(false);

  // Фильтр тяжести — локальное представление (Советы выключены по умолчанию).
  const [sevFilter, setSevFilter] = useState<Record<DefectSeverity, boolean>>({
    error: true,
    warning: true,
    info: false,
  });
  const [rulesOpen, setRulesOpen] = useState(false);

  const { show } = useToast();

  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  const scanTabRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || seeded) return;
    setDisabled(defectBinding.value.value.disabledRules);
    setSeeded(true);
  }, [ready, seeded]);

  const nodes = data?.nodes ?? [];
  const disabledSet = useMemo(() => new Set(disabled), [disabled]);

  const findings = useMemo(
    () => detectDefects(nodes, { disabled: disabledSet }),
    [nodes, disabledSet],
  );
  const groups = useMemo(() => groupFindings(findings), [findings]);
  const summary = useMemo(() => summarize(findings), [findings]);

  const sevCount: Record<DefectSeverity, number> = {
    error: summary.errors,
    warning: summary.warnings,
    info: summary.infos,
  };
  const visibleGroups = groups.filter((g) => sevFilter[g.severity]);

  const onScan = async (): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(t('defects.error.permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('defects.error.noTab'));
        return;
      }
      activeTabRef.current = tabId;

      const res = await sendMessage('inspection/scan', {
        tabId,
        inspectorId: DEFECTS_INSPECTOR_ID,
      });
      if (!isCurrent()) return;

      if (!res.ok) {
        setError(
          res.error.messageKey !== undefined ? t(res.error.messageKey) : t('defects.error.generic'),
        );
        return;
      }

      const parsed = asScanData(res.value.data);
      if (parsed === null) {
        setError(t('defects.error.generic'));
        return;
      }
      scanTabRef.current = tabId;
      setData(parsed);
      setScanned(true);
      setScannedAt(Date.now());
    } catch (e) {
      logger.error('defect-detector.scan', e);
      if (isCurrent()) setError(t('defects.error.generic'));
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

  const toggleRule = (ruleId: string): void => {
    const next = disabledSet.has(ruleId)
      ? disabled.filter((id) => id !== ruleId)
      : [...disabled, ruleId];
    setDisabled(next);
    void defectBinding.update({ disabledRules: next });
  };

  const onHighlight = (selector: string): void => {
    const tabId = scanTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector })
      .then((res) => {
        if (!res.ok || !res.value.found) {
          show(t('defects.notFound'), { severity: 'info' });
        }
      })
      .catch(() => {
        show(t('defects.notFound'), { severity: 'info' });
      });
  };

  const onExport = (format: ExportFormat): void => {
    const report = buildReport(toReportRows(findings), format);
    void copyText(report).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const rulesEnabled = DEFECT_RULES.length - disabledSet.size;
  const rulesSummary = t('defects.rulesSummary', {
    on: rulesEnabled,
    total: DEFECT_RULES.length,
  });

  // Пустое состояние скана.
  if (!scanned) {
    return (
      <div class={styles.panel}>
        <p class={styles.intro}>{t('defects.scanIntro')}</p>
        <Button
          size="lg"
          block
          loading={busy}
          disabled={busy}
          onClick={() => {
            void onScan();
          }}
        >
          {busy ? t('scan.scanning') : t('scan.scanThis')}
        </Button>
        <span class={styles.note}>{t('scan.permNote')}</span>
        {error !== '' && (
          <p role="alert" class={styles.error} data-testid="defects-error">
            {error}
          </p>
        )}
        {busy && (
          <Button variant="secondary" onClick={onCancel}>
            {t('defects.cancel')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div class={styles.panel}>
      <div class={styles.metaBar}>
        <span class={styles.meta} data-testid="defects-summary">
          {t('scan.meta.defects', { count: summary.total })}
          {scannedAt !== null ? ` · ${formatTime(scannedAt)}` : ''}
        </span>
        <div class={styles.exportGroup} role="group" aria-label={t('defects.export')}>
          <span class={styles.exportLabel}>{t('defects.export')}</span>
          <button
            type="button"
            class={styles.ghost}
            onClick={() => {
              onExport('plain');
            }}
          >
            {t('defects.export.plain')}
          </button>
          <button
            type="button"
            class={styles.ghost}
            onClick={() => {
              onExport('json');
            }}
          >
            {t('defects.export.json')}
          </button>
          <button
            type="button"
            class={styles.ghost}
            onClick={() => {
              onExport('csv');
            }}
          >
            {t('defects.export.csv')}
          </button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={busy}
          onClick={() => {
            void onScan();
          }}
        >
          {t('scan.again')}
        </Button>
      </div>

      {/* Чипы фильтра тяжести со счётчиками. */}
      <div class={styles.chips}>
        {SEVERITIES.map((sev) => (
          <Chip
            key={sev}
            pressed={sevFilter[sev]}
            count={sevCount[sev]}
            aria-label={t(`defects.filter.${sev}`)}
            onClick={() => {
              setSevFilter((prev) => ({ ...prev, [sev]: !prev[sev] }));
            }}
          >
            {t(`defects.filter.${sev}`)}
          </Chip>
        ))}
      </div>

      {error !== '' && (
        <p role="alert" class={styles.error} data-testid="defects-error">
          {error}
        </p>
      )}

      {data?.truncated === true && (
        <p class={styles.metaLine}>
          {t('defects.truncated', { visited: data.visited, budget: data.budget })}
        </p>
      )}

      {findings.length === 0 ? (
        <p class={styles.metaLine}>
          {nodes.length > 0 && disabledSet.size < DEFECT_RULES.length
            ? t('defects.clean')
            : t('defects.noResults')}
        </p>
      ) : visibleGroups.length === 0 ? (
        <p class={styles.metaLine}>{t('defects.noneForFilter')}</p>
      ) : (
        <div class={styles.groups} aria-label={t('defects.list')} data-testid="defects-groups">
          {visibleGroups.map((group) => (
            <section key={group.ruleId} class={styles.group}>
              <div class={styles.groupHead}>
                <span class={cn(styles.dot, styles[`dot_${group.severity}`])} aria-hidden="true" />
                <span class={styles.groupTitle}>{t(group.messageKey)}</span>
                <span class={styles.count}>{group.count}</span>
              </div>
              {group.items.map((finding, i) => (
                <button
                  key={`${finding.selector}-${String(i)}`}
                  type="button"
                  class={styles.row}
                  data-testid="defects-row"
                  title={t('defects.highlightHint')}
                  onClick={() => {
                    onHighlight(finding.selector);
                  }}
                >
                  <span class={styles.selector}>{finding.selector}</span>
                  <span class={styles.show}>{t('defects.show')}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}

      {/* «Что проверять» — переключатель на каждое правило. */}
      <Collapsible
        label={t('defects.rules')}
        summary={rulesSummary}
        open={rulesOpen}
        onToggle={setRulesOpen}
      >
        <div class={styles.ruleList}>
          {DEFECT_RULES.map((rule) => (
            <Toggle
              key={rule.id}
              variant="plain"
              label={t(rule.messageKey)}
              checked={!disabledSet.has(rule.id)}
              onChange={() => {
                toggleRule(rule.id);
              }}
            />
          ))}
        </div>
      </Collapsible>

      {busy && (
        <Button variant="secondary" onClick={onCancel}>
          {t('defects.cancel')}
        </Button>
      )}
    </div>
  );
}
