/**
 * Авто-обнаружение баг-репортов AI-агентами (TASK-042) — ЧИСТЫЕ генераторы текста
 * и дескрипторов, БЕЗ DOM, `chrome.*` и записи файлов. Модуль лишь СОБИРАЕТ (a)
 * секцию правил (rule-file), сообщающую агенту, что артефакты живут в
 * `.qanvil/bug-reports/` (свежайший — `latest.md`), и (b) фрагмент MCP-конфига,
 * нацеливающий готовый filesystem-MCP-сервер (через `npx -y
 * @modelcontextprotocol/server-filesystem <abs reports dir>`) на эту папку. UI
 * (оркестратор) отдельно строит интерфейс и запись через File System Access.
 *
 * Инварианты (канон репозитория):
 *  - ИДЕМПОТЕНТНОСТЬ: слияния основаны на стабильных маркерах / ключе сервера и
 *    никогда не дублируют и не затирают пользовательский конфиг (повторный прогон →
 *    идентичный результат).
 *  - errors-as-data: генераторы не бросают через границу; невалидный/отсутствующий
 *    `cwd` деградирует в плейсхолдер `<путь>` (FSA не раскрывает абсолютный путь —
 *    честно помечаем ограничение флагом `hasPath`).
 *  - НЕТ npm-зависимостей: TOML генерируется как текст (структурно), JSON — через
 *    штатный `JSON.parse`/`JSON.stringify`.
 */
import { HANDOFF_DIR } from './types';
import { validateCwd } from './deep-link';

// ── константы ────────────────────────────────────────────────────────────────

/** Стабильные HTML-комментарии-маркеры блока правил (для идемпотентного слияния). */
export const RULE_MARKER_BEGIN = '<!-- qanvil:begin -->' as const;
export const RULE_MARKER_END = '<!-- qanvil:end -->' as const;

/** Имя MCP-сервера в конфиге (стабильный ключ для идемпотентного слияния). */
export const MCP_SERVER_NAME = 'qanvil-reports' as const;

/** Пакет готового off-the-shelf filesystem MCP-сервера (мы его НЕ публикуем). */
export const FILESYSTEM_MCP_PACKAGE = '@modelcontextprotocol/server-filesystem' as const;

/**
 * Плейсхолдер абсолютного корня проекта: File System Access API не раскрывает
 * абсолютный путь выбранной папки, поэтому без явного `cwd` подставляем метку,
 * которую пользователь заменит один раз вручную.
 */
export const PLACEHOLDER_ROOT = '<путь>' as const;

/** Относительный «свежий» указатель внутри проекта. */
const LATEST_RELATIVE = `${HANDOFF_DIR}/latest.md`;

// ── каталог поддерживаемых адресатов (для итерации в UI) ──────────────────────

/** Формат MCP-конфига адресата. */
export type McpConfigFormat = 'json' | 'toml';

/** Дескриптор адресата авто-обнаружения (какие файлы и формат конфига). */
export interface DiscoveryTarget {
  /** Уникальный id инструмента. */
  id: string;
  /** Путь rule-файла относительно корня проекта (или `~` для домашних конфигов). */
  ruleFile: string;
  /** Путь MCP-конфига (относительный или `~`-домашний). */
  mcpFile: string;
  /** Формат MCP-конфига. */
  format: McpConfigFormat;
}

/**
 * Типизированный каталог поддерживаемых инструментов. Rule-файлы проектные;
 * `~/.codex/config.toml` — домашний (Codex не читает проектные MCP-конфиги).
 */
export const DISCOVERY_TARGETS = [
  { id: 'claude-code', ruleFile: 'CLAUDE.md', mcpFile: '.mcp.json', format: 'json' },
  {
    id: 'cursor',
    ruleFile: '.cursor/rules/qanvil.md',
    mcpFile: '.cursor/mcp.json',
    format: 'json',
  },
  { id: 'codex', ruleFile: 'AGENTS.md', mcpFile: '~/.codex/config.toml', format: 'toml' },
] as const satisfies readonly DiscoveryTarget[];

// ── вход ─────────────────────────────────────────────────────────────────────

/**
 * Вход генераторов MCP-фрагментов. `cwd` — абсолютный корень проекта (валидируется
 * через `validateCwd`); при отсутствии/невалидности используется плейсхолдер.
 */
export interface DiscoveryInput {
  cwd?: string;
}

/** Результат генератора MCP-фрагмента: текст + честный флаг наличия абсолютного пути. */
export interface McpFragment {
  content: string;
  /** `true` — путь реальный (из `cwd`); `false` — подставлен плейсхолдер `<путь>`. */
  hasPath: boolean;
}

// ── работа с путями (POSIX + Windows, без двойных разделителей) ───────────────

/**
 * Соединяет корень и относительный путь, выбирая разделитель по виду корня:
 * Windows-диск с обратными слэшами (`C:\...`) → `\`, иначе → `/`. Хвостовые
 * разделители корня срезаются (нет двойных `//`), а относительный путь при
 * Windows-режиме переводится на обратные слэши.
 */
