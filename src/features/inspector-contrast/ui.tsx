/**
 * UI фичи «Инспектор: контраст WCAG» (TASK-014 · редизайн v3) — потребитель
 * инспекционного слоя (TASK-013), поверхность side panel / popup.
 *
 * Поток скана не изменён: клик «Сканировать страницу» (жест) → брокер прав
 * (`scripting` + host ко всем http/https) → id активной вкладки → RPC
 * `inspection/scan`. Устойчивость к ошибкам, индикатор занятости со сбросом в
 * `finally`, «Отмена» и токен сессии против устаревших ответов сохранены.
 *
 * Фильтрация (уровень AA/AAA, «только проблемы») — РЕАКТИВНАЯ, без повторного скана:
 * тот же массив образцов переклассифицируется чистой `logic.ts`. Клик по строке →
 * `inspection/highlight`. Экспорт plain/JSON/CSV через `logic.buildReport`. Настройки
 * персистятся (namespace `inspector-contrast`).
 *
 * Представление перестроено к v3-дизайну «Осмотр страницы»: единое пустое состояние
 * скана (интро + «Сканировать страницу» + примечание о доступе), после скана — мета-бар
 * (N · время + Экспорт + «Пересканировать»), сегмент AA/AAA, свитч «Только проблемы»,
 * три плитки-итога (не проходят / проходят / на картинках) и строки со свотчем «Aa» в
 * реальных цветах, селектором, коэффициентом и бейджем. Осмотр одного узла с навигацией
 * по иерархии (хук `useInspectedNode`) сохранён как вторичное действие.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Badge, Button, SegmentedControl, Switch } from '@/ui';
import { copyText } from '@/ui';
import { HierarchyNav, useInspectedNode } from '@/ui/inspection';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { toRgba } from '@/shared/inspection/dom';
import { cn } from '@/ui/cn';
import type { ExportFormat } from '@/shared/export/export';
import { t, locale } from '@/i18n';
import { useToast } from '@/ui/components';
import { useSettings } from '@/shared/storage';
import {
  buildReport,
  classify,
  filterSamples,
  roundRatio,
  summarize,
  threshold,
  toReportRows,
} from '@/shared/inspection/contrast/logic';
import type {
  ContrastSample,
  ContrastScanData,
  TextTypeFilter,
  WcagLevel,
} from '@/shared/inspection/contrast/types';
import { contrastBinding } from './settings';
import { CONTRAST_INSPECTOR_ID } from '@/shared/inspection/contrast/collector';
import styles from './inspector-contrast.module.css';

/**
 * Права инспектора: `scripting` + постоянный host-доступ ко всем http/https-страницам
 * (не `activeTab`: панель обязана переживать переключение вкладок, ADR-0022). Оба
 * запрашиваются одним `permissions.request` под жестом.
 */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Брокер создаётся лениво при первом клике (не на импорте) — рендер остаётся чистым. */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Мягко валидирует ответ сборщика (данные пересекли границу сред как `unknown`). */
function asScanData(data: unknown): ContrastScanData | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<ContrastScanData>;
  if (!Array.isArray(d.samples)) return null;
  return {
    samples: d.samples as ContrastSample[],
    visited: typeof d.visited === 'number' ? d.visited : d.samples.length,
    budget: typeof d.budget === 'number' ? d.budget : 0,
    truncated: d.truncated === true,
  };
}

