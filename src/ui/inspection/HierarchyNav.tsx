/**
 * Шапка осматриваемого элемента + навигатор по DOM-иерархии (TASK-052 · редизайн
 * UI/UX) — единый «контекст выбранного узла», переиспользуемый всеми `inspector-*`.
 *
 * Анатомия (в стиле DevTools, но в палитре дизайн-системы):
 *  1. Идентичность узла: подсвеченный селектор `tag`/`#id`/`.class` + бейдж размеров
 *     `W × H` (+ опциональная «копировать селектор»).
 *  2. Breadcrumb-путь предков в ОДНУ прокручиваемую строку (клик по предку →
 *     `ancestorAtDepth`), текущий узел выделен.
 *  3. Компактный степпер: родитель ⌃ / первый ребёнок ⌄ / соседи `‹ n/m ›` — с
 *     disabled по `canAscend`/`canDescend`/границам соседей. Клавиатурные подсказки
 *     живут в `title`/`aria-label`, а не отдельным абзацем (меньше визуального шума).
 *
 * Сам по себе состояния не держит — это чистое представление {@link NavigationState};
 * шаги поднимаются наверх через `onStep`, фактическую навигацию (RPC/сессия/сборщик)
 * ведёт хук {@link useInspectedNode}. Клавиатурная навигация — тоже в хуке.
 */
import type { JSX } from 'preact';
import { t } from '@/i18n';
import { cn } from '@/ui/cn';
import { IconButton } from '@/ui/components';
import type { NavigationState, NavigationStep, NodeDescriptor } from '@/shared/inspection/types';
import styles from './HierarchyNav.module.css';

export interface HierarchyNavProps {
  /** Текущее состояние навигации (узел + breadcrumb + флаги). */
  state: NavigationState;
  /** Идёт ли шаг/сбор — блокирует контролы, чтобы не копить запросы. */
  busy?: boolean;
  /** Поднимает запрошенный шаг наверх (хук исполняет его как RPC-команду над якорем). */
  onStep: (step: NavigationStep, depth?: number) => void;
  /** Если задан — показывает кнопку «копировать селектор» текущего узла. */
  onCopySelector?: (selector: string) => void;
  /**
   * Обратная подсветка (TASK-056): вызывается при наведении/фокусе на крошку breadcrumb
   * с её селектором — фича подсвечивает соответствующий узел на странице. Фокус (a11y)
   * тоже триггерит, чтобы клавиатурная навигация работала наравне с мышью.
   */
  onHoverTarget?: (selector: string) => void;
  /** Показывать компактную клавиатурную подсказку под шапкой. По умолчанию — нет. */
  showHint?: boolean;
}

/** Короткая человекочитаемая метка узла для breadcrumb: `tag`, `tag#id` или `tag.class`. */
function crumbLabel(d: NodeDescriptor): string {
  if (d.id !== null && d.id !== '') return `${d.tagName}#${d.id}`;
  const cls = d.classNames[0];
  if (cls !== undefined && cls !== '') return `${d.tagName}.${cls}`;
  return d.tagName;
}

/** Максимум классов, показываемых в подсвеченной идентичности (остальное — `…`). */
const MAX_IDENTITY_CLASSES = 3;

