/**
 * Дескриптор фичи «Экспорт состояния бага» (TASK-025) + саморегистрация (ADR-0011).
 *
 * Контракты `bugReport/*` адресованы `background`: MAIN-инъекция сборщиков
 * (окружение + кольцевой буфер консоли) и опрос буфера живут в service worker'е
 * (как у мока сети и эмуляции окружения), поэтому обработка — через
 * `backgroundHandlers`. Сеть и снимок storage/cookies НЕ дублируются: UI берёт их
 * переиспользуемыми контрактами `mock/poll` (TASK-022) и `storage/*`+`cookies/*`
 * (TASK-017). Права (`scripting` + постоянный host-доступ, при storage — ещё
 * `cookies`) запрашиваются брокером под жестом (least-privilege, ADR-0013).
 * Категория `utils`; доступна на обеих поверхностях (ADR-0025).
 */
import { registerFeature } from '@/features/registry';
import { mergeCatalog } from '@/i18n';
import { glyphIcon } from '@/ui/shell/icons';
import { bugReportMessages } from './messages';
import ru from './i18n/ru';
import en from './i18n/en';
// Тул-специфичные адресаты Agent Handoff (TASK-043/044/045) само-регистрируются в общем
// реестре при загрузке модуля (как фичи в `registry.ts`). Импорт ради сайд-эффекта —
// единственная точка их подключения; ядро (targets.ts) при этом не меняется (§1).
import './handoff/targets/claude-code';
import './handoff/targets/cursor';
import './handoff/targets/codex';

mergeCatalog('ru', ru);
mergeCatalog('en', en);

registerFeature({
  id: 'bug-report',
  title: 'feature.bugReport.title',
  category: 'utils',
  surface: 'both',
  order: 140,
  icon: glyphIcon('🐞'),
  load: () => import('./ui').then((m) => m.BugReportPanel),
  messages: bugReportMessages,
  // `bugReportBackgroundHandlers` (MAIN-инъекция сборщиков + кольцевой буфер консоли)
  // подключаются из background-барели (`@/features/background`), не из UI-дескриптора
  // (F6 TASK-046, ADR-0047).
  permissions: { optional: ['scripting'], host: ['*://*/*'] },
});
