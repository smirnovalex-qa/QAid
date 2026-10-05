/**
 * Публичный API ядра «Agent Handoff» (TASK-040, ADR-0043) + рантайм-сборка транспортов.
 *
 * Баррель ре-экспортирует чистые модули (пакет/deep-link/реестр) и транспорты, а также
 * даёт две document-контекстные утилиты для UI: `detectCapabilities` (что доступно в
 * среде) и `createRuntimeTransports` (реальные транспорты, инъектируемые в `deliver`).
 * Импорт барреля исполняет `targets.ts` → базовые адресаты (`clipboard`,
 * `project-folder`) самопрописываются в реестр (как фичи в `features/registry.ts`).
 *
 * Тул-специфичные адресаты (`claude-code`/`cursor`/`codex`) регистрируют TASK-043/044/045
 * поверх этого барреля — ядро при этом не меняется (инвариант расширяемости §1).
 */
import type { HandoffCapabilities, HandoffTransports } from './types';
import { copyToClipboard } from './transports/clipboard';
import { isFsAccessSupported, writeProjectFiles } from './transports/fs-access';

export * from './types';
export {
  buildHandoffPackage,
  buildPromptForDeepLink,
  buildSlug,
  buildEssence,
  topConsoleSignal,
  AgentHandoffPackageSchema,
} from './packager';
export { buildDeepLink, validateScheme, validateRepo, validateCwd } from './deep-link';
export { registerHandoffTarget, getHandoffTargets } from './targets';
export {
  isFsAccessSupported,
  pickProjectDirectory,
  hasProjectDirectory,
  forgetProjectDirectory,
  writeProjectFiles,
  readProjectTextFile,
  writeProjectTextFile,
} from './transports/fs-access';
export { copyToClipboard } from './transports/clipboard';
export {
  DISCOVERY_TARGETS,
  renderRuleSection,
  mergeRuleFile,
  renderMcpJson,
  renderMcpToml,
  mergeMcpJson,
} from './discovery';
export type { DiscoveryTarget, DiscoveryInput, McpFragment, McpConfigFormat } from './discovery';

/**
 * Что фактически доступно в текущей поверхности (popup/side panel). Deep link
 * СОЗНАТЕЛЬНО не детектируется — из браузера нельзя узнать, зарегистрирована ли схема
 * (ADR-0043), поэтому его открывают оптимистично, а фолбэк показывают всегда.
 */
export function detectCapabilities(): HandoffCapabilities {
  return {
    fsAccess: isFsAccessSupported(),
    // Буфер доступен практически всегда в document-контексте (Async Clipboard API
    // либо legacy-фолбэк `execCommand`, см. `copyText`); в service worker модуль не
    // используется.
    clipboard: typeof document !== 'undefined',
  };
}

/**
 * Реальные транспорты для инъекции в `HandoffTarget.deliver` (см. `DeliveryContext`).
 * Держит DOM/`chrome.*`-детали здесь, чтобы адресаты оставались тестируемыми на фейках.
 * `openDeepLink` открывает URL кликом по временному `<a>` под пользовательским жестом —
 * не `chrome.tabs.create` с кастомной схемой (может блокироваться) и не навигацией
 * самого popup (кастомная схема передаётся OS-обработчику, документ не уходит).
 */
export function createRuntimeTransports(): HandoffTransports {
  return {
    writeProjectFiles,
    copyToClipboard,
    openDeepLink(url: string): void {
      if (typeof document === 'undefined') return;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.rel = 'noopener noreferrer';
      // target=_blank: если схема не зарегистрирована, останется пустая вкладка/ничего —
      // это не ошибка (фолбэк рядом), но popup не «уедет» на кастомный URL.
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}
