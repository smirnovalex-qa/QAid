/**
 * Панель вывода результата: readonly-область с прокруткой + встроенная кнопка
 * копирования. Единый UX результата для фич (PRD §10): значение видно, копия в
 * один клик с тостом. При отсутствии кастомного `onCopy` копирует `value` сам
 * через `useCopy`.
 */
import type { JSX } from 'preact';
import { IconButton } from '@/ui/components';
import { cn } from '@/ui/cn';
import { t } from '@/i18n';
import { useCopy } from '@/ui/clipboard/useCopy';
import styles from './output.module.css';

export interface OutputPanelProps {
  readonly value: string;
  readonly label?: string;
  /** Подсказка при пустом значении. По умолчанию `t('output.empty')`. */
  readonly emptyHint?: string;
  readonly count?: number;
  /** Моноширинный шрифт. По умолчанию true. */
  readonly monospace?: boolean;
  /** Кастомный обработчик копирования; при отсутствии копирует `value` сам. */
  readonly onCopy?: () => void;
  /** Показывать ли кнопку копирования. По умолчанию true. */
  readonly copyable?: boolean;
  readonly 'data-testid'?: string;
}

/** Иконка копирования (наследует currentColor). */
function CopyIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

export function OutputPanel(props: OutputPanelProps): JSX.Element {
  const {
    value,
    label,
    emptyHint = t('output.empty'),
    count,
    monospace = true,
    onCopy,
    copyable = true,
  } = props;
  const testId = props['data-testid'];

  const { copy } = useCopy();
  const isEmpty = value === '';

  const handleCopy = (): void => {
    if (onCopy) {
      onCopy();
      return;
    }
    void copy(value);
  };

  return (
    <div class={styles.root}>
      {(label !== undefined || count !== undefined || copyable) && (
        <div class={styles.head}>
          {label !== undefined && <span class={styles.label}>{label}</span>}
          <div class={styles.spacer} />
          {count !== undefined && (
            <span class={styles.count} data-testid={testId ? `${testId}-count` : undefined}>
              {count}
            </span>
          )}
          {copyable && (
            <IconButton label={t('action.copy')} size="sm" onClick={handleCopy}>
              <CopyIcon />
            </IconButton>
          )}
        </div>
      )}
      {isEmpty ? (
        <p class={styles.empty}>{emptyHint}</p>
      ) : (
        <textarea
          class={cn(styles.area, monospace && styles.mono)}
          readOnly
          value={value}
          {...(label !== undefined ? { 'aria-label': label } : {})}
          {...(testId !== undefined ? { 'data-testid': testId } : {})}
        />
      )}
    </div>
  );
}
