/**
 * Дескриптор фичи «Случайные строки» + саморегистрация (ADR-0011).
 *
 * Импорт `./settings` (транзитивно через `./ui`) создаёт singleton-биндинг
 * настроек; фрагменты i18n домешиваются в общий каталог через `mergeCatalog`.
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import ru from './i18n/ru';
import en from './i18n/en';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'random-strings',
  title: 'feature.rs.title',
  category: 'generators',
  surface: 'both',
  order: 20,
  icon: glyphIcon('Ab'),
  load: () => import('./ui').then((m) => m.RandomStringsPanel),
});
