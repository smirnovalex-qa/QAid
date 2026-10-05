import type { JSX } from 'preact';
import { t } from '@/i18n';
import { Button } from '@/ui/components';
import { ToolIcon } from './toolIcons';
import styles from './surface.module.css';

export interface PopupFallbackProps {
  toolId: string;
  onOpenPanel: () => void;
}

/**
 * Экран «нужна боковая панель» для popup-only инструментов (живой захват
 * элементов невозможен в transient-popup). Сверено с правилом popup-fallback.
 */
export function PopupFallback(props: PopupFallbackProps): JSX.Element {
  return (
    <div class={styles.fallback}>
      <span class={styles.fallbackTile} aria-hidden="true">
        <ToolIcon id={props.toolId} />
      </span>
      <div class={styles.fallbackTitle}>{t('shell.panelTitle')}</div>
      <p class={styles.fallbackText}>{t('shell.panelBody')}</p>
      <div class={styles.fallbackBtn}>
        <Button block onClick={props.onOpenPanel}>
          {t('shell.openSidePanel')}
        </Button>
      </div>
    </div>
  );
}
