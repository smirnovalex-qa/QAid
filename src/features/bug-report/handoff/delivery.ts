/**
 * Общий помощник доставки для тул-адаптеров Agent Handoff (TASK-043/044/045).
 *
 * Все deep-link-адресаты опираются на ОДНУ инвариантную предпосылку: полный артефакт
 * должен лежать файлом в проекте (`${HANDOFF_DIR}/latest.md`), потому что компактный
 * промпт/ссылка указывают именно на него (лимит `q` не вмещает отчёт, ADR-0043). Значит
 * запись файла — не «побочный шаг», а условие осмысленности deep-link: если файла нет,
 * открывать агента на несуществующий `latest.md` вредно (агент 404-ит, пользователь не
 * понимает, что пошло не так — ровно этот дефект и наблюдался).
 *
 * Помощник выполняет запись и КЛАССИФИЦИРУЕТ исход: `filePath`/`filePointer` при успехе
 * либо `reasonKey` (i18n-ключ причины) при неуспехе — адаптер честно показывает причину и
 * фолбэки вместо ложного «открываю…». Ошибки — данными, не throw (канон границы).
 */
import { HANDOFF_DIR } from './types';
import type { DeliveryContext } from './types';

/** Исход попытки записать артефакт в проект перед открытием deep-link. */
export interface ArtifactWriteOutcome {
  /** Относительный путь записанного «свежего» файла (задан только при успехе). */
  filePath?: string;
  /** Путь-указатель для промпта/ссылки (реальный при успехе, дефолтный иначе). */
  filePointer: string;
  /**
   * i18n-ключ причины, если файл записать НЕ удалось (папка не выбрана / нет доступа /
   * FSA недоступен / ошибка записи). `undefined` — файл на месте, можно открывать агента.
   */
  reasonKey?: string;
}

/**
 * Пишет полный артефакт в выбранный корень проекта и классифицирует исход. FSA работает
 * только из document-контекста и требует выбранной пользователем папки (persist-handle):
 *  - нет FSA в среде → `msg.fsUnavailable`;
 *  - запись не удалась → конкретный ключ из транспорта (`fs.noDir`/`fs.denied`/`fs.failed`);
 *  - успех → `filePath`/`filePointer` указывают на записанный `latest.md`.
 */
export async function writeArtifactForHandoff(ctx: DeliveryContext): Promise<ArtifactWriteOutcome> {
  const defaultPointer = `${HANDOFF_DIR}/latest.md`;
  if (!ctx.capabilities.fsAccess) {
    return { filePointer: defaultPointer, reasonKey: 'bugReport.handoff.msg.fsUnavailable' };
  }
  const written = await ctx.transports.writeProjectFiles(ctx.pkg);
  if (written.ok) {
    return { filePath: written.latestPath, filePointer: written.latestPath };
  }
  return {
    filePointer: defaultPointer,
    reasonKey: written.error ?? 'bugReport.handoff.fs.failed',
  };
}
