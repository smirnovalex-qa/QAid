/**
 * Публичный барель UI-утилит (TASK-008): единая точка импорта для фич —
 * `import { FeaturePanel, OutputPanel, useCopy } from '@/ui'`.
 */
export { useCopy } from './clipboard/useCopy';
export type { CopyStatus, UseCopyOptions, UseCopyResult } from './clipboard/useCopy';

export { OutputPanel } from './output/OutputPanel';
export type { OutputPanelProps } from './output/OutputPanel';

export { FeaturePanel } from './layout/FeaturePanel';
export type { FeaturePanelProps } from './layout/FeaturePanel';

export * from '@/shared/export/export';
export * from '@/shared/validation/validators';

// Существующие компоненты дизайн-системы + низкоуровневое копирование — из одной точки.
export * from './components';
export { copyText } from './clipboard';
