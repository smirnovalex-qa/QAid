import type { JSX } from 'preact';
import { t } from '@/i18n';
import { cn } from '@/ui/cn';
import { Keycap } from '@/ui/components';
import { SearchIcon } from './icons';
import { ChevronRightIcon, ToolIcon } from './toolIcons';
import { toolStatus } from './status';
import {
  GROUP_ORDER,
  TOOLS,
  groupNameKey,
  searchTools,
  toolDescKey,
  toolNameKey,
} from './taxonomy';
import styles from './surface.module.css';

export interface HomeViewProps {
  q: string;
  setQ: (q: string) => void;
  pins: string[];
  open: (id: string) => void;
}

export function HomeView(props: HomeViewProps): JSX.Element {
  const { q, setQ, pins, open } = props;
  const results = searchTools(q);
  const status = toolStatus.value;
  const activeIds = Object.keys(status);
  const pinned = pins.filter((id) => TOOLS.some((tl) => tl.id === id));

  return (
    <div class={styles.home}>
      {/* поиск */}
      <div class={styles.searchField}>
        <span class={styles.searchIcon} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          id="qatb-home-search"
          class={styles.searchInput}
          type="text"
          value={q}
          placeholder={t('shell.searchPlaceholder')}
          aria-label={t('shell.searchTools')}
          onInput={(e) => {
            setQ(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) open(results[0]);
          }}
        />
        <Keycap>⌘K</Keycap>
      </div>

      {q.trim() ? (
        /* результаты поиска заменяют каталог */
        results.length > 0 ? (
          <div class={styles.results} role="listbox" aria-label={t('shell.searchTools')}>
            {results.map((id, i) => (
              <button
                key={id}
                type="button"
                role="option"
                data-tool={id}
                aria-selected={i === 0}
                class={cn(styles.resultRow, i === 0 && styles.resultFirst)}
                onClick={() => {
                  open(id);
                }}
              >
                <span class={styles.catTile} aria-hidden="true">
                  <ToolIcon id={id} />
                </span>
                <span class={styles.catText}>
                  <span class={styles.catName}>{t(toolNameKey(id))}</span>
                  <span class={styles.catDesc}>{t(toolDescKey(id))}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p class={styles.empty}>{t('shell.noMatch')}</p>
        )
      ) : (
        <>
          {/* активно на этой вкладке */}
          {activeIds.length > 0 ? (
            <section class={styles.section}>
              <div class={styles.sectionHead}>
                <span class={styles.sectionTitle}>{t('shell.activeNow')}</span>
              </div>
              <div class={styles.activeList}>
                {activeIds.map((id) => {
                  const st = status[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      data-tool={id}
                      class={styles.activeRow}
                      onClick={() => {
                        open(id);
                      }}
                    >
                      <span
                        class={styles.activeDot}
                        style={{ background: st?.live ? 'var(--danger)' : 'var(--accent)' }}
                        aria-hidden="true"
                      />
                      <span class={styles.activeName}>{t(toolNameKey(id))}</span>
                      <span class={styles.activeText}>{st?.text}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* закреплённые */}
          <section class={styles.section}>
            <div class={styles.sectionHead}>
              <span class={styles.sectionTitle}>{t('shell.pinned')}</span>
              <span class={styles.sectionHint}>{t('shell.pinHint')}</span>
            </div>
            {pinned.length > 0 ? (
              <div class={styles.pinGrid}>
                {pinned.map((id) => (
                  <button
                    key={id}
                    type="button"
                    data-tool={id}
                    class={styles.pinCard}
                    onClick={() => {
                      open(id);
                    }}
                  >
                    <span class={styles.pinTile} aria-hidden="true">
                      <ToolIcon id={id} />
                    </span>
                    <span class={styles.pinName}>{t(toolNameKey(id))}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {/* каталог */}
          {GROUP_ORDER.map((group) => {
            const tools = TOOLS.filter((tl) => tl.group === group);
            return (
              <section key={group} class={styles.group}>
                <h2 class={styles.groupHead}>{t(groupNameKey(group))}</h2>
                <div class={styles.catCard}>
                  {tools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      data-tool={tool.id}
                      class={styles.catRow}
                      onClick={() => {
                        open(tool.id);
                      }}
                    >
                      <span class={styles.catTile} aria-hidden="true">
                        <ToolIcon id={tool.id} />
                      </span>
                      <span class={styles.catText}>
                        <span class={styles.catName}>{t(toolNameKey(tool.id))}</span>
                        <span class={styles.catDesc}>{t(toolDescKey(tool.id))}</span>
                      </span>
                      <span class={styles.catChevron} aria-hidden="true">
                        <ChevronRightIcon />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
