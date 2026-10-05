/**
 * UI инспектора шрифтов (TASK-016 · редизайн v3) — тонкий потребитель
 * инспекционного слоя.
 *
 * Два пути сбора, оба через постоянный host-доступ (ADR-0022): «Сканировать
 * страницу» (`inspection/scan`) и «Осмотреть элемент» (`inspection/pick` →
 * `inspection/collect`). Результат — список семейств с бейджем источника
 * (веб-шрифт / системный), образцом в этом семействе (локальный рендеринг),
 * размерами/начертаниями и «где используется» (клик → `inspection/highlight`).
 * Экспорт plain/JSON/CSV. Устойчивость к ошибкам/`busy`/«Отмена»/токен сессии —
 * как в эталоне (`inspector-probe`).
 *
 * Представление перестроено к v3: единое пустое состояние скана, мета-бар с
 * экспортом, карточка на каждое семейство (имя + бейдж + образец + мета + «где
 * используется»). Осмотр одного элемента сохранён как вторичное действие с полным
 * профилем и превью.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Badge, Button } from '@/ui/components';
import { useToast } from '@/ui/components';
import { HierarchyNav, useInspectedNode } from '@/ui/inspection';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { useSettings } from '@/shared/storage';
import { copyText } from '@/ui/clipboard';
import { logger } from '@/shared/logger';
import { t, locale } from '@/i18n';
import type { ExportFormat } from '@/shared/export/export';
import { FONTS_INSPECTOR_ID } from '@/shared/inspection/fonts/collector';
import {
  aggregateUsages,
  canonicalFamily,
  formatReport,
  sortUsages,
} from '@/shared/inspection/fonts/logic';
import type {
  FontSample,
  FontSource,
  FontUsage,
  FontsScanData,
} from '@/shared/inspection/fonts/types';
import { fontsBinding } from './settings';
import styles from './inspector-fonts.module.css';

/** Права инспектора: `scripting` + постоянный host-доступ ко всем http/https (ADR-0022). */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Брокер прав создаётся лениво при первом клике (не на рендере/импорте). */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Рантайм-гард сериализованного агрегата сборщика (данные приходят как `unknown`). */
function isScanData(u: unknown): u is FontsScanData {
  if (typeof u !== 'object' || u === null) return false;
  const d = u as Record<string, unknown>;
  return (
    Array.isArray(d.samples) &&
    Array.isArray(d.loadedFamilies) &&
    Array.isArray(d.faces) &&
    typeof d.fontsApiAvailable === 'boolean'
  );
}

/** CSS-значение `font-family` для превью: уже применённое (локальное) семейство. */
function cssFontFamily(family: string): string {
  if (family === '') return 'inherit';
  return `"${family.replaceAll('"', '')}", system-ui, sans-serif`;
}

/** Локализованная метка бейджа источника. */
function sourceBadge(source: FontSource): string {
  return t(`fonts.badge.${source}`);
}

