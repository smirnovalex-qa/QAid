import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { locale, t, type Locale } from '@/i18n';
import { resolvedTheme, themeMode, type ThemeMode } from '@/ui/theme';
import { cn } from '@/ui/cn';
import { Keycap, SegmentedControl, Switch } from '@/ui/components';
import styles from './surface.module.css';

export interface SettingsViewProps {
  setLocalePersisted: (next: Locale) => void;
  setThemePersisted: (next: ThemeMode) => void;
  flash: (msg: string) => void;
}

/** Описание синхронизируемого пространства имён (ключ, i18n, вес KB, locked). */
interface Namespace {
  key: string;
  nameKey: string;
  subKey: string;
  kb: number;
  locked: boolean;
}

const NAMESPACES: Namespace[] = [
  { key: 'theme', nameKey: 'shell.ns.theme', subKey: 'shell.ns.theme.sub', kb: 0.2, locked: false },
  {
    key: 'generators',
    nameKey: 'shell.ns.generators',
    subKey: 'shell.ns.generators.sub',
    kb: 0.6,
    locked: false,
  },
  { key: 'forms', nameKey: 'shell.ns.forms', subKey: 'shell.ns.forms.sub', kb: 1.4, locked: false },
  { key: 'mocks', nameKey: 'shell.ns.mocks', subKey: 'shell.ns.mocks.sub', kb: 4.8, locked: false },
  { key: 'env', nameKey: 'shell.ns.env', subKey: 'shell.ns.env.sub', kb: 1.1, locked: false },
  {
    key: 'storage',
    nameKey: 'shell.ns.storage',
    subKey: 'shell.ns.secrets',
    kb: 0,
    locked: true,
  },
  {
    key: 'sessions',
    nameKey: 'shell.ns.sessions',
    subKey: 'shell.ns.secrets',
    kb: 0,
    locked: true,
  },
];

const QUOTA_KB = 100;

export function SettingsView(props: SettingsViewProps): JSX.Element {
  const { setLocalePersisted, setThemePersisted, flash } = props;

  const curLocale = locale.value;
  const curTheme =
    themeMode.value === 'dark' ? 'dark' : themeMode.value === 'light' ? 'light' : resolvedTheme();

  const [syncOn, setSyncOn] = useState(false);
  const [ns, setNs] = useState<Record<string, boolean>>({ theme: true, generators: true });

  const used = NAMESPACES.filter((d) => ns[d.key] && !d.locked).reduce((a, d) => a + d.kb, 0);

  return (
    <div class={styles.settings}>
      {/* язык */}
      <section class={styles.setBlock}>
        <span class={styles.setLabel}>{t('shell.language')}</span>
        <SegmentedControl
          label={t('shell.language')}
          value={curLocale}
          onChange={(v) => {
            setLocalePersisted(v as Locale);
          }}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ru', label: 'Русский' },
          ]}
        />
      </section>

      {/* тема */}
      <section class={styles.setBlock}>
        <span class={styles.setLabel}>{t('shell.theme')}</span>
        <SegmentedControl
          label={t('shell.theme')}
          value={curTheme}
          onChange={(v) => {
            setThemePersisted(v as ThemeMode);
          }}
          options={[
            { value: 'light', label: t('shell.light') },
            { value: 'dark', label: t('shell.dark') },
          ]}
        />
      </section>

      {/* синхронизация */}
      <section class={styles.setBlock}>
        <span class={styles.setLabel}>{t('shell.syncH')}</span>
        <div class={cn(styles.card, syncOn && styles.cardOn)}>
          <div class={styles.syncHead}>
            <div>
              <div class={styles.syncTitle}>{t('shell.syncOn')}</div>
              <div class={styles.syncSub}>
                {syncOn ? t('shell.syncSubOn') : t('shell.syncSubOff')}
              </div>
            </div>
            <Switch checked={syncOn} onChange={setSyncOn} aria-label={t('shell.syncOn')} />
          </div>

          {syncOn ? (
            <>
              <div class={styles.nsList}>
                {NAMESPACES.map((d) => {
                  const on = Boolean(ns[d.key]) && !d.locked;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      class={styles.nsRow}
                      aria-pressed={on}
                      onClick={() => {
                        if (d.locked) {
                          flash(t('shell.secretsNote'));
                          return;
                        }
                        setNs((prev) => ({ ...prev, [d.key]: !prev[d.key] }));
                      }}
                    >
                      <span
                        class={cn(
                          styles.nsBox,
                          on && styles.nsBoxOn,
                          d.locked && styles.nsBoxLocked,
                        )}
                        aria-hidden="true"
                      >
                        {d.locked ? '—' : on ? '✓' : ''}
                      </span>
                      <span class={styles.nsText}>
                        <span class={styles.nsName}>{t(d.nameKey)}</span>
                        <span class={styles.nsSub}>{t(d.subKey)}</span>
                      </span>
                      {!d.locked ? <span class={styles.nsSize}>{d.kb.toFixed(1)} KB</span> : null}
                    </button>
                  );
                })}
              </div>

              <div class={styles.quota}>
                <div class={styles.quotaBar}>
                  <div
                    class={styles.quotaFill}
                    style={{ width: `${Math.min(100, (used / QUOTA_KB) * 100).toFixed(1)}%` }}
                  />
                </div>
                <div class={styles.quotaLabel}>
                  {used.toFixed(1)} / {QUOTA_KB} KB
                </div>
              </div>
            </>
          ) : null}
        </div>
        <p class={styles.note}>{t('shell.syncNote')}</p>
      </section>

      {/* горячие клавиши */}
      <section class={styles.setBlock}>
        <span class={styles.setLabel}>{t('shell.shortcuts')}</span>
        <div class={styles.card}>
          <div class={styles.shortcutRow}>
            <span class={styles.shortcutLabel}>{t('shell.sc.search')}</span>
            <span class={styles.shortcutKeys}>
              <Keycap>⌘K</Keycap>
            </span>
          </div>
          <div class={styles.shortcutRow}>
            <span class={styles.shortcutLabel}>{t('shell.sc.back')}</span>
            <span class={styles.shortcutKeys}>
              <Keycap>Esc</Keycap>
            </span>
          </div>
          <div class={styles.shortcutRow}>
            <span class={styles.shortcutLabel}>{t('shell.sc.pinned')}</span>
            <span class={styles.shortcutKeys}>
              <Keycap>Alt</Keycap>
              <Keycap>1</Keycap>
              <Keycap>–</Keycap>
              <Keycap>4</Keycap>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
