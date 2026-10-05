import { z } from 'zod';
import { createSettingsBinding, defineFeatureSettings } from '@/shared/storage';
import { STORAGE_EDITOR_SETTINGS_DEFAULTS } from '@/shared/inspection/storage/types';

/**
 * Активная вкладка редактора состояния. Расширяет исходный набор TASK-017
 * (`cookies`/`local`/`session`) новыми вкладками TASK-031 (`indexeddb`/`cache`).
 * Тип объявлен здесь (в фиче), т.к. общий `StorageTab` в `shared` не расширяем из
 * этой волны — новые значения нужны только UI редактора.
 */
export type EditorTab = 'cookies' | 'local' | 'session' | 'indexeddb' | 'cache';

/** Персистентное состояние фичи (через слой настроек TASK-005) — активная вкладка. */
export interface EditorSettingsState {
  readonly tab: EditorTab;
}

/**
 * Дефолт — исходная вкладка TASK-017. Back-compat: старое сохранённое значение
 * (`cookies`/`local`/`session`) остаётся валидным в расширенном enum; неизвестное
 * значение слой настроек откатывает к дефолту при декодировании.
 */
const DEFAULTS: EditorSettingsState = { tab: STORAGE_EDITOR_SETTINGS_DEFAULTS.tab };

// Схема персистентного состояния фичи (активная вкладка редактора состояния).
const schema: z.ZodType<EditorSettingsState, z.ZodTypeDef, unknown> = z.object({
  tab: z.enum(['cookies', 'local', 'session', 'indexeddb', 'cache']),
});

export const storageEditorSettings = defineFeatureSettings<EditorSettingsState>({
  namespace: 'storage-editor',
  schema,
  defaults: DEFAULTS,
});

// Синглтон-биндинг на namespace (один signal на всё приложение).
export const storageEditorBinding = createSettingsBinding(storageEditorSettings);