/** Форматирует метку времени скана в локальном коротком виде (HH:MM). */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function InspectorContrastPanel(): JSX.Element {
  const settings = useSettings(contrastBinding);
  const ready = settings.ready.value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [data, setData] = useState<ContrastScanData | null>(null);

  // Осмотр элемента + навигация по иерархии (TASK-052) — вторичный путь; общий поток
  // (права/сессия/pick/navigate/collect/teardown) ведёт хук.
  const inspected = useInspectedNode<ContrastScanData>({
    inspectorId: CONTRAST_INSPECTOR_ID,
    parse: asScanData,
  });

  // Фильтры — локальное состояние, засеянное из настроек и персистящееся при смене.
  const [level, setLevel] = useState<WcagLevel>(contrastBinding.value.value.level);
  const [textType, setTextType] = useState<TextTypeFilter>(contrastBinding.value.value.textType);
  const [onlyFails, setOnlyFails] = useState(contrastBinding.value.value.onlyFails);
  const [seeded, setSeeded] = useState(false);

  const { show } = useToast();

  // Токен сессии скана: устаревший ответ игнорируется, «Отмена» инвалидирует.
  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  // Вкладка последнего успешного скана — адрес для подсветки узлов по клику.
  const scanTabRef = useRef<number | null>(null);

  // Восстанавливаем сохранённые фильтры один раз после первой загрузки настроек.
  useEffect(() => {
    if (!ready || seeded) return;
    setLevel(contrastBinding.value.value.level);
    setTextType(contrastBinding.value.value.textType);
    setOnlyFails(contrastBinding.value.value.onlyFails);
    setSeeded(true);
  }, [ready, seeded]);

  // Результат осмотра узла → общий стейт результатов (та же таблица/фильтры, что у скана).
  useEffect(() => {
    if (inspected.data !== null) {
      setData(inspected.data);
      setScanned(true);
      setScannedAt(Date.now());
    }
  }, [inspected.data]);

  const samples = data?.samples ?? [];

  const filtered = useMemo(
    () => filterSamples(samples, { level, textType, onlyFails }),
    [samples, level, textType, onlyFails],
  );
  const summary = useMemo(() => summarize(samples, level), [samples, level]);
  const counts = useMemo(() => {
    let fail = 0;
    let pass = 0;
    let approx = 0;
    for (const s of samples) {
      if (s.approximate) approx += 1;
      else if (classify(s, level) === 'fail') fail += 1;
      else pass += 1;
    }
    return { fail, pass, approx };
  }, [samples, level]);

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
        setError(t('contrast.error.permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('contrast.error.noTab'));
        return;
      }
      activeTabRef.current = tabId;

      const res = await sendMessage('inspection/scan', {
        tabId,
        inspectorId: CONTRAST_INSPECTOR_ID,
      });
      if (!isCurrent()) return;

      if (!res.ok) {
        setError(
          res.error.messageKey !== undefined
            ? t(res.error.messageKey)
            : t('contrast.error.generic'),
        );
        return;
      }

      const parsed = asScanData(res.value.data);
      if (parsed === null) {
        setError(t('contrast.error.generic'));
        return;
      }
      scanTabRef.current = tabId;
      setData(parsed);
      setScanned(true);
      setScannedAt(Date.now());
    } catch (e) {
      logger.error('inspector-contrast.scan', e);
      if (isCurrent()) setError(t('contrast.error.generic'));
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
    inspected.cancel();
    if (tabId !== null) {
      void sendMessage('inspection/teardown', { tabId }).catch(() => undefined);
    }
  };

  const persist = (
    patch: Partial<{ level: WcagLevel; textType: TextTypeFilter; onlyFails: boolean }>,
  ): void => {
    void contrastBinding.update(patch);
  };

  const onHighlight = (selector: string): void => {
    const tabId = scanTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector })
      .then((res) => {
        if (!res.ok || !res.value.found) {
          show(t('contrast.notFound'), { severity: 'info' });
        }
      })
      .catch(() => {
        show(t('contrast.notFound'), { severity: 'info' });
      });
  };

  const onExport = (format: ExportFormat): void => {
    const report = buildReport(toReportRows(filtered, level), format);
    void copyText(report).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const scanBusy = busy;
  const showCancel = busy || inspected.busy;

  // Пустое состояние скана: единый паттерн «Осмотр страницы».
  if (!scanned) {
    return (
      <div class={styles.panel}>
        <p class={styles.intro}>{t('contrast.scanIntro')}</p>
        <Button
          size="lg"
          block
          loading={scanBusy}
          disabled={scanBusy || inspected.busy}
          onClick={() => {
            void onScan();
          }}
        >
          {scanBusy ? t('scan.scanning') : t('scan.scanThis')}
        </Button>
        <button
          type="button"
          class={styles.inspectLink}
          disabled={inspected.busy}
          onClick={() => {
            inspected.pick();
          }}
        >
          {t('contrast.inspect')}
        </button>
        {inspected.state !== null && (
          <HierarchyNav
            state={inspected.state}
            busy={inspected.busy}
            onStep={inspected.navigate}
            onHoverTarget={onHighlight}
          />
        )}
        <span class={styles.note}>{t('scan.permNote')}</span>
        {(error !== '' || inspected.error !== '') && (
          <p role="alert" class={styles.error} data-testid="contrast-error">
            {error !== '' ? error : t(inspected.error)}
          </p>
        )}
        {showCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('contrast.cancel')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div class={styles.panel}>
      {/* Мета-бар: сколько и когда + экспорт + пересканировать. */}
      <div class={styles.metaBar}>
        <span class={styles.meta} data-testid="contrast-summary">
          {t('scan.meta.contrast', { count: samples.length })}
          {scannedAt !== null ? ` · ${formatTime(scannedAt)}` : ''}
        </span>
        <div class={styles.exportGroup} role="group" aria-label={t('contrast.export')}>
          <span class={styles.exportLabel}>{t('contrast.export')}</span>
          <button
            type="button"
            class={styles.ghost}
            onClick={() => {
              onExport('plain');
            }}
          >
            {t('contrast.export.plain')}
          </button>
          <button
            type="button"
            class={styles.ghost}
            onClick={() => {
              onExport('json');
            }}
          >
            {t('contrast.export.json')}
          </button>
          <button
            type="button"
            class={styles.ghost}
            onClick={() => {
              onExport('csv');
            }}
          >
            {t('contrast.export.csv')}
          </button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={scanBusy}
          disabled={scanBusy}
          onClick={() => {
            void onScan();
          }}
        >
          {t('scan.again')}
        </Button>
      </div>

      {/* Сегмент уровня + свитч «только проблемы». */}
      <div class={styles.controlsRow}>
        <SegmentedControl
          size="sm"
          label={t('contrast.level')}
          value={level}
          onChange={(v) => {
            const next = v as WcagLevel;
            setLevel(next);
            persist({ level: next });
          }}
          options={[
            { value: 'AA', label: t('contrast.level.aa') },
            { value: 'AAA', label: t('contrast.level.aaa') },
          ]}
        />
        <span class={styles.spacer} />
        <label class={styles.switchRow}>
          <span class={styles.switchLabel}>{t('contrast.onlyFail')}</span>
          <Switch
            checked={onlyFails}
            aria-label={t('contrast.onlyFail')}
            onChange={(next) => {
              setOnlyFails(next);
              persist({ onlyFails: next });
            }}
          />
        </label>
      </div>

      {/* Три плитки-итога. */}
      <div class={styles.tiles}>
        <div class={cn(styles.tile, styles.tileFail)}>
          <span class={styles.tileNum}>{counts.fail}</span>
          <span class={styles.tileLabel}>{t('contrast.tile.fail')}</span>
        </div>
        <div class={cn(styles.tile, styles.tilePass)}>
          <span class={styles.tileNum}>{counts.pass}</span>
          <span class={styles.tileLabel}>{t('contrast.tile.pass')}</span>
        </div>
        <div class={cn(styles.tile, styles.tileApprox)}>
          <span class={styles.tileNum}>{counts.approx}</span>
          <span class={styles.tileLabel}>{t('contrast.tile.approx')}</span>
        </div>
      </div>

      {inspected.state !== null && (
        <HierarchyNav
          state={inspected.state}
          busy={inspected.busy}
          onStep={inspected.navigate}
          onHoverTarget={onHighlight}
        />
      )}

      {(error !== '' || inspected.error !== '') && (
        <p role="alert" class={styles.error} data-testid="contrast-error">
          {error !== '' ? error : t(inspected.error)}
        </p>
      )}

      {data?.truncated === true && (
        <p class={styles.meta}>
          {t('contrast.truncated', { visited: data.visited, budget: data.budget })}
        </p>
      )}

      {filtered.length === 0 ? (
        <p class={styles.meta}>{t('contrast.noResults')}</p>
      ) : (
        <div class={styles.list} aria-label={t('contrast.list')} data-testid="contrast-list">
          {filtered.map((s, i) => {
            const status = classify(s, level);
            const ratio = roundRatio(s.ratio);
            const required = threshold(level, s.large);
            const tone = s.approximate ? 'warning' : status === 'fail' ? 'danger' : 'success';
            const verdict = s.approximate
              ? t('contrast.badge.approx')
              : status === 'fail'
                ? t('contrast.badge.fail')
                : t('contrast.badge.pass');
            return (
              <button
                key={`${s.selector}-${String(i)}`}
                type="button"
                class={styles.row}
                data-testid="contrast-row"
                title={t('contrast.highlightHint')}
                onClick={() => {
                  onHighlight(s.selector);
                }}
              >
                <span
                  class={styles.sample}
                  style={{ color: toRgba(s.fg), background: toRgba(s.bg) }}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span class={styles.rowBody}>
                  <span class={styles.rowText}>{s.text}</span>
                  <span class={styles.rowMeta}>
                    {s.selector}
                    {s.large ? ` · ${t('contrast.large')}` : ''}
                  </span>
                </span>
                <span class={styles.rowRight}>
                  <span class={styles.ratio}>{`${String(ratio)}:1`}</span>
                  <Badge tone={tone}>{verdict}</Badge>
                  <span
                    class={styles.srOnly}
                  >{`${t('contrast.required')} ${String(required)}`}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {showCancel && (
        <Button variant="secondary" onClick={onCancel}>
          {t('contrast.cancel')}
        </Button>
      )}

      {/* Итог для скринридеров (цвет — не единственный сигнал). */}
      <p class={styles.srOnly} role="status" aria-live="polite">
        {t('contrast.summary', { pass: summary.pass, fail: summary.fail, total: summary.total })}
      </p>
    </div>
  );
}
