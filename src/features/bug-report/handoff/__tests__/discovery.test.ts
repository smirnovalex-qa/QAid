/**
 * Тесты чистых генераторов авто-обнаружения (TASK-042): rule-секция + идемпотентный
 * мердж, MCP-фрагменты JSON/TOML с плейсхолдером/реальным путём и мердж JSON без потери
 * пользовательских серверов. Без DOM/`chrome.*` (канон: чистая логика ~100%). JSON
 * валидируется штатным `JSON.parse`; TOML — структурными ассертами (парсера в депах нет).
 */
import { describe, expect, it } from 'vitest';
import { HANDOFF_DIR } from '../types';
import {
  DISCOVERY_TARGETS,
  FILESYSTEM_MCP_PACKAGE,
  MCP_SERVER_NAME,
  PLACEHOLDER_ROOT,
  RULE_MARKER_BEGIN,
  RULE_MARKER_END,
  mergeMcpJson,
  mergeRuleFile,
  renderMcpJson,
  renderMcpToml,
  renderRuleSection,
} from '../discovery';

const LATEST = `${HANDOFF_DIR}/latest.md`;

describe('renderRuleSection', () => {
  it('оборачивает инструкцию в стабильные маркеры и указывает путь репортов + latest.md', () => {
    const s = renderRuleSection();
    expect(s.startsWith(RULE_MARKER_BEGIN)).toBe(true);
    expect(s.trimEnd().endsWith(RULE_MARKER_END)).toBe(true);
    expect(s).toContain(`${HANDOFF_DIR}/`);
    expect(s).toContain(LATEST);
  });
});

describe('mergeRuleFile', () => {
  const section = renderRuleSection();

  it('пустой файл → сам блок', () => {
    expect(mergeRuleFile('', section)).toBe(section);
    expect(mergeRuleFile('   \n  ', section)).toBe(section);
  });

  it('без маркеров → блок дописан через пустую строку, контент сохранён', () => {
    const out = mergeRuleFile('# My rules\n\nkeep me', section);
    expect(out.startsWith('# My rules\n\nkeep me')).toBe(true);
    expect(out).toContain(section);
    expect(out).toContain(`\n\n${RULE_MARKER_BEGIN}`);
  });

  it('существующий блок ЗАМЕНЯЕТСЯ, окружающий текст сохранён; идемпотентно', () => {
    const before = `top\n\n${RULE_MARKER_BEGIN}\nOLD\n${RULE_MARKER_END}\n\nbottom`;
    const once = mergeRuleFile(before, section);
    expect(once).toContain('top');
    expect(once).toContain('bottom');
    expect(once).not.toContain('OLD');
    expect(once).toContain(section);
    // Повторный прогон не меняет результат (идемпотентность).
    expect(mergeRuleFile(once, section)).toBe(once);
    // И не плодит второй блок.
    expect(once.split(RULE_MARKER_BEGIN)).toHaveLength(2);
  });

  it('BEGIN без END трактуется как отсутствие блока (дописывает в конец)', () => {
    const out = mergeRuleFile(`x ${RULE_MARKER_BEGIN} no end`, section);
    expect(out).toContain(section);
    expect(out).toContain('x ');
  });
});

