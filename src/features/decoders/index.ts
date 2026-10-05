/**
 * Дескриптор фичи «Декодеры» (JWT · Base64 · URL · JSON) + саморегистрация (ADR-0011).
 *
 * Импорт `./ui` (транзитивно `./settings`) создаёт singleton-биндинг настроек;
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
  id: 'decoders',
  title: 'feature.dec.title',
  category: 'utils',
  surface: 'both',
  order: 30,
  icon: glyphIcon('{}'),
  load: () => import('./ui').then((m) => m.DecodersPanel),
});
