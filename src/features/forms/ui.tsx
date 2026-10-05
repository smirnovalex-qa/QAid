/**
 * UI фичи «Fill & check forms» (TASK-020) — редизайн v3 (поверхность side panel).
 *
 * Презентация переписана под макет v3: строка сайта, радио-
 * карточки «какими данными заполнить», основное действие заполнения с итоговой
 * success-карточкой и блок «Check forms for problems» со списком проблем. Логика
 * полностью сохранена: брокер прав (`scripting` + host), content-RPC `forms/fill`,
 * аудит через `inspection/scan` инспектором форм, подсветка поля по клику,
 * экспорт отчёта (plain/JSON/CSV), токен сессии и персист профиля в namespace.
 */
import '@/shared/inspection/messages';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Alert, Button, copyText, useToast } from '@/ui';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { cn } from '@/ui/cn';
import type { ExportFormat } from '@/shared/export/export';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import {
  auditForm,
  buildAuditReport,
  summarizeAudit,
  toAuditReportRows,
} from '@/shared/inspection/forms/logic';
import type {
  AuditIssue,
  FieldModel,
  FillProfile,
  FormModel,
} from '@/shared/inspection/forms/types';
import { FORMS_INSPECTOR_ID } from '@/shared/inspection/forms/collector';
import '@/shared/inspection/forms/messages';
import { formsBinding } from './settings';
import styles from './forms.module.css';

/** Права фичи: `scripting` + постоянный host-доступ (панель переживает смену вкладок). */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Брокер создаётся лениво при первом клике (не на импорте). */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Мягко валидирует ответ сборщика форм (данные пересекли границу сред как `unknown`). */
function asFormModel(data: unknown): FormModel | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Partial<FormModel>;
  if (!Array.isArray(d.fields)) return null;
  return {
    fields: d.fields as FieldModel[],
    forms: Array.isArray(d.forms) ? d.forms : [],
  };
}

/** Хост активной вкладки для строки сайта (host-доступ, без права `tabs`). */
function useCurrentHost(): string {
  const [host, setHost] = useState('');
  useEffect(() => {
    const token = { alive: true };
    void (async () => {
      try {
        const id = await tabs.queryActive();
        if (id === undefined) return;
        const url = await tabs.getUrl(id);
        if (url === undefined || !token.alive) return;
        setHost(new URL(url).host);
      } catch {
        /* привилегированная/ограниченная страница — строку сайта не показываем */
      }
    })();
    return () => {
      token.alive = false;
    };
  }, []);
  return host;
}

/** Строка сайта: зелёная точка + моно-хост + «· current tab». */
function SiteLine(): JSX.Element | null {
  const host = useCurrentHost();
  if (host === '') return null;
  return (
    <div class={styles.siteLine}>
      <span class={styles.siteDot} aria-hidden="true" />
      <span class={styles.siteHost}>{host}</span>
      <span>{t('forms.currentTab')}</span>
    </div>
  );
}

/** Карточки «какими данными заполнить» — порядок и копирайт из макета v3. */
const PROFILE_CARDS: { id: FillProfile; label: string; help: string }[] = [
  { id: 'valid', label: 'forms.profile.valid', help: 'forms.profileHelp.valid' },
  { id: 'boundary', label: 'forms.profile.boundary', help: 'forms.profileHelp.boundary' },
  { id: 'empty', label: 'forms.profile.empty', help: 'forms.profileHelp.empty' },
  { id: 'injection', label: 'forms.profile.injection', help: 'forms.profileHelp.injection' },
];

