/**
 * UI фичи «Инспектор: палитра цветов» (TASK-015 · редизайн v3) — тонкий потребитель
 * инспекционного слоя (TASK-013) поверх чистой `logic.ts`.
 *
 * Поток «Сканировать страницу» не изменён: жест → брокер прав (`scripting` + host ко
 * всем http/https, ADR-0022) → id активной вкладки → RPC `inspection/scan` (сборщик
 * `collectPalette`). «Пипетка» — прогрессивное улучшение: нативный `EyeDropper` при
 * доступности, иначе фолбэк на выбор элемента пикером + `inspection/collect`.
 * Устойчивость к ошибкам, индикатор занятости и токен сессии сохранены.
 *
 * Представление перестроено к v3: единое пустое состояние скана, мета-бар с экспортом,
 * сегмент HEX/RGB/HSL + «Пипетка», сетка свотчей 2-в-ряд (цветной блок с «N×»,
 * значение, «где используется»). Клик по свотчу — копирование; клик по «где
 * используется» — подсветка узла на странице.
 */
import { useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { Button, SegmentedControl, copyText } from '@/ui';
import { useToast } from '@/ui/components';
import { HierarchyNav, useInspectedNode } from '@/ui/inspection';
import { useSettings } from '@/shared/storage';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import type { ExportFormat } from '@/shared/export/export';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t, locale } from '@/i18n';
import {
  aggregatePalette,
  formatValue,
  paletteExport,
  parseColor,
  readableLabelColor,
  sortPalette,
} from '@/shared/inspection/palette/logic';
import { PALETTE_INSPECTOR_ID } from '@/shared/inspection/palette/collector';
import { paletteBinding } from './settings';
import type { ColorFormat, PaletteEntry, PaletteScanData } from '@/shared/inspection/palette/types';
import styles from './inspector-palette.module.css';

/** Права инспектора: `scripting` + постоянный host-доступ (ADR-0022). */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Ленивое создание брокера прав (слушатели `permissions.*` не нужны в тестах). */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Минимальная типизация нативного `EyeDropper` API (нет в стандартных DOM-типах). */
interface EyeDropperResult {
  readonly sRGBHex: string;
}
interface EyeDropperInstance {
  open(): Promise<EyeDropperResult>;
}
type EyeDropperCtor = new () => EyeDropperInstance;

/** Безопасно приводит `unknown` из RPC к {@link PaletteScanData} (свой же сборщик). */
function asPaletteData(raw: unknown): PaletteScanData {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    Array.isArray((raw as { entries?: unknown }).entries)
  ) {
    return raw as PaletteScanData;
  }
  return { entries: [], elements: 0 };
}

