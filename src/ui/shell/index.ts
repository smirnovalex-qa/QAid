/**
 * Барель оболочки v3 (модель Home → Tool): единая адаптивная поверхность для side
 * panel и popup, её части (хедер · home · settings · ⌘K-палитра · fallback) и
 * каталог инструментов. Импорт `./i18n` домешивает подписи оболочки в каталог.
 */
import './i18n';

export { SidePanelShell } from './SidePanelShell';
export { PopupShell } from './PopupShell';
export { QASurface } from './QASurface';
export { Header } from './Header';
export { HomeView } from './HomeView';
export { SettingsView } from './SettingsView';
export { SearchPalette } from './SearchPalette';
export { PopupFallback } from './PopupFallback';
export { LazyPanel } from './LazyPanel';
export { useSurfaceState } from './useSurfaceState';
export type { SurfaceState, View } from './useSurfaceState';
export { toolStatus, setToolStatus, liveToolId } from './status';
export type { ToolStatus } from './status';
export {
  TOOLS,
  GROUP_ORDER,
  DEFAULT_PINS,
  PANEL_ONLY,
  groupOfTool,
  groupNameKey,
  toolNameKey,
  toolDescKey,
  toolKwKey,
} from './taxonomy';
export type { GroupId, CatalogTool } from './taxonomy';
export { ToolIcon, hasToolIcon } from './toolIcons';
export {
  glyphIcon,
  InspectorCursorIcon,
  SearchIcon,
  OptionsIcon,
  SidePanelIcon,
  DetachIcon,
  BrandLogo,
} from './icons';
