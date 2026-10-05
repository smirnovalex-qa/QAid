/**
 * Иконки инструментов и хрома оболочки — v3.
 *
 * Иконки инструментов — 16px line-SVG (stroke 1.5, round caps), заданы ПО id
 * фичи централизованно (как `_icon()` в макете), а не приходят из дескриптора
 * фичи: так добавление/переоформление инструмента не требует правок в 20
 * `index.ts` и не конфликтует с параллельной переработкой фич. Цвет наследуется
 * из контейнера (`currentColor`). Пути точно сверены с эталоном v3-дизайна.
 */
import type { JSX } from 'preact';

/** 16px line-иконки инструментов по featureId. */
const TOOL_PATHS: Record<string, string> = {
  'bug-report':
    'M5 4.5h6v6a3 3 0 0 1-6 0zM6 4.5a2 2 0 0 1 4 0M2.5 8H5M11 8h2.5M3 4.5l2 1.5M13 4.5l-2 1.5M3 12.5l2-1.5M13 12.5l-2-1.5',
  screenshot: 'M2 5.5h2.5L6 3.5h4l1.5 2H14v7.5H2zM8 11.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  'screen-recording': 'M1.8 4h9v8h-9zM10.8 7 14.2 5v6l-3.4-2',
  'inspector-probe': 'M3 2.5l9.5 4-4 1.5-1.5 4zM9 9l3.5 3.5',
  'defect-detector': 'M8 2.5 14 13H2zM8 6.5v3M8 11.2v.3',
  'inspector-contrast': 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 2.5v11',
  'inspector-ruler': 'M2 10.5 10.5 2 14 5.5 5.5 14zM5 7.5l1.5 1.5M7 5.5l1.5 1.5M9 3.5l1.5 1.5',
  'inspector-palette': 'M8 2.5s4.5 4.6 4.5 7.5a4.5 4.5 0 0 1-9 0C3.5 7.1 8 2.5 8 2.5z',
  'inspector-fonts': 'M3 13 6.5 3h1L11 13M4.4 9.5h5.2M11.5 9h3',
  'snapshot-diff': 'M2.5 3.5h5v9h-5zM8.5 3.5h5v9h-5z',
  'mock-network': 'M2.5 5.5h10L10 3M13.5 10.5h-10L6 13',
  'dom-override': 'M10.5 2.5l3 3-8 8H2.5v-3z',
  'storage-editor':
    'M3 4c0-1 2.2-1.6 5-1.6s5 .6 5 1.6v8c0 1-2.2 1.6-5 1.6S3 13 3 12zM3 4c0 1 2.2 1.6 5 1.6S13 5 13 4M3 8c0 1 2.2 1.6 5 1.6S13 9 13 8',
  'session-profiles':
    'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5c.6-2.5 2.6-3.8 5-3.8s4.4 1.3 5 3.8',
  forms: 'M2.5 2.5h11v4h-11zM2.5 9.5h11v4h-11zM4.5 4.5h3M4.5 11.5h5',
  environment: 'M5 1.8h6v12.4H5zM7.3 12h1.4',
  decoders: 'M5.5 3 2.5 8l3 5M10.5 3l3 5-3 5',
  'timestamp-hash': 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 5v3l2.2 1.4',
  'random-numbers': 'M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11M2 10.5h11',
  'random-strings': 'M2.5 4h11M2.5 8h7M2.5 12h9',
};

const SVG_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.5,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  'aria-hidden': true,
};

/** Иконка инструмента по id фичи (16px line). Fallback — пустой квадрат. */
export function ToolIcon(props: { id: string }): JSX.Element {
  const d = TOOL_PATHS[props.id];
  return (
    <svg {...SVG_PROPS}>
      {d ? <path d={d} /> : <rect x="3" y="3" width="10" height="10" rx="2" />}
    </svg>
  );
}

export function hasToolIcon(id: string): boolean {
  return id in TOOL_PATHS;
}

// ── хром оболочки (хедер, строки) ─────────────────────────────────────────────

/** Шеврон «назад» (‹). */
export function ChevronLeftIcon(): JSX.Element {
  return (
    <svg {...SVG_PROPS}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

/** Шеврон «вперёд/открыть» (›) — хвост строки каталога. */
export function ChevronRightIcon(): JSX.Element {
  return (
    <svg {...SVG_PROPS}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

/** Шестерёнка (настройки). */
export function GearIcon(): JSX.Element {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.6v1.8M8 12.6v1.8M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M1.6 8h1.8M12.6 8h1.8M3.5 12.5l1.3-1.3M11.2 4.8l1.3-1.3" />
    </svg>
  );
}

/** Звезда pin (контур/заливка по `filled`). */
export function StarIcon(props: { filled?: boolean }): JSX.Element {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 16 16"
      fill={props.filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width={1.5}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2.2l1.76 3.57 3.94.57-2.85 2.78.67 3.92L8 11.78l-3.52 1.85.67-3.92L2.3 6.94l3.94-.57z" />
    </svg>
  );
}
