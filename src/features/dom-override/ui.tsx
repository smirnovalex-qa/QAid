/**
 * UI фичи «Редактировать содержимое страницы» (dom-override, TASK-023) — потребитель
 * инспекционного слоя (TASK-013), поверхность side panel. Пересобрана под v3-дизайн
 * (handoff «Network & mocks» → «Edit page content»): интро, «Выбрать элемент» ↔ живой
 * режим, карточка-редактор с 2×2 выбором действия, список активных подмен.
 *
 * Поток логики сохранён: «Выбрать элемент» → `inspection/pick` даёт стабильный
 * селектор → действие (изменить текст / очень длинный текст / скрыть / сделать пустым)
 * → «Применить» строит запись подмены, кладёт её в персист (namespace `dom-override`)
 * и шлёт `domOverride/apply` со ВСЕМ активным набором в content-хост. Это НЕ сетевой
 * мок — косметика ISOLATED DOM. Права (`scripting` + host) — брокером под жестом.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button, FeaturePanel, IconButton, Switch } from '@/ui';
import { cn } from '@/ui/cn';
import { setToolStatus } from '@/ui/shell';
import { sendMessage } from '@/shared/messaging/bus';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import {
  activeOverrides,
  findOverride,
  removeOverride,
  setOverrideEnabled,
  upsertOverride,
  validateOp,
} from '@/shared/inspection/dom-override/logic';
import type { DomOverrideEntry, DomOverrideOp } from '@/shared/inspection/dom-override/types';
import type { PickedElement } from '@/shared/inspection/types';
import { domOverrideBinding } from './settings';
import styles from './dom-override.module.css';

/** Права: `scripting` + постоянный host-доступ ко всем http/https (не `activeTab`). */
const REQUIRED: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };

/** Действия v3-дизайна (2×2). Отображаются на реальные косметические операции. */
type DomAct = 'text' | 'long' | 'hide' | 'empty';

/** Повторов плейсхолдера для «Очень длинный текст» (≈2 000 символов). */
const LONG_REPEAT = 75;

/** Брокер создаётся лениво при первом клике (не на импорте) — рендер чист. */
let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** Мягко валидирует снимок выбранного элемента (пересёк границу сред как `unknown`). */
function asPicked(value: unknown): PickedElement | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<PickedElement>;
  if (typeof v.selector !== 'string' || v.selector === '') return null;
  return v as PickedElement;
}

/** Короткое человекочитаемое описание подмены для строки списка (v3-копия). */
function describeChange(op: DomOverrideOp): string {
  switch (op.kind) {
    case 'replace-text':
      return op.text === ''
        ? t('domOverride.desc.emptied')
        : `${t('domOverride.desc.textPrefix')}"${op.text.length > 24 ? `${op.text.slice(0, 24)}…` : op.text}"`;
    case 'hide':
      return t('domOverride.desc.hidden');
    case 'inject-content':
      return t('domOverride.desc.long');
    case 'set-attribute':
      return `${op.name}="${op.value}"`;
    case 'remove-attribute':
      return `− ${op.name}`;
  }
}

