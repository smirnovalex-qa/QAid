/** Небольшие inline-SVG иконки фичи «Запись экрана» (mic / звук вкладки / стоп). */
import type { JSX } from 'preact';

/** Микрофон. */
export function MicIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <rect x="6" y="2" width="4" height="7" rx="2" />
      <path d="M4 8a4 4 0 0 0 8 0" stroke-linecap="round" />
      <line x1="8" y1="12" x2="8" y2="14" stroke-linecap="round" />
    </svg>
  );
}

/** Звук вкладки (петля). */
export function TabAudioIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path d="M3 8a5 5 0 0 1 5-5" stroke-linecap="round" />
      <path d="M13 8a5 5 0 0 1-5 5" stroke-linecap="round" />
      <polyline points="6,2 8,3 6,4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
