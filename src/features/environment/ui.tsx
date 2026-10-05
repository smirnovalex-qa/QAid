/**
 * UI фичи «Device & location» (TASK-019) — редизайн v3 (side panel / popup).
 *
 * Презентация переписана под макет v3: строка сайта, сводка-бар
 * активных эмуляций с «Turn all off», и по карточке на канал (Device/Language/
 * Location/Time zone/Feature flags) — switch + текущее значение + пресет-чипы.
 * Логика сохранена: применение под жестом через брокер прав и RPC
 * `environment/apply` (DNR + MAIN-инъекция в background), снятие `environment/clear`,
 * query-флаги навигацией (`applyQueryProfile`), персист конфига в namespace и
 * зеркалирование статуса в оболочку (`setToolStatus`).
 */
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Alert, Button, Chip, Toggle, useToast } from '@/ui';
import { setToolStatus } from '@/ui/shell';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { cn } from '@/ui/cn';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import { applyQueryProfile, hasPageOverrides } from './logic';
import { GEO_PRESETS, LANGUAGE_PRESETS, TIMEZONE_PRESETS, USER_AGENT_PRESETS } from './presets';
import { environmentBinding } from './settings';
import {
  EMPTY_ENVIRONMENT_CONFIG,
  EMPTY_GEO,
  type EnvironmentConfig,
  type QueryFlag,
} from './types';
import styles from './environment.module.css';

/** Права эмуляции: `scripting` + постоянный host-доступ (переживает смену вкладок). */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Брокер создаётся лениво при первом клике (не на импорте). */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Пустой конфиг с независимыми ссылками (не мутируем импортированные константы). */
function freshEmptyConfig(): EnvironmentConfig {
  return { ...EMPTY_ENVIRONMENT_CONFIG, geo: { ...EMPTY_GEO } };
}

/** Специальный id гео-чипа «доступ запрещён» (режим error, код 1). */
const GEO_DENY = 'deny';

/** Пресеты фиче-флагов URL (key=value) — быстрый выбор одним кликом. */
const FLAG_PRESETS: { id: string; key: string; value: string }[] = [
  { id: 'newcheckout', key: 'new_checkout', value: '1' },
  { id: 'debug', key: 'debug', value: 'true' },
  { id: 'beta', key: 'beta', value: 'on' },
];

/** Хост активной вкладки для строки сайта. */
function useCurrentHost(): string {
  const [host, setHost] = useState('');
  useEffect(() => {
    const token = { alive: true };
    void (async () => {
      try {
        const id = await tabs.queryActive();
        if (id === undefined) return;
        const url = await tabs.getUrl(id);
        if (url === undefined || !token.alive) return;
        setHost(new URL(url).host);
      } catch {
        /* привилегированная страница — строку сайта не показываем */
      }
    })();
    return () => {
      token.alive = false;
    };
  }, []);
  return host;
}

function SiteLine(): JSX.Element | null {
  const host = useCurrentHost();
  if (host === '') return null;
  return (
    <div class={styles.siteLine}>
      <span class={styles.siteDot} aria-hidden="true" />
      <span class={styles.siteHost}>{host}</span>
      <span>{t('environment.currentTab')}</span>
    </div>
  );
}