const joinPath = (root: string, relative: string): string => {
  const backslash = /^[A-Za-z]:\\/.test(root) || (root.includes('\\') && !root.includes('/'));
  const separator = backslash ? '\\' : '/';
  const trimmedRoot = root.replace(/[\\/]+$/, '');
  const normalizedRelative = backslash ? relative.replace(/\//g, '\\') : relative;
  return `${trimmedRoot}${separator}${normalizedRelative}`;
};

/**
 * Резолвит абсолютный каталог репортов из входа. Валидный `cwd` → реальный путь
 * (`hasPath: true`); отсутствующий/невалидный → плейсхолдер `<путь>/…`
 * (`hasPath: false`). Никогда не бросает.
 */
const resolveReportsDir = (input: DiscoveryInput): { dir: string; hasPath: boolean } => {
  const cwd = input.cwd;
  if (cwd !== undefined && cwd.length > 0 && validateCwd(cwd).ok) {
    return { dir: joinPath(cwd, HANDOFF_DIR), hasPath: true };
  }
  return { dir: joinPath(PLACEHOLDER_ROOT, HANDOFF_DIR), hasPath: false };
};

// ── генератор секции правил (Markdown) ────────────────────────────────────────

/**
 * Строит блок правил, обёрнутый в стабильные маркеры. Содержимое одинаково для всех
 * rule-файлов (`CLAUDE.md` / `.cursor/rules/qanvil.md` / `AGENTS.md`) — различие
 * лишь в файле-адресате (см. `DISCOVERY_TARGETS`). Указывает агенту относительный
 * путь каталога репортов и свежайший файл `latest.md`.
 */
export const renderRuleSection = (): string =>
  [
    RULE_MARKER_BEGIN,
    '## QAnvil — баг-репорты',
    '',
    `Артефакты багов от расширения QAnvil лежат в \`${HANDOFF_DIR}/\` (в корне проекта).`,
    `Свежайший отчёт всегда — \`${LATEST_RELATIVE}\`; это самодостаточный Markdown с шагами`,
    'воспроизведения, окружением, консолью, сетью и машиночитаемым JSON.',
    '',
    `Когда пользователь просит «разбери последний баг» (или похожее) без указания пути —`,
    `открой \`${LATEST_RELATIVE}\`. Каждый прогон перезаписывает \`latest.md\`; предыдущие`,
    `отчёты остаются в \`${HANDOFF_DIR}/\` с датой в имени.`,
    RULE_MARKER_END,
  ].join('\n');

/** Позиции валидного (BEGIN…END) блока маркеров в тексте, либо `null`. */
const findMarkers = (text: string): { begin: number; end: number } | null => {
  const begin = text.indexOf(RULE_MARKER_BEGIN);
  if (begin === -1) return null;
  const end = text.indexOf(RULE_MARKER_END, begin + RULE_MARKER_BEGIN.length);
  if (end === -1) return null;
  return { begin, end: end + RULE_MARKER_END.length };
};

/**
 * Идемпотентно вливает блок правил в существующий rule-файл:
 *  - пустой файл → сам блок;
 *  - без маркеров → блок дописывается в конец через пустую строку (контент сохранён);
 *  - с существующим блоком → содержимое между маркерами ЗАМЕНЯЕТСЯ (окружающий
 *    пользовательский текст сохраняется дословно), без дублирования.
 * Повторный прогон с тем же `section` даёт идентичный результат.
 */
export const mergeRuleFile = (existing: string, section: string): string => {
  const markers = findMarkers(existing);
  if (markers !== null) {
    return existing.slice(0, markers.begin) + section + existing.slice(markers.end);
  }
  if (existing.trim().length === 0) return section;
  return `${existing.replace(/\s+$/, '')}\n\n${section}`;
};

// ── генераторы MCP-фрагментов ─────────────────────────────────────────────────

/** Дескриптор одного MCP-сервера (форма для JSON-сериализации). */
interface McpServerEntry {
  command: 'npx';
  args: string[];
}

/** Собирает запись сервера, нацеленную на каталог репортов. */
const serverEntry = (dir: string): McpServerEntry => ({
  command: 'npx',
  args: ['-y', FILESYSTEM_MCP_PACKAGE, dir],
});

/**
 * JSON-фрагмент для `.mcp.json` / `.cursor/mcp.json`:
 * `{ "mcpServers": { "qanvil-reports": { "command": "npx", "args": [...] } } }`.
 * Сериализация с отступом в 2 пробела.
 */
export const renderMcpJson = (input: DiscoveryInput): McpFragment => {
  const { dir, hasPath } = resolveReportsDir(input);
  const config = { mcpServers: { [MCP_SERVER_NAME]: serverEntry(dir) } };
  return { content: JSON.stringify(config, null, 2), hasPath };
};

/** Экранирует строку для TOML basic string (обратный слэш и кавычка). */
const tomlString = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * TOML-фрагмент для Codex `~/.codex/config.toml`. Генерируется как текст
 * (TOML-парсер НЕ является зависимостью проекта): таблица `[mcp_servers.<name>]`
 * с `command`/`args`. Пользователь вставляет фрагмент вручную (paste-фрагмент).
 */
export const renderMcpToml = (input: DiscoveryInput): McpFragment => {
  const { dir, hasPath } = resolveReportsDir(input);
  const content = [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    'command = "npx"',
    `args = ["-y", ${tomlString(FILESYSTEM_MCP_PACKAGE)}, ${tomlString(dir)}]`,
  ].join('\n');
  return { content, hasPath };
};

/** Узкая проверка: значение — «обычный» объект-запись (не массив/не null). */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Идемпотентно вливает наш сервер в существующий JSON MCP-конфига: парсит вход
 * (`JSON.parse`; при ошибке — начинает с чистого объекта), выставляет
 * `mcpServers["qanvil-reports"]`, НЕ теряя прочие серверы пользователя, и
 * ресериализует с отступом в 2 пробела. Повторный прогон → тот же результат.
 */
export const mergeMcpJson = (existingJson: string, input: DiscoveryInput): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(existingJson) as unknown;
  } catch {
    parsed = {};
  }
  const base = isRecord(parsed) ? parsed : {};
  const servers = isRecord(base.mcpServers) ? base.mcpServers : {};
  const { dir } = resolveReportsDir(input);
  const merged = {
    ...base,
    mcpServers: { ...servers, [MCP_SERVER_NAME]: serverEntry(dir) },
  };
  return JSON.stringify(merged, null, 2);
};
