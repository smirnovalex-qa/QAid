/**
 * UI фичи «Инспектор: линейка / измеритель» (TASK-018 · редизайн v3) — потребитель
 * инспекционного слоя (TASK-013), поверхность side panel.
 *
 * Три режима, все чисто переиспользуют существующий слой:
 *  1. «Два элемента» (ab): два `inspection/pick` → `logic.measureBetween`.
 *  2. «Box-model» (box): `inspection/pick` + `inspection/collect` (хук `useInspectedNode`).
 *  3. «Свободно» (free): долгоживущий `inspection/measure` (drag поверх страницы).
 *
 * Единицы px/rem, «Прилипание», копирование измерения (TASK-008), персист настроек.
 * Устойчивость к ошибкам/`busy`/«Отмена»/токен сессии сохранены. Живой режим зеркалится
 * в оболочку через `setToolStatus`.
 *
 * Представление перестроено к v3: сегмент режимов, сегмент единиц + свитч «Прилипание»,
 * единая основная кнопка с подсказкой под режим, и результат — строки A/B, большой W×H
 * или диаграмма box-model, плюс «Скопировать замер».
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, SegmentedControl, Switch } from '@/ui';
import { copyText } from '@/ui';
import { useToast } from '@/ui/components';
import { BoxModelDiagram, HierarchyNav, useInspectedNode } from '@/ui/inspection';
import { setToolStatus } from '@/ui/shell';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import {
  formatMeasurement,
  formatValue,
  formatVector,
  measureBetween,
} from '@/shared/inspection/ruler/logic';
import { RULER_INSPECTOR_ID } from '@/shared/inspection/ruler/collector';
import { DEFAULT_ROOT_PX } from '@/shared/inspection/ruler/types';
import type {
  BoxModel,
  DragMeasurement,
  Measurement,
  RulerMode,
  RulerUnits,
} from '@/shared/inspection/ruler/types';
import type { PickedElement } from '@/shared/inspection/types';
import { rulerBinding } from './settings';
import styles from './inspector-ruler.module.css';

/** Права инспектора: `scripting` + постоянный host-доступ ко всем http/https (ADR-0022). */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Брокер создаётся лениво при первом клике (не на импорте) — рендер остаётся чистым. */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Мягко валидирует снимок выбранного элемента (пересёк границу сред как `unknown`). */
function asPicked(value: unknown): PickedElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<PickedElement>;
  const rect: unknown = v.rect;
  if (typeof v.selector !== 'string' || typeof rect !== 'object' || rect === null) return null;
  return v as PickedElement;
}

/** Мягко валидирует результат свободного измерения (пересёк границу сред как `unknown`). */
function asDragMeasurement(value: unknown): DragMeasurement | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as { measurement?: unknown };
  const m = v.measurement;
  if (typeof m !== 'object' || m === null) return null;
  const d = m as Partial<DragMeasurement>;
  if (
    typeof d.dx !== 'number' ||
    typeof d.dy !== 'number' ||
    typeof d.width !== 'number' ||
    typeof d.height !== 'number' ||
    typeof d.length !== 'number' ||
    typeof d.angleDeg !== 'number'
  ) {
    return null;
  }
  return d as DragMeasurement;
}

/** Мягко валидирует box-model (данные пересекли границу сред как `unknown`). */
function asBoxModel(data: unknown): BoxModel | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<BoxModel>;
  if (
    d.rect === undefined ||
    d.content === undefined ||
    d.padding === undefined ||
    d.border === undefined ||
    d.margin === undefined
  ) {
    return null;
  }
  return d as BoxModel;
}

