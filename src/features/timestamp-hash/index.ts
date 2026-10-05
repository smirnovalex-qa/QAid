/**
 * Дескриптор фичи «Таймстемпы и хеши» + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) поднимает singleton-биндинг настроек;
 * фрагменты i18n домешиваются в общий каталог через `mergeCatalog`.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'timestamp-hash',
  title: 'feature.tsh.title',
  category: 'utils',
  surface: 'both',
  order: 40,
  icon: glyphIcon('ts'),
  load: () => import('./ui').then((m) => m.TimestampHashPanel),
});