export function FormsPanel(): JSX.Element {
  const settings = useSettings(formsBinding);
  const ready = settings.ready.value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [model, setModel] = useState<FormModel | null>(null);
  const [audited, setAudited] = useState(false);
  const [filledCount, setFilledCount] = useState<number | null>(null);

  const [profile, setProfile] = useState<FillProfile>(formsBinding.value.value.profile);
  const [seeded, setSeeded] = useState(false);

  const { show } = useToast();

  // Токен сессии: устаревший ответ игнорируется, «Отмена» инвалидирует.
  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);
  // Вкладка последнего успешного аудита — адрес для подсветки полей по клику.
  const auditTabRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || seeded) return;
    setProfile(formsBinding.value.value.profile);
    setSeeded(true);
  }, [ready, seeded]);

  const issues = useMemo<AuditIssue[]>(() => (model !== null ? auditForm(model) : []), [model]);
  const summary = useMemo(() => summarizeAudit(issues), [issues]);

  /** Общий каркас действия: брокер прав → id вкладки → колбэк с вкладкой и токеном сессии. */
  const runAction = async (
    fn: (tabId: number, isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;

    setError('');
    setBusy(true);
    try {
      const granted = await getBroker().ensure(REQUIRED);
      if (!isCurrent()) return;
      if (!granted) {
        setError(t('forms.error.permissionDenied'));
        return;
      }

      const tabId = await tabs.queryActive();
      if (!isCurrent()) return;
      if (tabId === undefined) {
        setError(t('forms.error.noTab'));
        return;
      }
      activeTabRef.current = tabId;
      await fn(tabId, isCurrent);
    } catch (e) {
      logger.error('forms.action', e);
      if (isCurrent()) setError(t('forms.error.generic'));
    } finally {
      if (isCurrent()) {
        setBusy(false);
        activeTabRef.current = null;
      }
    }
  };

  const onFill = (): void => {
    void runAction(async (tabId, isCurrent) => {
      const res = await sendMessage('forms/fill', { tabId, profile });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(t('forms.error.generic'));
        return;
      }
      setFilledCount(res.value.filled);
    });
  };

  const onAudit = (): void => {
    void runAction(async (tabId, isCurrent) => {
      const res = await sendMessage('inspection/scan', {
        tabId,
        inspectorId: FORMS_INSPECTOR_ID,
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(
          res.error.messageKey !== undefined ? t(res.error.messageKey) : t('forms.error.generic'),
        );
        return;
      }
      const parsed = asFormModel(res.value.data);
      if (parsed === null) {
        setError(t('forms.error.generic'));
        return;
      }
      auditTabRef.current = tabId;
      setModel(parsed);
      setAudited(true);
    });
  };

  const onHighlight = (selector: string): void => {
    const tabId = auditTabRef.current;
    if (tabId === null) return;
    void sendMessage('inspection/highlight', { tabId, selector })
      .then((res) => {
        if (!res.ok || !res.value.found) show(t('forms.notFound'), { severity: 'info' });
      })
      .catch(() => {
        show(t('forms.notFound'), { severity: 'info' });
      });
  };

  const onExport = (format: ExportFormat): void => {
    const rows = toAuditReportRows(issues, (key) => t(key));
    const report = buildAuditReport(rows, format);
    void copyText(report).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const selectProfile = (next: FillProfile): void => {
    setProfile(next);
    setFilledCount(null);
    void formsBinding.update({ profile: next });
  };

  return (
    <div class={styles.root} data-testid="forms-panel">
      <SiteLine />

      {/* ── какими данными заполнить ─────────────────────────────────────── */}
      <div class={styles.group}>
        <span class={styles.groupLabel}>{t('forms.dataType')}</span>
        <div class={styles.cardGrid} role="radiogroup" aria-label={t('forms.dataType')}>
          {PROFILE_CARDS.map((card) => {
            const on = profile === card.id;
            return (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={on}
                class={cn(styles.radioCard, on && styles.radioCardOn)}
                onClick={() => {
                  selectProfile(card.id);
                }}
              >
                <span class={styles.cardLabel}>{t(card.label)}</span>
                <span class={styles.cardHelp}>{t(card.help)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Button block loading={busy} disabled={busy} onClick={onFill}>
        {busy ? t('forms.filling') : t('forms.fillOnPage')}
      </Button>

      {filledCount !== null ? (
        <Alert tone="success" role="status" title={t('forms.filled', { count: filledCount })}>
          <span class={styles.resultSub}>{t('forms.noSubmit')}</span>
        </Alert>
      ) : null}

      {error !== '' ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {/* ── проверка форм на проблемы ────────────────────────────────────── */}
      <div class={styles.section}>
        <div class={styles.sectionHead}>
          <h3 class={styles.sectionTitle}>{t('forms.checkTitle')}</h3>
          <Button variant="secondary" size="sm" loading={busy} disabled={busy} onClick={onAudit}>
            {audited ? t('forms.checkAgain') : t('forms.check')}
          </Button>
        </div>

        {audited && model !== null ? (
          issues.length === 0 ? (
            <p class={styles.note} role="status">
              {t('forms.noIssues')}
            </p>
          ) : (
            <>
              <div class={styles.issueList} data-testid="forms-issues">
                {issues.map((issue, i) => (
                  <button
                    key={`${issue.rule}-${issue.selector}-${String(i)}`}
                    type="button"
                    class={styles.issueRow}
                    title={t('forms.highlightHint')}
                    onClick={() => {
                      onHighlight(issue.selector);
                    }}
                  >
                    <span
                      class={cn(
                        styles.dot,
                        issue.severity === 'error' ? styles.dotError : styles.dotWarn,
                      )}
                      aria-hidden="true"
                    />
                    <span class={styles.issueBody}>
                      <span class={styles.issueTitle}>{t(issue.message)}</span>
                      <span class={styles.issueSel}>{issue.selector}</span>
                    </span>
                    <span class={styles.show}>{t('forms.show')}</span>
                  </button>
                ))}
              </div>
              <p class={styles.note} data-testid="forms-summary" role="status" aria-live="polite">
                {t('forms.auditCounts', { error: summary.error, warning: summary.warning })}
              </p>
              <div class={styles.exportRow}>
                <span class={styles.exportLabel}>{t('forms.export')}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onExport('plain');
                  }}
                >
                  {t('forms.export.plain')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onExport('json');
                  }}
                >
                  {t('forms.export.json')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onExport('csv');
                  }}
                >
                  {t('forms.export.csv')}
                </Button>
              </div>
            </>
          )
        ) : (
          <p class={styles.note}>{t('forms.auditHelp')}</p>
        )}
      </div>
    </div>
  );
}