/** Форматирует метку времени скана (HH:MM) в локали. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const EXPORT_FORMATS: readonly ExportFormat[] = ['plain', 'json', 'csv'];

type Mode = 'page' | 'element';

export function InspectorFontsPanel(): JSX.Element {
  const settings = useSettings(fontsBinding);
  const sort = settings.value.value.sort;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<FontsScanData | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const { show } = useToast();

  // Токен сессии сбора и вкладка активного выбора — как в эталонном инспекторе.
  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  const scanTabRef = useRef<number | null>(null);

  // Режим «Осмотреть элемент» + навигация по иерархии (TASK-052): общий поток ведёт хук.
  const inspected = useInspectedNode<FontsScanData>({
    inspectorId: FONTS_INSPECTOR_ID,
    parse: (d) => (isScanData(d) ? d : null),
  });

  useEffect(() => {
    if (inspected.data !== null) {
      setData(inspected.data);
      setMode('element');
      setScannedAt(Date.now());
    }
  }, [inspected.data]);

  const usages: FontUsage[] =
    data === null
      ? []
      : sortUsages(
          aggregateUsages(data.samples, new Set(data.loadedFamilies), data.fontsApiAvailable),
          sort,
        );

  // Профиль осматриваемого элемента — первый текст-несущий сэмпл поддерева.
  const profile: FontSample | undefined =
    data !== null && mode === 'element' ? data.samples[0] : undefined;

  /** Общий каркас безопасного запуска сбора (permission → tab → RPC). */
  const runCollection = async (
    collect: (tabId: number) => Promise<FontsScanData | null>,
    nextMode: Mode,
  ): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(t('fonts.error.permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('fonts.error.noTab'));
        return;
      }
      activeTabRef.current = tabId;

      const collected = await collect(tabId);
      if (!isCurrent()) return;
      if (collected === null) return; // отмена (Esc)/пустой выбор — молча

      setData(collected);
      setMode(nextMode);
      setScannedAt(Date.now());
      scanTabRef.current = tabId;
      show(t('fonts.picked'), { severity: 'success' });
    } catch (e) {
      logger.error('inspector-fonts.collect', e);
      if (isCurrent()) setError(t('fonts.error.generic'));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        activeTabRef.current = null;
      }
    }
  };

  const onScan = (): void => {
    void runCollection(async (tabId) => {
      const res = await sendMessage('inspection/scan', {
        tabId,
        inspectorId: FONTS_INSPECTOR_ID,
      });
      if (!res.ok) {
        setError(
          res.error.messageKey !== undefined ? t(res.error.messageKey) : t('fonts.error.generic'),
        );
        return null;
      }
      return isScanData(res.value.data) ? res.value.data : null;
    }, 'page');
  };

  const onInspect = (): void => {
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

  const onHighlight = (selector: string): void => {
    const tabId = scanTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector }).then((res) => {
      if (res.ok && !res.value.found) show(t('fonts.notFound'), { severity: 'info' });
    });
  };

  const onExport = (format: ExportFormat): void => {
    void copyText(formatReport(usages, format)).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const scanned = data !== null;
  const showCancel = busy || inspected.busy || inspected.state !== null;

  const inspectButton = (
    <Button
      variant="secondary"
      loading={inspected.busy}
      disabled={busy || inspected.busy}
      onClick={onInspect}
    >
      {t('fonts.inspect')}
    </Button>
  );

  if (!scanned) {
    return (
      <div class={styles.panel}>
        <p class={styles.intro}>{t('fonts.scanIntro')}</p>
        <Button size="lg" block loading={busy} disabled={busy || inspected.busy} onClick={onScan}>
          {busy ? t('scan.scanning') : t('scan.scanThis')}
        </Button>
        {inspectButton}
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
          <p role="alert" class={styles.error} data-testid="fonts-error">
            {error !== '' ? error : t(inspected.error)}
          </p>
        )}
        {showCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t('fonts.cancel')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div class={styles.panel}>
      <div class={styles.metaBar}>
        <span class={styles.meta} data-testid="fonts-summary">
          {t('scan.meta.fonts', { count: usages.length })}
          {scannedAt !== null ? ` · ${formatTime(scannedAt)}` : ''}
        </span>
        <div class={styles.exportGroup} role="group" aria-label={t('fonts.export')}>
          <span class={styles.exportLabel}>{t('fonts.export')}</span>
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              class={styles.ghost}
              disabled={usages.length === 0}
              onClick={() => {
                onExport(f);
              }}
            >
              {t(`fonts.export.${f}`)}
            </button>
          ))}
        </div>
        {inspectButton}
      </div>

      {(error !== '' || inspected.error !== '') && (
        <p role="alert" class={styles.error} data-testid="fonts-error">
          {error !== '' ? error : t(inspected.error)}
        </p>
      )}

      {inspected.state !== null && (
        <HierarchyNav
          state={inspected.state}
          busy={inspected.busy}
          onStep={inspected.navigate}
          onHoverTarget={onHighlight}
        />
      )}

      {!data.fontsApiAvailable && (
        <p role="status" class={styles.note}>
          {t('fonts.apiUnavailable')}
        </p>
      )}

      {profile !== undefined && <ElementProfile sample={profile} />}

      {usages.length === 0 ? (
        <p class={styles.note}>{t('fonts.noText')}</p>
      ) : (
        <div class={styles.families} data-testid="fonts-families">
          {usages.map((usage) => {
            const key = canonicalFamily(usage.family);
            const meta = [
              usage.sizes.join(' · '),
              usage.weights.join(' · '),
              ...(usage.styles.length > 0 ? [usage.styles.join(' · ')] : []),
            ]
              .filter((s) => s !== '')
              .join('  ·  ');
            return (
              <div class={styles.card} key={key} data-testid="fonts-card">
                <div class={styles.cardHead}>
                  <span class={styles.familyName}>{usage.family}</span>
                  <Badge tone={usage.source === 'web' ? 'accent' : 'neutral'}>
                    {sourceBadge(usage.source)}
                  </Badge>
                </div>
                <span class={styles.sample} style={{ fontFamily: cssFontFamily(usage.family) }}>
                  {t('fonts.sampleText')}
                </span>
                {meta !== '' && <span class={styles.cardMeta}>{meta}</span>}
                <span class={styles.uses}>{t('fonts.count', { count: usage.count })}</span>
                {usage.usages.length > 0 && (
                  <div class={styles.useList}>
                    {usage.usages.slice(0, 3).map((loc, i) => (
                      <button
                        key={`${loc.selector}-${String(i)}`}
                        type="button"
                        class={styles.useBtn}
                        title={t('fonts.highlight')}
                        onClick={() => {
                          onHighlight(loc.selector);
                        }}
                      >
                        {loc.selector}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <span class={styles.note}>{t('fonts.fontNote')}</span>

      {showCancel && (
        <Button variant="secondary" onClick={onCancel}>
          {t('fonts.cancel')}
        </Button>
      )}
    </div>
  );
}

/** Карточка полного профиля осматриваемого элемента + локальный образец-превью. */
function ElementProfile(props: { sample: FontSample }): JSX.Element {
  const s = props.sample;
  return (
    <div class={styles.profile} data-testid="fonts-profile">
      <h3 class={styles.profileTitle}>{t('fonts.profile')}</h3>
      <div class={styles.profileGrid}>
        <span class={styles.profileKey}>{t('fonts.profile.applied')}</span>
        <span class={styles.profileVal}>{s.family === '' ? '—' : s.family}</span>
        <span class={styles.profileKey}>{t('fonts.profile.chain')}</span>
        <span class={styles.profileVal}>{s.fallbackChain.join(', ')}</span>
        <span class={styles.profileKey}>{t('fonts.profile.size')}</span>
        <span class={styles.profileVal}>{s.fontSize}</span>
        <span class={styles.profileKey}>{t('fonts.profile.weight')}</span>
        <span class={styles.profileVal}>{s.fontWeight}</span>
        <span class={styles.profileKey}>{t('fonts.profile.lineHeight')}</span>
        <span class={styles.profileVal}>{s.lineHeight}</span>
      </div>
      <div class={styles.preview} style={{ fontFamily: cssFontFamily(s.family) }}>
        {t('fonts.previewText')}
      </div>
    </div>
  );
}
