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

/**
 * Логотип QAid Grid: сетка 2×2 из скруглённых плиток (Cobalt · Sky · Deep ·
 * Amber) с Ink-галочкой в amber-ячейке. Бренд-цвета фиксированы (работают в
 * обеих темах), поэтому заданы литералами, а не токенами. `aria-hidden` —
 * рядом в хедере идёт wordmark с текстовой подписью (`QAidWordmark`).
 */
export function BrandLogo(props: { size?: number }): JSX.Element {
  const size = props.size ?? 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
      style={{ flex: 'none', display: 'block' }}
    >
      <rect x="6" y="6" width="54" height="54" rx="15" fill="#2F5BEA" />
      <rect x="68" y="6" width="54" height="54" rx="15" fill="#4C74F2" />
      <rect x="6" y="68" width="54" height="54" rx="15" fill="#2347CC" />
      <rect x="68" y="68" width="54" height="54" rx="15" fill="#FFB020" />
      <path
        d="M81 96 L91 106 L109 85"
        fill="none"
        stroke="#141A2E"
        stroke-width="9"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/**
 * Wordmark «QAid»: буквы наследуют `currentColor` (= --fg, работает в обеих
 * темах), хвост Q и квадратная точка над i фиксированы Amber. Высота задаётся
 * пропом; ширина пропорциональна (≈2.5×). `role="img"` + `aria-label` —
 * текстовая подпись бренда.
 */
export function QAidWordmark(props: { height?: number }): JSX.Element {
  const h = props.height ?? 19;
  const w = Math.round(h * 2.52); // viewBox 252×100 → соотношение ≈2.52
  return (
    <svg
      width={w}
      height={h}
      viewBox="10 10 252 100"
      fill="none"
      role="img"
      aria-label="QAid"
      style={{ flex: 'none', display: 'block', color: 'var(--fg)' }}
    >
      <circle
        cx="52"
        cy="59.75"
        r="29.75"
        stroke="currentColor"
        stroke-width="15"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M68 78 L86 96" stroke="#FFB020" stroke-width="15" stroke-linecap="round" />
      <path
        d="M110 89.5 L136 30 L162 89.5"
        stroke="currentColor"
        stroke-width="15"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M121 70 H151"
        stroke="currentColor"
        stroke-width="15"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M184 52 V89.5"
        stroke="currentColor"
        stroke-width="15"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect x="174" y="17" width="20" height="20" rx="6" fill="#FFB020" />
      <circle
        cx="228"
        cy="70.5"
        r="19"
        stroke="currentColor"
        stroke-width="15"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M247 26 V89.5"
        stroke="currentColor"
        stroke-width="15"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
