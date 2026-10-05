/**
 * Иконки оболочки редизайна.
 *
 * Иконки инструментов — моно-токены (короткий текст-глиф), у инспектора —
 * инлайновый SVG-курсор. `glyphIcon(token)` фабрикует компонент-глиф, чтобы
 * дескрипторы фич (`FeatureModule.icon`) оставались в `.ts` без JSX. Цвет/кегль
 * задаёт контейнер (рельс/strip/чип/палитра) — глиф наследует `currentColor`.
 */
import type { ComponentType, JSX } from 'preact';

/** Текст-глиф инструмента (`Ab`, `#`, `ts`, …). */
export function glyphIcon(token: string): ComponentType {
  function Glyph(): JSX.Element {
    return <>{token}</>;
  }
  Glyph.displayName = `Glyph(${token})`;
  return Glyph;
}

/** SVG-курсор инспектора (viewBox 16×16, fill: currentColor). */
export function InspectorCursorIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M3 3 L3 12.7 L5.7 10.1 L7.5 13.9 L9.2 13.1 L7.4 9.4 L11.1 9.4 Z" />
    </svg>
  );
}

/** Лупа (поиск / ⌘K). */
export function SearchIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.2" />
      <line x1="10.4" y1="10.4" x2="14" y2="14" stroke-linecap="round" />
    </svg>
  );
}

/** Слайдеры (настройки). Кружки-ползунки заливаются фоном поверхности. */
export function OptionsIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      aria-hidden="true"
    >
      <line x1="2" y1="5" x2="14" y2="5" />
      <line x1="2" y1="11" x2="14" y2="11" />
      <circle cx="10.5" cy="5" r="1.9" fill="var(--surface)" />
      <circle cx="5.5" cy="11" r="1.9" fill="var(--surface)" />
    </svg>
  );
}

/** «Открыть side panel» (⇲). */
export function SidePanelIcon(): JSX.Element {
  return <span aria-hidden="true">⇲</span>;
}

/** «Открепить на страницу» — карточка-окно со стрелкой наружу (TASK-062). */
export function DetachIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="4.5" width="9" height="8" rx="1.3" />
      <path d="M9 2.5 H13.5 V7" stroke-linecap="round" stroke-linejoin="round" />
      <line x1="13.3" y1="2.7" x2="8.6" y2="7.4" stroke-linecap="round" />
    </svg>
  );
}

/** Логотип: скруглённый квадрат --accent с белым квадратом внутри. */
export function BrandLogo(props: { size?: number }): JSX.Element {
  const size = props.size ?? 20;
  const inner = Math.round(size * 0.35);
  // Числовые значения Preact трактует как px.
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: 'var(--accent)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <span style={{ width: inner, height: inner, background: '#fff', borderRadius: 2 }} />
    </span>
  );
}
