/**
 * UI фичи «Синк настроек и пресетов между устройствами» (TASK-029).
 *
 * Тумблер синка (opt-in) + предупреждение о приватности + чеклист синкаемых
 * пространств + статус (последняя синхронизация, маркер конфликта) + разрушительная
 * кнопка «выключить и очистить sync» (немодальный confirm). Квоты жёсткие: если
 * пространство не влезает — чекбокс блокируется с понятной причиной. Грациозная
 * деградация: без seam `sync` показываем нотис, локальный слой продолжает работать.
 *
 * Движок инжектится (`SettingsSyncView`) — так UI полностью тестируем с in-memory
 * портами; экспортируемая панель `SettingsSyncPanel` подставляет синглтон-движок.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, FeaturePanel } from '@/ui';
import { t, locale } from '@/i18n';
import { logger } from '@/shared/logger';
import { useSettings } from '@/shared/storage';
import { settingsSyncBinding } from './settings';
import { settingsSyncEngine } from './instance';
import type { SettingsSyncEngine } from './engine';
import { DEFAULT_NAMESPACE_META } from './types';
import type { NamespaceSyncMeta, QuotaCheck, SettingsSyncState, SyncOutcome } from './types';
import styles from './settings-sync.module.css';

interface SettingsSyncViewProps {
  readonly engine: SettingsSyncEngine;
}

/** Форматирует момент последней синхронизации в локаль пользователя. */
function formatTime(ms: number, loc: string): string {
  if (ms <= 0) return t('ss.never');
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? t('ss.never') : d.toLocaleString(loc);
}