/** Подсвеченная идентичность узла: `tag` + `#id` + `.class` разными токенами. */
function NodeSelector({ node }: { node: NodeDescriptor }): JSX.Element {
  const classes = node.classNames.slice(0, MAX_IDENTITY_CLASSES);
  const overflow = node.classNames.length - classes.length;
  return (
    <span class={styles.selector} data-testid="hierarchy-selector">
      <span class={styles.tag}>{node.tagName}</span>
      {node.id !== null && node.id !== '' && <span class={styles.id}>#{node.id}</span>}
      {classes.map((c) => (
        <span class={styles.cls} key={c}>
          .{c}
        </span>
      ))}
      {overflow > 0 && <span class={styles.clsMore}>+{overflow}</span>}
    </span>
  );
}

/** SVG-шеврон, ориентируемый классом (up/down/left/right). */
function Chevron({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }): JSX.Element {
  return (
    <svg class={cn(styles.chevron, styles[dir])} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5 6.5L8 9.5L11 6.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function HierarchyNav(props: HierarchyNavProps): JSX.Element {
  const { state, busy = false, onStep, onCopySelector, onHoverTarget, showHint = false } = props;
  const { node, path, canAscend, canDescend } = state;

  const canPrev = node.siblingIndex > 0;
  const canNext = node.siblingIndex >= 0 && node.siblingIndex < node.siblingCount - 1;
  const hasSiblings = node.siblingCount > 0 && node.siblingIndex >= 0;
  const width = Math.round(node.rect.width);
  const height = Math.round(node.rect.height);

  return (
    <nav
      class={styles.root}
      aria-label={t('inspection.nav.breadcrumb')}
      data-testid="hierarchy-nav"
    >
      {/* 1. Идентичность узла + размеры. */}
      <div class={styles.identity} data-testid="hierarchy-identity">
        <NodeSelector node={node} />
        <span class={styles.spacer} />
        <span
          class={styles.dims}
          data-testid="hierarchy-dimensions"
          title={t('inspection.node.sizeLabel')}
        >
          {t('inspection.node.size', { width, height })}
        </span>
        {onCopySelector !== undefined && (
          <IconButton
            size="sm"
            label={t('inspection.node.copySelector')}
            onClick={() => {
              onCopySelector(node.selector);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class={styles.copyIcon}>
              <rect
                x="5.5"
                y="5.5"
                width="8"
                height="8"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
              />
              <path
                d="M10.5 5.5V4A1.5 1.5 0 009 2.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
              />
            </svg>
          </IconButton>
        )}
      </div>

      {/* 2. Breadcrumb (одна прокручиваемая строка) + 3. степпер. */}
      <div class={styles.navRow}>
        <ol class={styles.breadcrumb}>
          {path.map((d, i) => {
            const isCurrent = i === path.length - 1;
            // Разрыв глубины (путь усечён с середины бюджетом) — рисуем многоточие.
            const gap = i > 0 && d.depth !== (path[i - 1]?.depth ?? d.depth - 1) + 1;
            return (
              <li class={styles.crumbItem} key={`${d.selector}-${String(d.depth)}`}>
                {gap ? (
                  <span class={styles.sep} aria-hidden="true" title={t('inspection.nav.truncated')}>
                    …
                  </span>
                ) : (
                  i > 0 && (
                    <span class={styles.sep} aria-hidden="true">
                      ›
                    </span>
                  )
                )}
                <button
                  type="button"
                  class={cn(styles.crumb, isCurrent && styles.crumbCurrent)}
                  data-testid="hierarchy-crumb"
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={t('inspection.nav.goTo', { selector: d.selector })}
                  disabled={isCurrent || busy}
                  onClick={() => {
                    if (!isCurrent) onStep('ancestorAtDepth', d.depth);
                  }}
                  onMouseEnter={() => onHoverTarget?.(d.selector)}
                  onFocus={() => onHoverTarget?.(d.selector)}
                >
                  {crumbLabel(d)}
                </button>
              </li>
            );
          })}
        </ol>

        <div class={styles.stepper} role="group" aria-label={t('inspection.nav.controls')}>
          <button
            type="button"
            class={styles.step}
            data-testid="hierarchy-parent"
            aria-label={t('inspection.nav.parent')}
            title={`${t('inspection.nav.parent')} · ↑`}
            disabled={!canAscend || busy}
            onClick={() => {
              onStep('parent');
            }}
          >
            <Chevron dir="up" />
          </button>
          <button
            type="button"
            class={styles.step}
            data-testid="hierarchy-child"
            aria-label={t('inspection.nav.child')}
            title={`${t('inspection.nav.child')} · ↓`}
            disabled={!canDescend || busy}
            onClick={() => {
              onStep('firstChild');
            }}
          >
            <Chevron dir="down" />
          </button>

          <span class={styles.siblings}>
            <button
              type="button"
              class={cn(styles.step, styles.stepEnd)}
              data-testid="hierarchy-prev"
              aria-label={t('inspection.nav.prevSibling')}
              title={`${t('inspection.nav.prevSibling')} · ←`}
              disabled={!canPrev || busy}
              onClick={() => {
                onStep('previousSibling');
              }}
            >
              <Chevron dir="left" />
            </button>
            <span class={styles.position} data-testid="hierarchy-position">
              {hasSiblings
                ? t('inspection.nav.position', {
                    index: node.siblingIndex + 1,
                    count: node.siblingCount,
                  })
                : '—'}
            </span>
            <button
              type="button"
              class={cn(styles.step, styles.stepEnd)}
              data-testid="hierarchy-next"
              aria-label={t('inspection.nav.nextSibling')}
              title={`${t('inspection.nav.nextSibling')} · →`}
              disabled={!canNext || busy}
              onClick={() => {
                onStep('nextSibling');
              }}
            >
              <Chevron dir="right" />
            </button>
          </span>
        </div>
      </div>

      {showHint && <p class={styles.hint}>{t('inspection.nav.hint')}</p>}
    </nav>
  );
}
