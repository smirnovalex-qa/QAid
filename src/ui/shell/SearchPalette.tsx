import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '@/i18n';
import { cn } from '@/ui/cn';
import { Keycap } from '@/ui/components';
import { SearchIcon } from './icons';
import { ToolIcon } from './toolIcons';
import { TOOLS, searchTools, toolDescKey, toolNameKey } from './taxonomy';
import styles from './surface.module.css';

export interface SearchPaletteProps {
  onPick: (id: string) => void;
  onClose: () => void;
}

/** ⌘K-палитра (из инструмента): оверлей + карточка со списком всех инструментов. */
export function SearchPalette(props: SearchPaletteProps): JSX.Element {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const needle = q.trim();
  const resultIds = needle ? searchTools(needle) : TOOLS.map((tool) => tool.id);
  const results = resultIds
    .map((id) => TOOLS.find((tool) => tool.id === id))
    .filter((tool): tool is (typeof TOOLS)[number] => tool !== undefined);

  return (
    <div class={styles.palOverlay} onClick={props.onClose} role="presentation">
      <div
        class={styles.palCard}
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.searchTools')}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div class={styles.palHead}>
          <span class={styles.searchIcon} aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            class={styles.palInput}
            type="text"
            value={q}
            placeholder={t('shell.searchPlaceholder')}
            aria-label={t('shell.searchTools')}
            onInput={(e) => {
              setQ(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) props.onPick(results[0].id);
            }}
          />
          <Keycap>Esc</Keycap>
        </div>
        <div class={styles.palList}>
          {results.length > 0 ? (
            results.map((tool, i) => (
              <button
                key={tool.id}
                type="button"
                class={cn(styles.resultRow, i === 0 && needle !== '' && styles.resultFirst)}
                onClick={() => {
                  props.onPick(tool.id);
                }}
              >
                <span class={styles.catTile} aria-hidden="true">
                  <ToolIcon id={tool.id} />
                </span>
                <span class={styles.catText}>
                  <span class={styles.catName}>{t(toolNameKey(tool.id))}</span>
                  <span class={styles.catDesc}>{t(toolDescKey(tool.id))}</span>
                </span>
              </button>
            ))
          ) : (
            <p class={styles.empty}>{t('shell.noMatch')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