export function DomOverridePanel(): JSX.Element {
  const settings = useSettings(domOverrideBinding);
  const ready = settings.ready.value;

  const [seeded, setSeeded] = useState(false);
  const [overrides, setOverrides] = useState<DomOverrideEntry[]>([]);

  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [act, setAct] = useState<DomAct>('text');
  const [text, setText] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const sessionRef = useRef(0);
  const activeTabRef = useRef<number | null>(null);

  // Засеваем список подмен из сохранённых настроек один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    setOverrides([...domOverrideBinding.value.value.overrides]);
    setSeeded(true);
  }, [ready, seeded]);

  // Зеркалим активные подмены в оболочку (список «Активно на этой вкладке»). Запись в
  // модульный signal откладываем микротаском: иначе синхронная запись внутри фазы
  // коммита/обработчика события реентрантно дренит общую очередь ре-рендеров preact.
  useEffect(() => {
    const n = overrides.filter((o) => o.enabled).length;
    const next = n > 0 ? { live: false, text: t('domOverride.status.mirror', { n }) } : null;
    queueMicrotask(() => {
      setToolStatus('dom-override', next);
    });
  }, [overrides]);
  // При размонтировании панели статус снимаем.
  useEffect(
    () => () => {
      queueMicrotask(() => {
        setToolStatus('dom-override', null);
      });
    },
    [],
  );

  const persist = (next: DomOverrideEntry[]): void => {
    setOverrides(next);
    void domOverrideBinding.update({ overrides: next });
  };

  /** Собирает операцию из выбранного действия (валидность проверяется `validateOp`). */
  const buildOp = (): DomOverrideOp => {
    switch (act) {
      case 'text':
        return { kind: 'replace-text', text };
      case 'empty':
        return { kind: 'replace-text', text: '' };
      case 'hide':
        return { kind: 'hide' };
      case 'long':
        return { kind: 'inject-content', text, repeat: LONG_REPEAT };
    }
  };

  /** Общий враппер: токен сессии, сброс ошибки, `busy` со сбросом в `finally`. */
  const run = async (fn: (isCurrent: () => boolean) => Promise<void>): Promise<void> => {
    if (busy) return;
    const session = ++sessionRef.current;
    const isCurrent = (): boolean => sessionRef.current === session;
    setError('');
    setBusy(true);
    try {
      await fn(isCurrent);
    } catch (e) {
      logger.error('dom-override', e);
      if (isCurrent()) setError(t('domOverride.error.generic'));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /** Гарантирует права и возвращает id активной вкладки (или null при отказе/ошибке). */
  const ensureTab = async (isCurrent: () => boolean): Promise<number | null> => {
    const granted = await getBroker().ensure(REQUIRED);
    if (!isCurrent()) return null;
    if (!granted) {
      setError(t('domOverride.error.permissionDenied'));
      return null;
    }
    const tabId = await tabs.queryActive();
    if (!isCurrent()) return null;
    if (tabId === undefined) {
      setError(t('domOverride.error.noTab'));
      return null;
    }
    return tabId;
  };

  /** Отправляет полный активный набор подмен в content-хост. */
  const pushApply = async (next: DomOverrideEntry[], isCurrent: () => boolean): Promise<void> => {
    const tabId = await ensureTab(isCurrent);
    if (tabId === null) return;
    const res = await sendMessage('domOverride/apply', { tabId, entries: activeOverrides(next) });
    if (!isCurrent()) return;
    if (!res.ok) {
      setError(res.error.messageKey ? t(res.error.messageKey) : t('domOverride.error.generic'));
      return;
    }
    setStatus(t('domOverride.status.applied', { count: res.value.applied }));
  };

  const onPick = (): Promise<void> =>
    run(async (isCurrent) => {
      const tabId = await ensureTab(isCurrent);
      if (tabId === null) return;
      activeTabRef.current = tabId;
      const res = await sendMessage('inspection/pick', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(res.error.messageKey ? t(res.error.messageKey) : t('domOverride.error.generic'));
        return;
      }
      const p = asPicked(res.value);
      if (p === null) {
        setError(t('domOverride.error.cancelled'));
        return;
      }
      setPicked(p);
    });

  const onApplyOverride = (): Promise<void> =>
    run(async (isCurrent) => {
      if (picked === null) {
        setError(t('domOverride.error.pickFirst'));
        return;
      }
      const op = buildOp();
      const check = validateOp(op);
      if (!check.valid) {
        setError(t('domOverride.error.generic'));
        return;
      }
      const existing = findOverride(overrides, picked.selector);
      const entry: DomOverrideEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        selector: picked.selector,
        label: picked.selector,
        op,
        enabled: true,
      };
      const next = upsertOverride(overrides, entry);
      persist(next);
      await pushApply(next, isCurrent);
      if (isCurrent()) setPicked(null);
    });

  const onToggle = (selector: string, enabled: boolean): Promise<void> =>
    run(async (isCurrent) => {
      const next = setOverrideEnabled(overrides, selector, enabled);
      persist(next);
      await pushApply(next, isCurrent);
    });

  const onRemove = (selector: string): Promise<void> =>
    run(async (isCurrent) => {
      const next = removeOverride(overrides, selector);
      persist(next);
      await pushApply(next, isCurrent);
    });

  const onClearAll = (): Promise<void> =>
    run(async (isCurrent) => {
      persist([]);
      const tabId = await ensureTab(isCurrent);
      if (tabId === null) return;
      const res = await sendMessage('domOverride/clear', { tabId });
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(res.error.messageKey ? t(res.error.messageKey) : t('domOverride.error.generic'));
        return;
      }
      setStatus(t('domOverride.status.applied', { count: 0 }));
    });

  /** Отмена живого выбора или закрытие редактора. */
  const onCancel = (): void => {
    const tabId = activeTabRef.current;
    sessionRef.current += 1;
    activeTabRef.current = null;
    setBusy(false);
    setPicked(null);
    if (tabId !== null) {
      void sendMessage('inspection/teardown', { tabId }).catch(() => undefined);
    }
  };

  const acts: { value: DomAct; label: string }[] = [
    { value: 'text', label: t('domOverride.act.text') },
    { value: 'long', label: t('domOverride.act.long') },
    { value: 'hide', label: t('domOverride.act.hide') },
    { value: 'empty', label: t('domOverride.act.empty') },
  ];
  const needsText = act === 'text' || act === 'long';

  return (
    <FeaturePanel bare>
      <div class={styles.panel} data-testid="dom-override">
        <p class={styles.intro}>{t('feature.domOverride.intro')}</p>

        {error !== '' && (
          <p role="alert" class={styles.error} data-testid="dom-override-error">
            {error}
          </p>
        )}

        <p class={styles.status} role="status" aria-live="polite" data-testid="dom-override-status">
          {status}
        </p>

        <Button
          variant={busy ? 'live' : 'primary'}
          block
          onClick={busy ? onCancel : () => void onPick()}
        >
          {busy ? t('domOverride.picking') : t('domOverride.pickCta')}
        </Button>

        {picked !== null && (
          <div class={styles.editorCard}>
            <span class={styles.selector} data-testid="dom-override-selector">
              {picked.selector}
            </span>
            <div
              role="radiogroup"
              aria-label={t('domOverride.act.label')}
              class={styles.actGrid}
              onKeyDown={(e: KeyboardEvent) => {
                const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
                if (!keys.includes(e.key)) return;
                e.preventDefault();
                const i = acts.findIndex((o) => o.value === act);
                const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
                const ni = (i + (fwd ? 1 : -1) + acts.length) % acts.length;
                const nextAct = acts[ni];
                if (nextAct) setAct(nextAct.value);
              }}
            >
              {acts.map((o) => {
                const on = act === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    class={cn(styles.actBtn, on && styles.actBtnOn)}
                    onClick={() => {
                      setAct(o.value);
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            {needsText && (
              <textarea
                class={styles.textarea}
                value={text}
                aria-label={t('domOverride.field.newText')}
                onInput={(e) => {
                  setText(e.currentTarget.value);
                }}
              />
            )}

            <div class={styles.editorActions}>
              <Button
                block
                disabled={busy}
                onClick={() => {
                  void onApplyOverride();
                }}
              >
                {t('domOverride.applyCta')}
              </Button>
              <Button variant="ghost" size="md" onClick={onCancel}>
                {t('domOverride.cancel')}
              </Button>
            </div>
          </div>
        )}

        <p class={styles.changesHead}>{t('domOverride.changes.title')}</p>
        <div class={styles.listCard}>
          {overrides.length === 0 ? (
            <p class={styles.empty}>{t('domOverride.changes.empty')}</p>
          ) : (
            overrides.map((entry) => (
              <div key={entry.id} class={styles.row} data-testid="dom-override-list">
                <Switch
                  checked={entry.enabled}
                  disabled={busy}
                  aria-label={entry.selector}
                  onChange={(next) => {
                    void onToggle(entry.selector, next);
                  }}
                />
                <span class={styles.rowInfo}>
                  <span class={styles.rowSelector} title={entry.selector}>
                    {entry.selector}
                  </span>
                  <span class={styles.rowOp}>{describeChange(entry.op)}</span>
                </span>
                <IconButton
                  label={t('domOverride.remove')}
                  size="md"
                  disabled={busy}
                  onClick={() => {
                    void onRemove(entry.selector);
                  }}
                >
                  ×
                </IconButton>
              </div>
            ))
          )}
        </div>

        {overrides.length > 0 && (
          <div class={styles.clearRow}>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                void onClearAll();
              }}
            >
              {t('domOverride.changes.clearAll')}
            </Button>
          </div>
        )}

        <p class={styles.note}>{t('domOverride.changes.note')}</p>
      </div>
    </FeaturePanel>
  );
}