/** Форматирует метку времени скана (HH:MM) в локали. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const FORMAT_OPTIONS: readonly { value: ColorFormat; label: string }[] = [
  { value: 'hex', label: 'HEX' },
  { value: 'rgb', label: 'RGB' },
  { value: 'hsl', label: 'HSL' },
];
const EXPORT_FORMATS: readonly ExportFormat[] = ['plain', 'json', 'csv'];

export function InspectorPalettePanel(): JSX.Element {
  const settings = useSettings(paletteBinding);
  const ready = settings.ready.value;

  const [format, setFormatState] = useState<ColorFormat>(paletteBinding.value.value.format);
  const [sort, setSortState] = useState(paletteBinding.value.value.sort);
  const [seeded, setSeeded] = useState(false);

  // Восстанавливаем сохранённые формат/сортировку один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    setFormatState(paletteBinding.value.value.format);
    setSortState(paletteBinding.value.value.sort);
    setSeeded(true);
  }, [ready, seeded]);

  const [data, setData] = useState<PaletteScanData | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { show } = useToast();

  // Токен сессии выбора/скана: устаревший ответ не перетирает актуальный UI.
  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  const lastTabRef = useRef<number | null>(null);

  // Осмотр элемента + навигация по иерархии (TASK-052): фолбэк пипетки ведёт общий хук.
  const inspected = useInspectedNode<PaletteScanData>({
    inspectorId: PALETTE_INSPECTOR_ID,
    parse: (d) => asPaletteData(d),
  });

  useEffect(() => {
    if (inspected.data !== null) {
      setData(inspected.data);
      setScannedAt(Date.now());
    }
  }, [inspected.data]);

  const setFormat = (next: ColorFormat): void => {
    setFormatState(next);
    void paletteBinding.update({ format: next });
  };

  const entries = useMemo<PaletteEntry[]>(
    () => (data !== null ? sortPalette(data.entries, sort) : []),
    [data, sort],
  );

  /** Общая часть: права + активная вкладка. Возвращает tabId или null (с ошибкой). */
  const ensureTab = async (isCurrent: () => boolean): Promise<number | null> => {
    const granted = await getBroker().ensure(REQUIRED);
    if (!isCurrent()) return null;
    if (!granted) {
      setError(t('palette.error.permissionDenied'));
      return null;
    }
    const tabId = await tabs.queryActive();
    if (!isCurrent()) return null;
    if (tabId === undefined) {
      setError(t('palette.error.noTab'));
      return null;
    }
    return tabId;
  };

  const rpcError = (messageKey: string | undefined): void => {
    setError(messageKey !== undefined ? t(messageKey) : t('palette.error.generic'));
  };

  const onScan = async (): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const tabId = await ensureTab(isCurrent);
      if (tabId === null) return;
      activeTabRef.current = tabId;

      const res = await sendMessage('inspection/scan', {
        tabId,
        inspectorId: PALETTE_INSPECTOR_ID,
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        rpcError(res.error.messageKey);
        return;
      }
      lastTabRef.current = tabId;
      setData(asPaletteData(res.value.data));
      setScannedAt(Date.now());
    } catch (e) {
      logger.error('inspector-palette.scan', e);
      if (isCurrent()) setError(t('palette.error.generic'));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        activeTabRef.current = null;
      }
    }
  };

  const onEyedropper = async (): Promise<void> => {
    if (busy || inspected.busy) return;
    const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
    // Прогрессивное улучшение: нативный путь по пикселю под курсором (под жестом).
    if (ctor !== undefined) {
      try {
        const result = await new ctor().open();
        const rgba = parseColor(result.sRGBHex);
        if (rgba !== null) {
          setData({
            entries: aggregatePalette([
              { rgba, selector: t('palette.picked'), property: 'eyedropper' },
            ]),
            elements: 1,
          });
          setScannedAt(Date.now());
          show(t('palette.picked'), { severity: 'success' });
        }
      } catch (e) {
        // Отмена пользователем (Esc) или сбой API — тихо, UI не ломаем.
        logger.debug('inspector-palette.eyedropper', e);
      }
      return;
    }
    // Без нативного API — основной путь: выбор элемента пикером + навигация (общий хук).
    inspected.pick();
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

  const onSwatchCopy = (entry: PaletteEntry): void => {
    void copyText(formatValue(entry, format)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const onUsageClick = (selector: string): void => {
    const tabId = lastTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector }).catch(() => undefined);
  };

  const onExport = (exportFormat: ExportFormat): void => {
    if (entries.length === 0) return;
    void copyText(paletteExport(entries, exportFormat, format)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const scanned = data !== null;
  const showCancel = busy || inspected.busy || inspected.state !== null;

  // Pick from page / Eyedropper — переиспользуемая вторичная кнопка.
  const pickButton = (
    <Button
      variant="secondary"
      loading={inspected.busy}
      disabled={busy || inspected.busy}
      onClick={() => {
        void onEyedropper();
      }}
    >
      {t('palette.pickFromPage')}
    </Button>
  );

  if (!scanned) {
    return (
      <div class={styles.panel}>
        <p class={styles.intro}>{t('palette.scanIntro')}</p>
        <Button
          size="lg"
          block
          loading={busy}
          disabled={busy || inspected.busy}
          onClick={() => {
            void onScan();
          }}
        >
          {busy ? t('scan.scanning') : t('scan.scanThis')}
        </Button>
        {pickButton}
        {inspected.state !== null && (
          <HierarchyNav
            state={inspected.state}
            busy={inspected.busy}
            onStep={inspected.navigate}
            onHoverTarget={onUsageClick}
          />
        )}
        <span class={styles.note}>{t('scan.permNote')}</span>
        {(error !== '' || inspected.error !== '') && (
          <p role="alert" class={styles.error} data-testid="palette-error">
            {error !== '' ? error : t(inspected.error)}
          </p>
        )}
        {showCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('palette.cancel')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div class={styles.panel}>
      <div class={styles.metaBar}>
        <span class={styles.meta} data-testid="palette-summary">
          {t('scan.meta.palette', { count: entries.length })}
          {scannedAt !== null ? ` · ${formatTime(scannedAt)}` : ''}
        </span>
        <div class={styles.exportGroup} role="group" aria-label={t('palette.export')}>
          <span class={styles.exportLabel}>{t('palette.export')}</span>
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              class={styles.ghost}
              onClick={() => {
                onExport(f);
              }}
            >
              {t(`palette.export.${f}`)}
            </button>
          ))}
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

      <div class={styles.controlsRow}>
        <SegmentedControl
          size="sm"
          class={styles.fmt}
          label={t('palette.format')}
          value={format}
          onChange={(v) => {
            setFormat(v as ColorFormat);
          }}
          options={[...FORMAT_OPTIONS]}
        />
        {pickButton}
      </div>

      <span class={styles.hint}>{t('palette.palHint')}</span>

      {inspected.state !== null && (
        <HierarchyNav
          state={inspected.state}
          busy={inspected.busy}
          onStep={inspected.navigate}
          onHoverTarget={onUsageClick}
        />
      )}

      {(error !== '' || inspected.error !== '') && (
        <p role="alert" class={styles.error} data-testid="palette-error">
          {error !== '' ? error : t(inspected.error)}
        </p>
      )}

      {entries.length > 0 && (
        <div class={styles.grid} data-testid="palette-grid">
          {entries.map((entry) => {
            const value = formatValue(entry, format);
            const labelColor = readableLabelColor(entry.rgba);
            const where = entry.usages[0]?.selector ?? '';
            return (
              <div class={styles.cell} key={entry.hex}>
                <button
                  type="button"
                  class={styles.swatch}
                  data-testid="palette-swatch"
                  aria-label={t('palette.swatch.aria', { value, count: entry.count })}
                  onClick={() => {
                    onSwatchCopy(entry);
                  }}
                >
                  <span class={styles.block} style={{ background: entry.rgb, color: labelColor }}>
                    {`${String(entry.count)}×`}
                  </span>
                  <span class={styles.value}>{value}</span>
                </button>
                {where !== '' && (
                  <button
                    type="button"
                    class={styles.where}
                    title={t('palette.highlight')}
                    onClick={() => {
                      onUsageClick(where);
                    }}
                  >
                    {where}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCancel && (
        <Button variant="secondary" onClick={onCancel}>
          {t('palette.cancel')}
        </Button>
      )}
    </div>
  );
}