export function InspectorRulerPanel(): JSX.Element {
  const settings = useSettings(rulerBinding);
  const ready = settings.ready.value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [mode, setMode] = useState<RulerMode>(rulerBinding.value.value.mode);
  const [units, setUnits] = useState<RulerUnits>(rulerBinding.value.value.units);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(rulerBinding.value.value.snapEnabled);
  const [seeded, setSeeded] = useState(false);

  // Режим ab: два выбранных элемента.
  const [elemA, setElemA] = useState<PickedElement | null>(null);
  const [elemB, setElemB] = useState<PickedElement | null>(null);
  // Режим box: элемент + его box-model (поток осмотра ведёт общий хук).
  const boxInspected = useInspectedNode<BoxModel>({
    inspectorId: RULER_INSPECTOR_ID,
    parse: asBoxModel,
  });
  const boxData = boxInspected.data;
  // Режим free: последнее свободное (drag) измерение поверх страницы.
  const [drag, setDrag] = useState<DragMeasurement | null>(null);

  const { show } = useToast();

  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  const measureTabRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || seeded) return;
    setMode(rulerBinding.value.value.mode);
    setUnits(rulerBinding.value.value.units);
    setSnapEnabled(rulerBinding.value.value.snapEnabled);
    setSeeded(true);
  }, [ready, seeded]);

  // Живой режим (выбор/измерение) зеркалим в оболочку. Запись откладываем в микротаск,
  // чтобы синхронная запись в signal не вошла повторно в рендер Preact (тесты).
  const live = busy || boxInspected.busy || boxInspected.state !== null;
  useEffect(() => {
    queueMicrotask(() => {
      setToolStatus(
        'inspector-ruler',
        live ? { live: false, text: t('ruler.measuringStatus') } : null,
      );
    });
    return () => {
      queueMicrotask(() => {
        setToolStatus('inspector-ruler', null);
      });
    };
  }, [live]);

  const measurement: Measurement | null = useMemo(() => {
    if (elemA === null || elemB === null) return null;
    return measureBetween(elemA.rect, elemB.rect);
  }, [elemA, elemB]);

  const highlight = (selector: string): void => {
    const tabId = measureTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector }).catch(() => undefined);
  };

  /** Общий путь выбора: права → id вкладки → `inspection/pick`. */
  const pick = async (isCurrent: () => boolean): Promise<PickedElement | null> => {
    const granted = await getBroker().ensure(REQUIRED);
    if (!isCurrent()) return null;
    if (!granted) {
      setError(t('ruler.error.permissionDenied'));
      return null;
    }

    const tabId = await tabs.queryActive();
    if (!isCurrent()) return null;
    if (tabId === undefined) {
      setError(t('ruler.error.noTab'));
      return null;
    }
    activeTabRef.current = tabId;

    const res = await sendMessage('inspection/pick', { tabId });
    if (!isCurrent()) return null;
    if (!res.ok) {
      setError(
        res.error.messageKey !== undefined ? t(res.error.messageKey) : t('ruler.error.generic'),
      );
      return null;
    }

    const picked = asPicked(res.value);
    if (picked === null) {
      setError(t('ruler.error.cancelled'));
      return null;
    }
    measureTabRef.current = tabId;
    return picked;
  };

  const onPick = async (target: 'A' | 'B'): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const picked = await pick(isCurrent);
      if (!isCurrent() || picked === null) return;

      if (target === 'A') {
        setElemA(picked);
        setElemB(null);
        highlight(picked.selector);
        return;
      }
      setElemB(picked);
      highlight(picked.selector);
    } catch (e) {
      logger.error('inspector-ruler.pick', e);
      if (isCurrent()) setError(t('ruler.error.generic'));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        activeTabRef.current = null;
      }
    }
  };

  /** Свободная линейка (TASK-033): долгоживущий `inspection/measure` (drag). */
  const onMeasure = async (): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(t('ruler.error.permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('ruler.error.noTab'));
        return;
      }
      activeTabRef.current = tabId;

      const res = await sendMessage('inspection/measure', {
        tabId,
        snap: snapEnabled,
        snapThreshold: rulerBinding.value.value.snap,
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(
          res.error.messageKey !== undefined ? t(res.error.messageKey) : t('ruler.error.generic'),
        );
        return;
      }

      const parsed = asDragMeasurement(res.value);
      if (parsed === null) {
        setError(t('ruler.error.cancelled'));
        return;
      }
      setDrag(parsed);
    } catch (e) {
      logger.error('inspector-ruler.measure', e);
      if (isCurrent()) setError(t('ruler.error.generic'));
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
      const stop = mode === 'free' ? 'inspection/measureStop' : 'inspection/teardown';
      void sendMessage(stop, { tabId }).catch(() => undefined);
    }
  };

  const onCopy = (): void => {
    if (measurement === null) return;
    void copyText(formatMeasurement(measurement, units, DEFAULT_ROOT_PX)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const onCopyDrag = (): void => {
    if (drag === null) return;
    void copyText(formatVector(drag, units, DEFAULT_ROOT_PX)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const persistMode = (next: RulerMode): void => {
    setMode(next);
    void rulerBinding.update({ mode: next });
  };
  const persistUnits = (next: RulerUnits): void => {
    setUnits(next);
    void rulerBinding.update({ units: next });
  };
  const persistSnapEnabled = (next: boolean): void => {
    setSnapEnabled(next);
    void rulerBinding.update({ snapEnabled: next });
  };

  const fv = (px: number): string => formatValue(px, units, DEFAULT_ROOT_PX);

  const shownError =
    mode === 'box' ? (boxInspected.error !== '' ? t(boxInspected.error) : '') : error;
  const hint = t(`ruler.hint.${mode}`);

  /** Основное действие под текущий режим. */
  const primary = ((): JSX.Element => {
    if (mode === 'free') {
      return (
        <Button
          size="lg"
          block
          variant={busy ? 'live' : 'primary'}
          loading={false}
          onClick={() => {
            if (busy) onCancel();
            else void onMeasure();
          }}
        >
          {busy ? t('ruler.stop') : t('ruler.start')}
        </Button>
      );
    }
    if (mode === 'box') {
      return (
        <Button
          size="lg"
          block
          loading={boxInspected.busy}
          disabled={boxInspected.busy}
          onClick={() => {
            boxInspected.pick();
          }}
        >
          {boxData === null ? t('ruler.pickElement') : t('ruler.repickElement')}
        </Button>
      );
    }
    // ab: последовательный выбор A → B.
    const next: 'A' | 'B' = elemA === null || elemB !== null ? 'A' : 'B';
    const label =
      elemA === null ? t('ruler.start') : elemB !== null ? t('ruler.remeasure') : t('ruler.pickB');
    return (
      <Button
        size="lg"
        block
        loading={busy}
        disabled={busy}
        onClick={() => {
          void onPick(next);
        }}
      >
        {label}
      </Button>
    );
  })();

  return (
    <div class={styles.panel}>
      <SegmentedControl
        label={t('ruler.mode')}
        value={mode}
        onChange={(v) => {
          persistMode(v as RulerMode);
        }}
        options={[
          { value: 'ab', label: t('ruler.seg.pair') },
          { value: 'free', label: t('ruler.seg.free') },
          { value: 'box', label: t('ruler.seg.box') },
        ]}
      />

      <div class={styles.controlsRow}>
        <SegmentedControl
          size="sm"
          label={t('ruler.units')}
          value={units}
          onChange={(v) => {
            persistUnits(v as RulerUnits);
          }}
          options={[
            { value: 'px', label: t('ruler.units.px') },
            { value: 'rem', label: t('ruler.units.rem') },
          ]}
        />
        <span class={styles.spacer} />
        <label class={styles.switchRow}>
          <span class={styles.switchLabel}>{t('ruler.free.snap')}</span>
          <Switch
            checked={snapEnabled}
            aria-label={t('ruler.free.snap')}
            onChange={persistSnapEnabled}
          />
        </label>
      </div>

      {primary}
      <span class={styles.hint}>{hint}</span>

      {shownError !== '' && (
        <p role="alert" class={styles.error} data-testid="ruler-error">
          {shownError}
        </p>
      )}

      {mode === 'ab' && elemA !== null && (
        <div class={styles.card}>
          <div class={styles.abHead}>
            <span class={styles.tagA}>A</span>
            <span class={styles.abSel} data-testid="ruler-selector-a">
              {elemA.selector}
            </span>
            <span class={styles.tagB}>B</span>
            <span class={styles.abSel} data-testid="ruler-selector-b">
              {elemB?.selector ?? '—'}
            </span>
          </div>
          {measurement !== null && (
            <div data-testid="ruler-measurement">
              <dl class={styles.rows}>
                <Row k={t('ruler.row.vgap')} v={fv(measurement.gapY)} />
                <Row k={t('ruler.row.hoffset')} v={fv(measurement.gapX)} />
                <Row k={t('ruler.row.ledge')} v={fv(Math.abs(measurement.edges.left))} />
                <Row
                  k={t('ruler.row.centers')}
                  v={fv(Math.hypot(measurement.centerDelta.x, measurement.centerDelta.y))}
                />
              </dl>
              <Button variant="secondary" onClick={onCopy}>
                {t('ruler.copy')}
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === 'free' && drag !== null && (
        <div class={styles.card} data-testid="ruler-drag">
          <div class={styles.freeSize}>
            <div class={styles.freeCol}>
              <span class={styles.freeNum}>{fv(drag.width)}</span>
              <span class={styles.freeLabel}>{t('ruler.width')}</span>
            </div>
            <span class={styles.freeTimes}>×</span>
            <div class={styles.freeCol}>
              <span class={styles.freeNum} data-testid="ruler-drag-length">
                {fv(drag.height)}
              </span>
              <span class={styles.freeLabel}>{t('ruler.height')}</span>
            </div>
          </div>
          <Button variant="secondary" onClick={onCopyDrag}>
            {t('ruler.copy')}
          </Button>
        </div>
      )}

      {mode === 'box' && (
        <div class={styles.boxWrap} data-testid="ruler-box">
          {boxInspected.state !== null && (
            <HierarchyNav
              state={boxInspected.state}
              busy={boxInspected.busy}
              onStep={boxInspected.navigate}
            />
          )}
          {boxData !== null && (
            <div class={styles.card} data-testid="ruler-boxmodel">
              <p class={styles.boxSize}>
                {`${t('ruler.box.size')}: ${fv(boxData.rect.width)} × ${fv(boxData.rect.height)}`}
              </p>
              <BoxModelDiagram
                margin={boxData.margin}
                border={boxData.border}
                padding={boxData.padding}
                content={boxData.content}
                format={fv}
              />
            </div>
          )}
        </div>
      )}

      {(busy || boxInspected.busy || boxInspected.state !== null) && (
        <Button variant="secondary" onClick={mode === 'box' ? boxInspected.cancel : onCancel}>
          {t('ruler.cancel')}
        </Button>
      )}
    </div>
  );
}

/** Строка результата «метка · значение» (моно). */
function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <>
      <dt class={styles.rowKey}>{k}</dt>
      <dd class={styles.rowVal}>{v}</dd>
    </>
  );
}
