/**
 * Единая поверхность QAnvil — v3 (модель Home → Tool). Одна и та же
 * поверхность рендерится в side panel и popup, адаптивно по размеру контейнера.
 * Структура: хедер · [Home | Tool | Settings] · ⌘K-палитра.
 *
 * Ядро не знает конкретных фич: каталог приходит из `taxonomy.ts`, тела — из
 * реестра по featureId через `LazyPanel`. Инструменты «только side panel»
 * (`PANEL_ONLY`) в transient-popup рендерят fallback «открыть side panel».
 */
import type { JSX } from 'preact';
import { allFeatures } from '@/features/registry';
import type { FeatureModule } from '@/features/registry';
import { browser, sidePanel, tabs } from '@/platform';
import { sendMessage } from '@/shared/messaging/bus';
import '@/shared/panel/messages'; // side-effect: регистрация контракта floating-panel/open
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useToast } from '@/ui/components';
import { DetachIcon, SidePanelIcon } from './icons';
import { Header } from './Header';
import { HomeView } from './HomeView';
import { SettingsView } from './SettingsView';
import { SearchPalette } from './SearchPalette';
import { PopupFallback } from './PopupFallback';
import { LazyPanel } from './LazyPanel';
import { useSurfaceState } from './useSurfaceState';
import { liveToolId, toolStatus } from './status';
import { PANEL_ONLY, toolNameKey } from './taxonomy';
import styles from './surface.module.css';

/** Открыть side panel текущего окна (только из пользовательского жеста). */
async function openSidePanel(): Promise<void> {
  try {
    const win = await browser.windows.getCurrent();
    if (win.id !== undefined) await sidePanel.open({ windowId: win.id });
  } catch (e) {
    logger.error('surface: open side panel', e);
  }
}

export interface QASurfaceProps {
  /**
   * Точка монтажа поверхности. `popup`/`sidepanel` — браузерные поверхности; `panel` —
   * откреплённая плавающая панель на странице (TASK-062): персистентна (не закрывается по
   * blur), поэтому `PANEL_ONLY`-инструменты в ней работают, а аффорданс открепления скрыт.
   */
  variant: 'popup' | 'sidepanel' | 'panel';
}

export function QASurface(props: QASurfaceProps): JSX.Element {
  const { variant } = props;
  const s = useSurfaceState(variant);
  const toast = useToast();
  const flash = (msg: string): void => {
    toast.show(msg);
  };

  const features = allFeatures();
  const feature: FeatureModule | undefined = features.find((f) => f.id === s.tool);

  const status = toolStatus.value;
  const live = liveToolId(status);
  const showPill = Boolean(live) && !(s.view === 'tool' && s.tool === live);

  const popupBlocked = variant === 'popup' && s.view === 'tool' && PANEL_ONLY.has(s.tool);

  /**
   * Открепить поверхность на страницу (TASK-062): под жестом инъектировать плавающую панель
   * в активную вкладку. Отказ (служебная страница / нет host-доступа) — локализованный тост
   * по коду ошибки (eager shell-строки, не зависят от ленивой загрузки инспекторских фич).
   */
  const detachToPage = async (): Promise<void> => {
    const tabId = await tabs.queryActive();
    if (tabId === undefined) {
      flash(t('shell.detach.noTab'));
      return;
    }
    const res = await sendMessage('floating-panel/open', { tabId });
    if (!res.ok) {
      const key =
        res.error.code === 'PRIVILEGED_PAGE'
          ? 'shell.detach.privileged'
          : res.error.code === 'PERMISSION_DENIED'
            ? 'shell.detach.permission'
            : 'shell.detach.error';
      flash(t(key));
    }
  };

  const onSearch = (): void => {
    if (s.view === 'home') {
      const el = document.getElementById('qatb-home-search');
      if (el)
        setTimeout(() => {
          el.focus();
        }, 0);
    } else {
      s.setPalOpen(true);
    }
  };

  // На странице панель уже «откреплена» — аффорданс открепления в ней скрыт; в popup/side
  // panel он ведёт на инъекцию плавающей панели в активную вкладку.
  const detachBtn =
    variant === 'panel' ? null : (
      <button
        type="button"
        class={styles.iconBtn}
        aria-label={t('shell.detach')}
        title={t('shell.detach')}
        onClick={() => {
          void detachToPage();
        }}
      >
        <DetachIcon />
      </button>
    );

  const openPanelBtn =
    variant === 'popup' ? (
      <button
        type="button"
        class={styles.iconBtn}
        aria-label={t('shell.openSidePanel')}
        title={t('shell.openSidePanel')}
        onClick={() => {
          void openSidePanel();
        }}
      >
        <SidePanelIcon />
      </button>
    ) : null;

  const trailing =
    detachBtn || openPanelBtn ? (
      <>
        {detachBtn}
        {openPanelBtn}
      </>
    ) : null;

  return (
    <div class={styles.surface}>
      <Header
        home={s.view === 'home'}
        title={s.view === 'settings' ? t('shell.settings') : s.tool ? t(toolNameKey(s.tool)) : ''}
        showPin={s.view === 'tool'}
        pinned={s.isPinned(s.tool)}
        onTogglePin={() => {
          s.togglePin(s.tool);
        }}
        onBack={s.goHome}
        onSearch={onSearch}
        onSettings={s.goSettings}
        live={
          showPill && live
            ? {
                text: status[live]?.text ?? '',
                onClick: () => {
                  s.open(live);
                },
              }
            : null
        }
        trailing={trailing}
      />

      <div class={styles.body}>
        {s.view === 'home' ? (
          <HomeView q={s.q} setQ={s.setQ} pins={s.pins} open={s.open} />
        ) : s.view === 'settings' ? (
          <SettingsView
            setLocalePersisted={s.setLocalePersisted}
            setThemePersisted={s.setThemePersisted}
            flash={flash}
          />
        ) : popupBlocked ? (
          <PopupFallback
            toolId={s.tool}
            onOpenPanel={() => {
              void openSidePanel();
            }}
          />
        ) : feature ? (
          <div class={styles.toolBody}>
            <LazyPanel key={feature.id} featureId={feature.id} load={feature.load} />
          </div>
        ) : (
          <p class={styles.empty}>{t('shell.empty')}</p>
        )}
      </div>

      {s.palOpen ? (
        <SearchPalette
          onPick={(id) => {
            s.open(id);
          }}
          onClose={() => {
            s.setPalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