describe('renderMcpJson', () => {
  it('валидный JSON с нашим сервером и реальным путём при заданном cwd', () => {
    const { content, hasPath } = renderMcpJson({ cwd: '/home/me/app' });
    expect(hasPath).toBe(true);
    const parsed = JSON.parse(content) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const entry = parsed.mcpServers[MCP_SERVER_NAME];
    expect(entry?.command).toBe('npx');
    expect(entry?.args).toEqual(['-y', FILESYSTEM_MCP_PACKAGE, `/home/me/app/${HANDOFF_DIR}`]);
  });

  it('без cwd → плейсхолдер и hasPath:false', () => {
    const { content, hasPath } = renderMcpJson({});
    expect(hasPath).toBe(false);
    expect(content).toContain(PLACEHOLDER_ROOT);
    expect(() => {
      JSON.parse(content);
    }).not.toThrow();
  });

  it('невалидный cwd (обход `..`) → плейсхолдер', () => {
    const { hasPath, content } = renderMcpJson({ cwd: '/home/../etc' });
    expect(hasPath).toBe(false);
    expect(content).toContain(PLACEHOLDER_ROOT);
  });

  it('Windows-cwd соединяется обратными слэшами без дублирования', () => {
    const { content } = renderMcpJson({ cwd: 'C:\\Users\\me\\app\\' });
    const parsed = JSON.parse(content) as {
      mcpServers: Record<string, { args: string[] }>;
    };
    expect(parsed.mcpServers[MCP_SERVER_NAME]?.args[2]).toBe(
      `C:\\Users\\me\\app\\${HANDOFF_DIR.replace(/\//g, '\\')}`,
    );
  });
});

describe('mergeMcpJson', () => {
  it('сохраняет чужие серверы и добавляет наш; идемпотентно', () => {
    const existing = JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } } });
    const once = mergeMcpJson(existing, { cwd: '/home/me/app' });
    const parsed = JSON.parse(once) as { mcpServers: Record<string, unknown> };
    expect(parsed.mcpServers.other).toBeDefined();
    expect(parsed.mcpServers[MCP_SERVER_NAME]).toBeDefined();
    expect(mergeMcpJson(once, { cwd: '/home/me/app' })).toBe(once);
  });

  it('сохраняет прочие ключи верхнего уровня', () => {
    const existing = JSON.stringify({ note: 'keep', mcpServers: {} });
    const out = JSON.parse(mergeMcpJson(existing, {})) as { note: string };
    expect(out.note).toBe('keep');
  });

  it('битый JSON → чистый конфиг только с нашим сервером', () => {
    const out = JSON.parse(mergeMcpJson('{ not json', {})) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(out.mcpServers)).toEqual([MCP_SERVER_NAME]);
  });

  it('mcpServers не-объект → заменяется корректной картой', () => {
    const out = JSON.parse(mergeMcpJson(JSON.stringify({ mcpServers: 5 }), {})) as {
      mcpServers: Record<string, unknown>;
    };
    expect(out.mcpServers[MCP_SERVER_NAME]).toBeDefined();
  });
});

describe('renderMcpToml', () => {
  it('таблица сервера с command/args и реальным путём', () => {
    const { content, hasPath } = renderMcpToml({ cwd: '/home/me/app' });
    expect(hasPath).toBe(true);
    expect(content).toContain(`[mcp_servers.${MCP_SERVER_NAME}]`);
    expect(content).toContain('command = "npx"');
    expect(content).toContain(`"${FILESYSTEM_MCP_PACKAGE}"`);
    expect(content).toContain(`"/home/me/app/${HANDOFF_DIR}"`);
  });

  it('без cwd → плейсхолдер', () => {
    const { content, hasPath } = renderMcpToml({});
    expect(hasPath).toBe(false);
    expect(content).toContain(PLACEHOLDER_ROOT);
  });

  it('экранирует обратные слэши Windows-пути в TOML basic string', () => {
    const { content } = renderMcpToml({ cwd: 'C:\\Users\\me\\app' });
    expect(content).toContain('\\\\Users\\\\me\\\\app');
  });
});

describe('DISCOVERY_TARGETS', () => {
  it('покрывает claude-code/cursor/codex с ожидаемыми файлами и форматами', () => {
    const byId = Object.fromEntries(DISCOVERY_TARGETS.map((t) => [t.id, t]));
    expect(byId['claude-code']).toMatchObject({ ruleFile: 'CLAUDE.md', format: 'json' });
    expect(byId.cursor).toMatchObject({ mcpFile: '.cursor/mcp.json', format: 'json' });
    expect(byId.codex).toMatchObject({ ruleFile: 'AGENTS.md', format: 'toml' });
  });
});