export function EnvironmentPanel(): JSX.Element {
  const settings = useSettings(environmentBinding);
  const ready = settings.ready.value;
  const { show } = useToast();

  const [config, setConfig] = useState<EnvironmentConfig>(freshEmptyConfig);
  const [flags, setFlags] = useState<QueryFlag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Засеваем локальное состояние из сохранённых настроек один раз после загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    const s = environmentBinding.value.value;
    setConfig(s.config);
    setFlags(s.flags);
    setSeeded(true);
  }, [ready, seeded]);

  // --- Производные состояния каналов. ---
  const uaOn = config.userAgent !== null;
  const langOn = config.acceptLanguage !== null;
  const geoOn = config.geo.mode !== 'off';
  const tzOn = config.timezone !== null;
  const activeFlag = flags.find((f) => f.enabled && f.key.length > 0);
  const flagsOn = activeFlag !== undefined;
  const activeCount =
    Number(uaOn) + Number(langOn) + Number(geoOn) + Number(tzOn) + Number(flagsOn);

  // --- Зеркалирование статуса в оболочку (переживает перерендеры). ---
  // setToolStatus пишет в сигнал оболочки: вызов внутри teardown Preact (unmount)
  // повторно входит в reconciler и падает на `__k` → откладываем в микротаск.
  useEffect(() => {
    const next =
      activeCount > 0
        ? { live: false, text: t('environment.toolStatus', { count: activeCount }) }
        : null;
    queueMicrotask(() => {
      setToolStatus('environment', next);
    });
    return () => {
      queueMicrotask(() => {
        setToolStatus('environment', null);
      });
    };
  }, [activeCount]);

  // --- Применение полного конфига под жестом пользователя. ---
  const applyConfig = async (next: EnvironmentConfig): Promise<void> => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!granted) {
        setError(t('environment.error.permissionDenied'));
        return;
      }
      const tabId = await tabs.queryActive();
      if (tabId === undefined) {
        setError(t('environment.error.noTab'));
        return;
      }
      if (hasPageOverrides(next)) {
        const res = await sendMessage('environment/apply', { tabId, config: next });
        if (!res.ok) {
          setError(
            res.error.messageKey !== undefined
              ? t(res.error.messageKey)
              : t('environment.error.generic'),
          );
          return;
        }
        void environmentBinding.update({ enabled: true });
      } else {
        const res = await sendMessage('environment/clear', { tabId });
        if (!res.ok) {
          setError(
            res.error.messageKey !== undefined
              ? t(res.error.messageKey)
              : t('environment.error.generic'),
          );
          return;
        }
        void environmentBinding.update({ enabled: false });
      }
    } catch (e) {
      logger.error('environment.apply', e);
      setError(t('environment.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  /** Обновляет конфиг (локально + персист) и переприменяет эмуляцию. */
  const syncConfig = (next: EnvironmentConfig): void => {
    setConfig(next);
    void environmentBinding.update({ config: next });
    void applyConfig(next);
  };

  // --- Применение query-флагов навигацией вкладки. ---
  const syncFlags = async (next: QueryFlag[]): Promise<void> => {
    setFlags(next);
    void environmentBinding.update({ flags: next });
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!granted) {
        setError(t('environment.error.permissionDenied'));
        return;
      }
      const tabId = await tabs.queryActive();
      if (tabId === undefined) {
        setError(t('environment.error.noTab'));
        return;
      }
      const url = await tabs.getUrl(tabId);
      if (url === undefined) {
        setError(t('environment.error.noUrl'));
        return;
      }
      await tabs.navigate(tabId, applyQueryProfile(url, next));
      show(t('environment.flags.applied'), { severity: 'success' });
    } catch (e) {
      logger.error('environment.flags', e);
      setError(t('environment.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  // --- Снятие всех эмуляций. ---
  const turnAllOff = (): void => {
    const empty = freshEmptyConfig();
    setConfig(empty);
    void environmentBinding.update({ config: empty });
    if (flagsOn) void syncFlags(flags.map((f) => ({ ...f, enabled: false })));
    void applyConfig(empty);
  };

  // --- Хелперы выбора пресетов (обновляют конфиг + переприменяют). ---
  const pickUa = (ua: string): void => {
    syncConfig({ ...config, userAgent: config.userAgent === ua ? null : ua });
  };
  const toggleUa = (): void => {
    syncConfig({ ...config, userAgent: uaOn ? null : (USER_AGENT_PRESETS[0]?.userAgent ?? '') });
  };

  const pickLang = (lang: string): void => {
    syncConfig({ ...config, acceptLanguage: config.acceptLanguage === lang ? null : lang });
  };
  const toggleLang = (): void => {
    syncConfig({
      ...config,
      acceptLanguage: langOn ? null : (LANGUAGE_PRESETS[0]?.acceptLanguage ?? ''),
    });
  };

  const pickTz = (tz: string): void => {
    syncConfig({ ...config, timezone: config.timezone === tz ? null : tz });
  };
  const toggleTz = (): void => {
    syncConfig({ ...config, timezone: tzOn ? null : (TIMEZONE_PRESETS[0]?.timezone ?? '') });
  };

  const pickGeoCity = (lat: number, lng: number): void => {
    syncConfig({
      ...config,
      geo: { ...config.geo, mode: 'coords', latitude: lat, longitude: lng },
    });
  };
  const pickGeoDeny = (): void => {
    syncConfig({ ...config, geo: { ...config.geo, mode: 'error', errorCode: 1 } });
  };
  const toggleGeo = (): void => {
    if (geoOn) {
      syncConfig({ ...config, geo: { ...config.geo, mode: 'off' } });
    } else {
      const first = GEO_PRESETS[0];
      syncConfig({
        ...config,
        geo: {
          ...config.geo,
          mode: 'coords',
          latitude: first?.latitude ?? 0,
          longitude: first?.longitude ?? 0,
        },
      });
    }
  };

  const pickFlag = (preset: { key: string; value: string }): void => {
    const isActive = activeFlag?.key === preset.key && activeFlag.value === preset.value;
    void syncFlags(isActive ? [] : [{ key: preset.key, value: preset.value, enabled: true }]);
  };
  const toggleFlags = (): void => {
    if (flagsOn) {
      void syncFlags(flags.map((f) => ({ ...f, enabled: false })));
    } else {
      const first = FLAG_PRESETS[0];
      if (first) void syncFlags([{ key: first.key, value: first.value, enabled: true }]);
    }
  };

  // --- Текущее значение канала (sub-строка под заголовком). ---
  const offReal = t('environment.offReal');
  const uaPreset = USER_AGENT_PRESETS.find((p) => p.userAgent === config.userAgent);
  const langPreset = LANGUAGE_PRESETS.find((p) => p.acceptLanguage === config.acceptLanguage);
  const tzPreset = TIMEZONE_PRESETS.find((p) => p.timezone === config.timezone);
  const geoPreset = GEO_PRESETS.find(
    (p) => p.latitude === config.geo.latitude && p.longitude === config.geo.longitude,
  );
  const uaSub = !uaOn ? offReal : uaPreset ? t(uaPreset.labelKey) : (config.userAgent ?? '');
  const langSub = !langOn
    ? offReal
    : langPreset
      ? t(langPreset.labelKey)
      : (config.acceptLanguage ?? '');
  const tzSub = !tzOn ? offReal : tzPreset ? t(tzPreset.labelKey) : (config.timezone ?? '');
  const geoSub = !geoOn
    ? offReal
    : config.geo.mode === 'error'
      ? t('environment.geo.deny')
      : geoPreset
        ? t(geoPreset.labelKey)
        : `${String(config.geo.latitude)}, ${String(config.geo.longitude)}`;
  const flagsSub = activeFlag ? `${activeFlag.key}=${activeFlag.value}` : offReal;

  return (
    <div class={styles.root} data-testid="environment-panel">
      <SiteLine />

      {activeCount > 0 ? (
        <div class={styles.summary}>
          <span class={styles.summaryText}>{t('environment.summary', { count: activeCount })}</span>
          <Button variant="secondary" size="sm" disabled={busy} onClick={turnAllOff}>
            {t('environment.allOff')}
          </Button>
        </div>
      ) : null}

      {error !== '' ? (
        <Alert tone="danger" role="alert" class={styles.error}>
          {error}
        </Alert>
      ) : null}

      {/* ── Device (User-Agent) ──────────────────────────────────────────── */}
      <div class={cn(styles.card, uaOn && styles.cardOn)} data-testid="env-channel-ua">
        <Toggle
          variant="plain"
          class={styles.channelRow}
          label={t('environment.channel.ua')}
          help={uaSub}
          checked={uaOn}
          onChange={toggleUa}
        />
        {uaOn ? (
          <div class={styles.onBody}>
            <div class={styles.chipRow}>
              {USER_AGENT_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  pressed={config.userAgent === p.userAgent}
                  onClick={() => {
                    pickUa(p.userAgent);
                  }}
                >
                  {t(p.labelKey)}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Language ─────────────────────────────────────────────────────── */}
      <div class={cn(styles.card, langOn && styles.cardOn)} data-testid="env-channel-lang">
        <Toggle
          variant="plain"
          class={styles.channelRow}
          label={t('environment.channel.lang')}
          help={langSub}
          checked={langOn}
          onChange={toggleLang}
        />
        {langOn ? (
          <div class={styles.onBody}>
            <div class={styles.chipRow}>
              {LANGUAGE_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  pressed={config.acceptLanguage === p.acceptLanguage}
                  onClick={() => {
                    pickLang(p.acceptLanguage);
                  }}
                >
                  {t(p.labelKey)}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Location (geolocation) ───────────────────────────────────────── */}
      <div class={cn(styles.card, geoOn && styles.cardOn)} data-testid="env-channel-geo">
        <Toggle
          variant="plain"
          class={styles.channelRow}
          label={t('environment.channel.geo')}
          help={geoSub}
          checked={geoOn}
          onChange={toggleGeo}
        />
        {geoOn ? (
          <div class={styles.onBody}>
            <div class={styles.chipRow}>
              {GEO_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  pressed={
                    config.geo.mode === 'coords' &&
                    config.geo.latitude === p.latitude &&
                    config.geo.longitude === p.longitude
                  }
                  onClick={() => {
                    pickGeoCity(p.latitude, p.longitude);
                  }}
                >
                  {t(p.labelKey)}
                </Chip>
              ))}
              <Chip key={GEO_DENY} pressed={config.geo.mode === 'error'} onClick={pickGeoDeny}>
                {t('environment.geo.deny')}
              </Chip>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Time zone ────────────────────────────────────────────────────── */}
      <div class={cn(styles.card, tzOn && styles.cardOn)} data-testid="env-channel-tz">
        <Toggle
          variant="plain"
          class={styles.channelRow}
          label={t('environment.channel.tz')}
          help={tzSub}
          checked={tzOn}
          onChange={toggleTz}
        />
        {tzOn ? (
          <div class={styles.onBody}>
            <div class={styles.chipRow}>
              {TIMEZONE_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  pressed={config.timezone === p.timezone}
                  onClick={() => {
                    pickTz(p.timezone);
                  }}
                >
                  {t(p.labelKey)}
                </Chip>
              ))}
            </div>
            <p class={styles.note}>{t('environment.tzNote')}</p>
          </div>
        ) : null}
      </div>

      {/* ── Feature flags in URL ─────────────────────────────────────────── */}
      <div class={cn(styles.card, flagsOn && styles.cardOn)} data-testid="env-channel-flags">
        <Toggle
          variant="plain"
          class={styles.channelRow}
          label={t('environment.channel.flags')}
          help={flagsSub}
          checked={flagsOn}
          onChange={toggleFlags}
        />
        {flagsOn ? (
          <div class={styles.onBody}>
            <div class={styles.chipRow}>
              {FLAG_PRESETS.map((p) => (
                <Chip
                  key={p.id}
                  pressed={activeFlag.key === p.key && activeFlag.value === p.value}
                  onClick={() => {
                    pickFlag(p);
                  }}
                >
                  {`${p.key}=${p.value}`}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <p class={styles.footer}>{t('environment.footerNote')}</p>
    </div>
  );
}
