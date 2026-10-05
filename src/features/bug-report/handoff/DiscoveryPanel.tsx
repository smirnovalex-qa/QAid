/**
 * UI-под-действие «Авто-обнаружение агентом» (TASK-042). Показывает предпросмотр
 * rule-файла и MCP-фрагмента под каждый инструмент (`DISCOVERY_TARGETS`) и даёт
 * «Записать в проект» (через File System Access, идемпотентный мердж: прочитать →
 * смержить чистой функцией `discovery.ts` → записать) либо «Скопировать».
 *
 * Опционально по дизайну (ADR-0044): базовый путь (deep link + файл) работает и без
 * этого. Абсолютный путь MCP берётся из таргета проекта (`cwd`), иначе — плейсхолдер.
 * Codex-конфиг живёт в `~/.codex` (вне проекта) → для него только копирование.
 */
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, useToast } from '@/ui';
import { copyText } from '@/ui';
import { t } from '@/i18n';
import { bugReportBinding } from '../settings';
import {
  DISCOVERY_TARGETS,
  hasProjectDirectory,
  isFsAccessSupported,
  mergeMcpJson,
  mergeRuleFile,
  readProjectTextFile,
  renderMcpJson,
  renderMcpToml,
  renderRuleSection,
  writeProjectTextFile,
} from '.';
import type { DiscoveryTarget } from '.';
import styles from '../bug-report.module.css';

/** Абсолютный `cwd` таргета проекта (для абсолютного пути MCP) или пустая строка. */
function projectCwd(): string {
  return bugReportBinding.value.value.handoff.projectCwd.trim();
}

/** Готовит контент MCP-фрагмента для инструмента (JSON или TOML) + флаг наличия пути. */
function mcpFragment(target: DiscoveryTarget): { content: string; hasPath: boolean } {
  const input = { cwd: projectCwd() };
  return target.format === 'json' ? renderMcpJson(input) : renderMcpToml(input);
}

export function DiscoveryPanel(): JSX.Element {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [hasDir, setHasDir] = useState(false);
  const [busy, setBusy] = useState(false);
  const fsa = isFsAccessSupported();

  useEffect(() => {
    void hasProjectDirectory().then(setHasDir);
  }, []);

  const ruleSection = renderRuleSection();

  const copy = (text: string): void => {
    void copyText(text).then((okFlag) => {
      show(t(okFlag ? 'bugReport.discovery.copied' : 'copy.error'), {
        severity: okFlag ? 'success' : 'danger',
      });
    });
  };

  /** Идемпотентно вливает секцию правил в существующий rule-файл и пишет его. */
  async function writeRule(target: DiscoveryTarget): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const existing = (await readProjectTextFile(target.ruleFile)) ?? '';
      const merged = mergeRuleFile(existing, ruleSection);
      const okFlag = await writeProjectTextFile(target.ruleFile, merged);
      show(
        okFlag
          ? t('bugReport.discovery.wrote', { path: target.ruleFile })
          : t('bugReport.discovery.writeFailed'),
        {
          severity: okFlag ? 'success' : 'danger',
        },
      );
    } finally {
      setBusy(false);
    }
  }

  /** Идемпотентно вливает наш сервер в существующий JSON MCP-конфиг и пишет его. */
  async function writeMcpJson(target: DiscoveryTarget): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const existing = (await readProjectTextFile(target.mcpFile)) ?? '';
      const merged = mergeMcpJson(existing, { cwd: projectCwd() });
      const okFlag = await writeProjectTextFile(target.mcpFile, merged);
      show(
        okFlag
          ? t('bugReport.discovery.wrote', { path: target.mcpFile })
          : t('bugReport.discovery.writeFailed'),
        {
          severity: okFlag ? 'success' : 'danger',
        },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset class={styles.fieldset}>
      <legend class={styles.legend}>
        <button
          type="button"
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            font: 'inherit',
            color: 'inherit',
            cursor: 'pointer',
          }}
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          {open ? '▾' : '▸'} {t('bugReport.discovery.legend')}
        </button>
      </legend>

      {open ? (
        <div class={styles.section}>
          <p class={styles.hint}>{t('bugReport.discovery.intro')}</p>
          <p class={styles.hint}>{t('bugReport.discovery.pathNote')}</p>
          {!hasDir ? <p class={styles.muted}>{t('bugReport.discovery.needDir')}</p> : null}

          {DISCOVERY_TARGETS.map((target) => {
            const mcp = mcpFragment(target);
            const canWriteMcp = fsa && hasDir && target.format === 'json';
            return (
              <div key={target.id} class={styles.section}>
                <span class={styles.legend}>{target.id}</span>

                {/* Rule-файл */}
                <label class={styles.hint}>
                  {t('bugReport.discovery.rule.heading', { file: target.ruleFile })}
                </label>
                <textarea class={styles.preview} readOnly rows={5} value={ruleSection} />
                <div class={styles.actions}>
                  <Button
                    variant="secondary"
                    disabled={!fsa || !hasDir || busy}
                    onClick={() => void writeRule(target)}
                  >
                    {t('bugReport.discovery.write')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      copy(ruleSection);
                    }}
                  >
                    {t('bugReport.discovery.copy')}
                  </Button>
                </div>

                {/* MCP-конфиг */}
                <label class={styles.hint}>
                  {t('bugReport.discovery.mcp.heading', { file: target.mcpFile })}
                </label>
                <textarea class={styles.preview} readOnly rows={5} value={mcp.content} />
                <div class={styles.actions}>
                  <Button
                    variant="secondary"
                    disabled={!canWriteMcp || busy}
                    onClick={() => void writeMcpJson(target)}
                  >
                    {t('bugReport.discovery.write')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      copy(mcp.content);
                    }}
                  >
                    {t('bugReport.discovery.copy')}
                  </Button>
                </div>
              </div>
            );
          })}

          <p class={styles.hint}>{t('bugReport.discovery.mcpNote')}</p>
        </div>
      ) : null}
    </fieldset>
  );
}