export function SettingsSyncView(props: SettingsSyncViewProps): JSX.Element {
  const { engine } = props;
  const settings = useSettings(settingsSyncBinding);
  const state: SettingsSyncState = settings.value.value;
  const loc = locale.value;

  const available = engine.isAvailable();
  const namespaces = useMemo(() => engine.namespaces(), [engine]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcomes, setOutcomes] = useState<Record<string, SyncOutcome>>({});
  const [quotaBlocked, setQuotaBlocked] = useState<Record<string, QuotaCheck>>({});
  const [confirmDisable, setConfirmDisable] = useState(false);

  const sessionRef = useRef(0);

  const metaOf = (id: string): NamespaceSyncMeta => state.namespaces[id] ?? DEFAULT_NAMESPACE_META;

  /** Общий враппер: токен сессии, сброс ошибки, `busy` со сбросом в `finally`. */
  const run = async (fn: () => Promise<void>): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      logger.error('settings-sync', e);
      if (isCurrent()) setError(t('ss.errorGeneric'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /** Мержит мету одного namespace'а в персистентное состояние. */
  const writeMeta = (id: string, meta: NamespaceSyncMeta): Promise<void> => {
    const current = settingsSyncBinding.value.value.namespaces;
    return settingsSyncBinding.update({ namespaces: { ...current, [id]: meta } });
  };

  const recordOutcome = (outcome: SyncOutcome): void => {
    setOutcomes((prev) => ({ ...prev, [outcome.id]: outcome }));
  };

  /** Прогоняет синк одного namespace'а и персистит мету/исход. */
  const syncNamespace = async (id: string): Promise<void> => {
    const { outcome, meta } = await engine.syncOne(id, metaOf(id));
    recordOutcome(outcome);
    if (outcome.status !== 'quota' && outcome.status !== 'unavailable') {
      await writeMeta(id, meta);
      await settingsSyncBinding.update({ lastSyncAt: Date.now() });
    }
  };

  // Подписка на удалённые изменения: тянем изменившиеся выбранные пространства.
  // Выбор читаем из живого сигнала биндинга (не из замыкания) — чтобы не устаревал.
  useEffect(() => {
    if (!available || !state.enabled) return undefined;
    const off = engine.onRemoteChange((ids) => {
      const live = settingsSyncBinding.value.value.namespaces;
      const selected = ids.filter((id) => live[id]?.selected ?? false);
      if (selected.length === 0) return;
      void run(async () => {
        for (const id of selected) await syncNamespace(id);
      });
    });
    return off;
  }, [available, state.enabled, engine]);

  const onToggleEnabled = (next: boolean): void => {
    void settingsSyncBinding.update({ enabled: next });
  };

  const onAck = (next: boolean): void => {
    void settingsSyncBinding.update({ ack: next });
  };

  /** Отметить/снять пространство: проверка квоты при выборе, очистка sync при снятии. */
  const onToggleNamespace = (id: string, next: boolean): Promise<void> =>
    run(async () => {
      if (next) {
        const quota = await engine.estimate(id);
        if (!quota.fits) {
          setQuotaBlocked((prev) => ({ ...prev, [id]: quota }));
          recordOutcome({ id, status: 'quota', conflict: metaOf(id).conflict, quota });
          return;
        }
        setQuotaBlocked((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)),
        );
        await writeMeta(id, { ...metaOf(id), selected: true });
        await syncNamespace(id);
      } else {
        await engine.clear(id);
        await writeMeta(id, { ...DEFAULT_NAMESPACE_META, selected: false });
        setOutcomes((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
      }
    });

  const onSyncNow = (): Promise<void> =>
    run(async () => {
      for (const ns of namespaces) {
        if (metaOf(ns.id).selected) await syncNamespace(ns.id);
      }
    });

  /** Выключить синк и очистить все синкаемые данные из sync. */
  const onDisableAndClear = (): Promise<void> =>
    run(async () => {
      for (const ns of namespaces) await engine.clear(ns.id);
      await settingsSyncBinding.set({
        enabled: false,
        ack: state.ack,
        lastSyncAt: 0,
        namespaces: {},
      });
      setOutcomes({});
      setQuotaBlocked({});
      setConfirmDisable(false);
    });

  const statusText = (id: string): string => {
    const outcome = outcomes[id];
    return outcome !== undefined ? t(`ss.status.${outcome.status}`) : '';
  };

  const enableDisabled = !available || (!state.enabled && !state.ack);

  return (
    <FeaturePanel bare description={t('feature.settingsSync.desc')}>
      <div class={styles.panel} data-testid="settings-sync">
        {!available && (
          <p class={styles.status} role="status" data-testid="ss-unavailable">
            {t('ss.unavailable')}
          </p>
        )}

        {error !== '' && (
          <p role="alert" class={styles.error} data-testid="ss-error">
            {error}
          </p>
        )}

        <div class={styles.privacy}>
          <p class={styles.privacyTitle}>{t('ss.privacyTitle')}</p>
          <p class={styles.privacyText}>{t('ss.privacyWarning')}</p>
          <label class={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={state.ack}
              disabled={!available}
              onChange={(e) => {
                onAck(e.currentTarget.checked);
              }}
              data-testid="ss-ack"
            />
            {t('ss.ack')}
          </label>
        </div>

        <div class={styles.row}>
          <Button
            disabled={busy || enableDisabled}
            onClick={() => {
              onToggleEnabled(!state.enabled);
            }}
          >
            {state.enabled ? t('ss.disabledStatus') : t('ss.enable')}
          </Button>
          <span class={styles.status} role="status" aria-live="polite" data-testid="ss-status">
            {state.enabled ? t('ss.enabledStatus') : t('ss.disabledStatus')}
            {' · '}
            {t('ss.lastSync', { time: formatTime(state.lastSyncAt, loc) })}
          </span>
        </div>

        {state.enabled && (
          <>
            <p class={styles.status}>{t('ss.selectHint')}</p>
            <ul class={styles.list} data-testid="ss-namespaces">
              {namespaces.map((ns) => {
                const meta = metaOf(ns.id);
                const blocked = quotaBlocked[ns.id];
                return (
                  <li key={ns.id} class={styles.nsRow}>
                    <div class={styles.nsHead}>
                      <label class={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={meta.selected}
                          disabled={busy || (ns.readonly ?? false)}
                          onChange={(e) => {
                            void onToggleNamespace(ns.id, e.currentTarget.checked);
                          }}
                          data-testid={`ss-ns-${ns.id}`}
                        />
                        <span class={styles.nsLabel}>{t(ns.label)}</span>
                      </label>
                      {(ns.sensitive ?? false) && (
                        <span class={styles.badge}>{t('ss.sensitive')}</span>
                      )}
                      {(ns.readonly ?? false) && (
                        <span class={styles.badge}>{t('ss.readonly')}</span>
                      )}
                    </div>
                    {statusText(ns.id) !== '' && (
                      <span class={styles.nsMeta} data-testid={`ss-status-${ns.id}`}>
                        {statusText(ns.id)}
                      </span>
                    )}
                    {meta.conflict && (
                      <span class={styles.conflict} data-testid={`ss-conflict-${ns.id}`}>
                        {t('ss.conflictMarker')}
                      </span>
                    )}
                    {blocked !== undefined && (
                      <span class={styles.quota} data-testid={`ss-quota-${ns.id}`}>
                        {t(blocked.reason === 'items' ? 'ss.itemsExceeded' : 'ss.quotaExceeded', {
                          bytes: blocked.bytes,
                          limit: blocked.limit,
                        })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div class={styles.row}>
              <Button
                variant="secondary"
                loading={busy}
                disabled={busy}
                onClick={() => {
                  void onSyncNow();
                }}
              >
                {t('ss.syncNow')}
              </Button>
            </div>

            {confirmDisable ? (
              <div class={styles.confirm} role="alertdialog" aria-label={t('ss.disableAndClear')}>
                <p>{t('ss.confirmDisable')}</p>
                <div class={styles.confirmActions}>
                  <Button
                    variant="danger"
                    onClick={() => {
                      void onDisableAndClear();
                    }}
                  >
                    {t('ss.confirm')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirmDisable(false);
                    }}
                  >
                    {t('ss.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div class={styles.destructive}>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmDisable(true);
                  }}
                >
                  {t('ss.disableAndClear')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </FeaturePanel>
  );
}

/** Панель фичи с синглтон-движком (для дескриптора). */
export function SettingsSyncPanel(): JSX.Element {
  return <SettingsSyncView engine={settingsSyncEngine} />;
}
