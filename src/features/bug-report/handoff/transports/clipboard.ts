/**
 * Транспорт «буфер обмена» для Agent Handoff (TASK-040).
 *
 * Тонкий шов над общей `copyText` (`@/ui`): вынесен отдельной функцией НАРОЧНО —
 * это инъектируемая зависимость (`HandoffTransports.copyToClipboard`), поэтому
 * адресаты (`targets.ts`) тестируются на фейке без реального буфера/DOM
 * (инвариант: чистая логика адресата покрыта юнит-тестами, см. `types.ts`).
 */
import { copyText } from '@/ui';

/** Кладёт текст в буфер обмена. `true` — успех (с legacy-фолбэком внутри `copyText`). */
export async function copyToClipboard(text: string): Promise<boolean> {
  return copyText(text);
}
