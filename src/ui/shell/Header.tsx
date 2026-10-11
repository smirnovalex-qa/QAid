import type { JSX } from 'preact';
import { t } from '@/i18n';
import { cn } from '@/ui/cn';
import { BrandLogo, QAidWordmark, SearchIcon } from './icons';
import { ChevronLeftIcon, GearIcon, StarIcon } from './toolIcons';
import styles from './surface.module.css';

export interface HeaderLivePill {
  text: string;
  onClick: () => void;
}

export interface HeaderProps {
  /** home → бренд; иначе → назад + имя. */
  home: boolean;
  /** Заголовок tool/settings view. */
  title: string;
  /** Показывать pin-звезду (только tool-view). */
  showPin: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onBack: () => void;
  onSearch: () => void;
  onSettings: () => void;
  /** Живая пилюля (если есть активная сессия вне её инструмента). */
  live?: HeaderLivePill | null;
  /** Доп. кнопка справа (напр. «открыть side panel» в popup). */
  trailing?: JSX.Element | null;
}

/** Хедер поверхности v3 (52px). */
export function Header(props: HeaderProps): JSX.Element {
  const { home, title, showPin, pinned, live } = props;
  return (
    <header class={styles.header}>
      {home ? (
        <div class={styles.brand}>
          <BrandLogo size={24} />
          <QAidWordmark height={19} />
        </div>
      ) : (
        <>
          <button
            type="button"
            class={styles.backBtn}
            aria-label={t('shell.back')}
            title={t('shell.back')}
            onClick={props.onBack}
          >
            <ChevronLeftIcon />
          </button>
          <span class={styles.toolName}>{title}</span>
        </>
      )}

      <span class={styles.headSpacer} />

      {live ? (
        <button type="button" class={styles.livePill} onClick={live.onClick}>
          <span class={styles.liveDot} aria-hidden="true" />
          <span class={styles.livePillText}>{live.text}</span>
        </button>
      ) : null}

      {showPin ? (
        <button
          type="button"
          class={cn(styles.pinBtn, pinned && styles.pinBtnActive)}
          aria-pressed={pinned}
          aria-label={pinned ? t('shell.unpin') : t('shell.pinToHome')}
          title={pinned ? t('shell.unpin') : t('shell.pinToHome')}
          onClick={props.onTogglePin}
        >
          <StarIcon filled={pinned} />
        </button>
      ) : null}

      <button
        type="button"
        class={styles.iconBtn}
        aria-label={t('shell.searchTools')}
        title="⌘K"
        onClick={props.onSearch}
      >
        <SearchIcon />
      </button>
      <button
        type="button"
        class={styles.iconBtn}
        aria-label={t('shell.settings')}
        title={t('shell.settings')}
        onClick={props.onSettings}
      >
        <GearIcon />
      </button>
      {props.trailing ?? null}
    </header>
  );
}
