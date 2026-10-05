/**
 * UI «Инспектора элемента» (TASK-013 → TASK-052 → TASK-054 · редизайн v3) — тонкий
 * потребитель инспекционного слоя и общего навигатора по DOM-иерархии.
 *
 * Поток ведёт общий хук `useInspectedNode` (брокер прав + `ensure` под жестом,
 * `tabs.queryActive`, `pick`/`navigate`, session-token против гонок, `busy`/`error`,
 * `Esc`/«Отмена» + best-effort `teardown`). С `inspectorId: 'probe'` хук сам зовёт
 * `inspection/collect` после `pick` и после КАЖДОГО шага навигации. Данные пересекают
 * границу сред как `unknown` и валидируются `parseElementProps`.
 *
 * Представление перестроено к v3 «Осмотр страницы»: кнопка «Выбрать элемент» ↔ живой
 * «Остановить выбор» (danger-soft + мигающая точка) с подсказкой, карточка узла
 * (breadcrumb + селектор + размеры + ↑/↓ + «Копировать селектор» — всё даёт
 * `HierarchyNav`) и табы «Свойства» / «CSS-правила». Живой режим зеркалится в оболочку
 * через `setToolStatus`.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Badge, Button, Field, Input, Tabs, copyText } from '@/ui';
import { useToast } from '@/ui/components';
import { BoxModelDiagram, HierarchyNav, useInspectedNode } from '@/ui/inspection';
import type { BoxSidesInput } from '@/ui/inspection';
import { setToolStatus } from '@/ui/shell';
import { t } from '@/i18n';
import { PROP_INSPECTOR_ID, parseElementProps } from '@/shared/inspection/props/types';
import type {
  ContrastInfo,
  ElementGeometry,
  ElementProps,
  PropEntry,
  PropGroup,
} from '@/shared/inspection/props/types';
import type { MatchedRule } from '@/shared/inspection/rules/types';
import { threshold } from '@/shared/inspection/contrast/logic';
import styles from './inspector-probe.module.css';

/** Отбирает записи группы под фильтр по имени свойства/значению (регистронезависимо). */
function filterGroups(groups: readonly PropGroup[], query: string): PropGroup[] {
  const q = query.trim().toLowerCase();
  if (q === '') return groups.slice();
  const out: PropGroup[] = [];
  for (const group of groups) {
    const entries = group.entries.filter(
      (e) => e.property.toLowerCase().includes(q) || e.value.toLowerCase().includes(q),
    );
    if (entries.length > 0) out.push({ id: group.id, entries });
  }
  return out;
}

/** Плоский текст группы для копирования. */
function groupToText(group: PropGroup): string {
  const head = t(`inspection.probe.group.${group.id}`);
  const lines = group.entries.map((e) => `${e.property}: ${e.value}`);
  return [head, ...lines].join('\n');
}

/** Id группы box-model — визуализируется диаграммой, из плоского списка исключается. */
const BOX_GROUP_ID = 'boxModel';

/** Структурная модель box для диаграммы (реконструирована из плоских записей группы). */
interface BoxModelParts {
  readonly margin: BoxSidesInput;
  readonly border: BoxSidesInput;
  readonly padding: BoxSidesInput;
  readonly content: { readonly width: number; readonly height: number };
}

/** Парсит длину («8px», «12.5px», «auto») в число px; нечисловое → 0. */
function parsePx(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Реконструирует структурный box-model из плоских записей группы `boxModel`. */
function parseBoxModel(
  groups: readonly PropGroup[],
  geometry: ElementGeometry,
): BoxModelParts | null {
  const group = groups.find((g) => g.id === BOX_GROUP_ID);
  if (group === undefined) return null;
  const map = new Map(group.entries.map((e) => [e.property, e.value]));
  const sides = (prefix: string, suffix = ''): BoxSidesInput => ({
    top: parsePx(map.get(`${prefix}-top${suffix}`)),
    right: parsePx(map.get(`${prefix}-right${suffix}`)),
    bottom: parsePx(map.get(`${prefix}-bottom${suffix}`)),
    left: parsePx(map.get(`${prefix}-left${suffix}`)),
  });
  const padding = sides('padding');
  const border = sides('border', '-width');
  const margin = sides('margin');
  const content = {
    width: Math.max(0, geometry.width - padding.left - padding.right - border.left - border.right),
    height: Math.max(
      0,
      geometry.height - padding.top - padding.bottom - border.top - border.bottom,
    ),
  };
  return { margin, border, padding, content };
}

/** Свотч цвета: исходное computed-значение — валидный CSS, красим им заливку. */
function ColorSwatch({ value }: { value: string }): JSX.Element {
  return (
    <span class={styles.swatch} aria-hidden="true">
      <span class={styles.swatchFill} style={{ background: value }} />
    </span>
  );
}

/** Одна пара «свойство: значение» (свотч у цветовых значений + атрибуция каскада). */
function EntryRow({
  entry,
  source,
  onJump,
}: {
  entry: PropEntry;
  source?: { selector: string } | undefined;
  onJump?: (() => void) | undefined;
}): JSX.Element {
  return (
    <>
      <dt class={styles.prop}>{entry.property}</dt>
      <dd class={styles.value}>
        <span class={styles.valueLine}>
          {entry.kind === 'color' && <ColorSwatch value={entry.value} />}
          <span>{entry.value}</span>
        </span>
        {source !== undefined && (
          <button
            type="button"
            class={styles.setBy}
            onClick={onJump}
            data-testid="inspector-probe-setby"
          >
            {t('inspection.probe.rules.setBy', { selector: source.selector })}
          </button>
        )}
      </dd>
    </>
  );
}

/** Человекочитаемый источник правила (инлайн / имя таблицы / href) + контекст слоя/медиа. */
function ruleSourceLabel(rule: MatchedRule): string {
  const base =
    rule.origin === 'inline'
      ? t('inspection.probe.rules.inlineSource')
      : rule.source === '<style>'
        ? t('inspection.probe.rules.styleSheet')
        : rule.source;
  const context = [rule.layer, rule.media].filter((x): x is string => x !== null).join(' · ');
  return context !== '' ? `${base} · ${context}` : base;
}

/** Одно совпавшее правило: селектор + бейдж specificity + источник + объявления. */
function RuleCard({ rule, index }: { rule: MatchedRule; index: number }): JSX.Element {
  const [a, b, c] = rule.specificity;
  const selectorLabel =
    rule.origin === 'inline' ? t('inspection.probe.rules.inline') : rule.selectorText;
  return (
    <div class={styles.rule} id={`probe-rule-${String(index)}`} data-testid="inspector-probe-rule">
      <div class={styles.ruleHead}>
        <code class={styles.ruleSelector}>{selectorLabel}</code>
        <Badge>{t('inspection.probe.rules.specificity', { a, b, c })}</Badge>
      </div>
      <div class={styles.ruleSource}>{ruleSourceLabel(rule)}</div>
      <dl class={styles.ruleDecls}>
        {rule.declarations.map((d) => (
          <div
            key={d.property}
            class={d.winning ? styles.decl : styles.declOverridden}
            data-winning={d.winning ? 'true' : 'false'}
          >
            <span class={styles.declProp}>{d.property}</span>
            <span class={styles.declValue}>
              {d.value}
              {d.important && <span class={styles.important}>&nbsp;!important</span>}
            </span>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Строка контраста текст/фон с числом и метками WCAG (пороги — из contrast-логики). */
function ContrastRow({ info }: { info: ContrastInfo }): JSX.Element {
  const aaPass = info.ratio >= threshold('AA', info.large);
  const aaaPass = info.ratio >= threshold('AAA', info.large);
  const label = (level: 'AA' | 'AAA', pass: boolean): JSX.Element => (
    <Badge tone={pass ? 'success' : 'danger'}>
      {level} {pass ? t('inspection.probe.wcag.pass') : t('inspection.probe.wcag.fail')}
    </Badge>
  );
  return (
    <div class={styles.contrast} data-testid="inspector-probe-contrast">
      <ColorSwatch value={info.foreground} />
      <span class={styles.ratio}>{info.ratio.toFixed(2)}</span>
      {label('AA', aaPass)}
      {label('AAA', aaaPass)}
      {info.approximate && <span class={styles.metaText}>{t('inspection.probe.approximate')}</span>}
    </div>
  );
}

export function InspectorProbePanel(): JSX.Element {
  const inspected = useInspectedNode<ElementProps>({
    inspectorId: PROP_INSPECTOR_ID,
    parse: parseElementProps,
    live: true,
  });
  const { show } = useToast();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'props' | 'rules'>('props');

  // Живой режим зеркалим в оболочку (Home «Активно на вкладке» + пилюля в хедере).
  // Запись откладываем в микротаск: синхронная запись в signal во время коммита
  // может повторно войти в рендер Preact (особенно в тестах).
  useEffect(() => {
    const status = inspected.live
      ? { live: false, text: t('inspection.probe.pickingStatus') }
      : null;
    queueMicrotask(() => {
      setToolStatus('inspector-probe', status);
    });
    return () => {
      queueMicrotask(() => {
        setToolStatus('inspector-probe', null);
      });
    };
  }, [inspected.live]);

  const props = inspected.data;
  const groups = useMemo(
    () =>
      props !== null
        ? filterGroups(
            props.groups.filter((g) => g.id !== BOX_GROUP_ID),
            query,
          )
        : [],
    [props, query],
  );
  const box = useMemo(
    () => (props !== null ? parseBoxModel(props.groups, props.geometry) : null),
    [props],
  );
  const winningRuleIndex = useMemo(() => {
    const map = new Map<string, number>();
    const rules = props?.rules?.rules ?? [];
    rules.forEach((rule, i) => {
      for (const decl of rule.declarations) {
        if (decl.winning) map.set(decl.property, i);
      }
    });
    return map;
  }, [props]);

  const jumpToRule = (index: number): void => {
    setTab('rules');
    requestAnimationFrame(() => {
      document
        .getElementById(`probe-rule-${String(index)}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const copy = (text: string): void => {
    void copyText(text).then((ok) => {
      if (ok) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const attrEntries = props !== null ? Object.entries(props.attributes) : [];

  return (
    <div class={styles.panel}>
      <Button
        variant={inspected.live ? 'live' : 'primary'}
        size="lg"
        block
        loading={inspected.busy && !inspected.live}
        aria-pressed={inspected.live}
        onClick={() => {
          if (inspected.live) inspected.stopLive();
          else inspected.pick();
        }}
      >
        {inspected.live ? t('inspection.probe.stop') : t('inspection.probe.pick')}
      </Button>

      {inspected.live && (
        <p class={styles.hint} data-testid="inspector-probe-live-hint">
          {t('inspection.probe.pickHint')}
        </p>
      )}

      {inspected.error !== '' && (
        <p role="alert" class={styles.error} data-testid="inspector-probe-error">
          {t(inspected.error)}
        </p>
      )}

      {inspected.state === null && !inspected.live && (
        <p class={styles.intro} data-testid="inspector-probe-hint">
          {t('inspection.probe.intro')}
        </p>
      )}

      {inspected.state !== null && (
        <div class={styles.nodeCard}>
          <HierarchyNav
            state={inspected.state}
            busy={inspected.busy}
            onStep={inspected.navigate}
            onCopySelector={copy}
            onHoverTarget={inspected.highlightTarget}
          />
        </div>
      )}

      {props !== null && (
        <Tabs
          tabs={[
            { id: 'props', label: t('inspection.probe.tab.props') },
            { id: 'rules', label: t('inspection.probe.tab.rules') },
          ]}
          activeId={tab}
          onChange={(id) => {
            setTab(id as 'props' | 'rules');
          }}
        >
          {tab === 'props' ? (
            <div class={styles.tabBody}>
              {box !== null && (
                <section class={styles.section} data-testid="inspector-probe-box">
                  <h4 class={styles.sectionTitle}>{t('inspection.box.title')}</h4>
                  <BoxModelDiagram
                    margin={box.margin}
                    border={box.border}
                    padding={box.padding}
                    content={box.content}
                    format={(px) => String(Math.round(px))}
                  />
                </section>
              )}

              {props.contrast != null && (
                <section class={styles.section}>
                  <h4 class={styles.sectionTitle}>{t('inspection.probe.contrast')}</h4>
                  <ContrastRow info={props.contrast} />
                </section>
              )}

              <Field label={t('inspection.probe.filter')}>
                {(c) => (
                  <Input
                    {...c}
                    value={query}
                    placeholder={t('inspection.probe.filter.placeholder')}
                    onInput={(e) => {
                      setQuery(e.currentTarget.value);
                    }}
                  />
                )}
              </Field>

              {attrEntries.length > 0 && query.trim() === '' && (
                <section class={styles.section} data-testid="inspector-probe-attributes">
                  <h4 class={styles.sectionTitle}>{t('inspection.probe.attributes')}</h4>
                  <dl class={styles.entries}>
                    {attrEntries.map(([name, value]) => (
                      <EntryRow key={name} entry={{ property: name, value, kind: 'text' }} />
                    ))}
                  </dl>
                </section>
              )}

              {groups.map((group) => (
                <section class={styles.section} key={group.id} data-testid="inspector-probe-group">
                  <div class={styles.sectionHead}>
                    <h4 class={styles.sectionTitle}>{t(`inspection.probe.group.${group.id}`)}</h4>
                    <button
                      type="button"
                      class={styles.copyGroup}
                      onClick={() => {
                        copy(groupToText(group));
                      }}
                    >
                      {t('inspection.probe.copyGroup')}
                    </button>
                  </div>
                  <dl class={styles.entries}>
                    {group.entries.map((entry) => {
                      const src = props.rules?.propertySources[entry.property];
                      const idx = winningRuleIndex.get(entry.property);
                      return (
                        <EntryRow
                          key={entry.property}
                          entry={entry}
                          source={src !== undefined ? { selector: src.selectorText } : undefined}
                          onJump={
                            idx !== undefined
                              ? () => {
                                  jumpToRule(idx);
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                  </dl>
                </section>
              ))}

              {groups.length === 0 && query.trim() !== '' && (
                <p class={styles.empty} data-testid="inspector-probe-empty">
                  {t('inspection.probe.noMatch')}
                </p>
              )}
            </div>
          ) : (
            <div class={styles.tabBody} data-testid="inspector-probe-rules">
              {props.rules == null || props.rules.rules.length === 0 ? (
                <p class={styles.empty} data-testid="inspector-probe-rules-empty">
                  {t('inspection.probe.rules.empty')}
                </p>
              ) : (
                <div class={styles.rules}>
                  {props.rules.rules.map((rule, i) => (
                    <RuleCard
                      key={`${rule.source}|${rule.selectorText}|${String(i)}`}
                      rule={rule}
                      index={i}
                    />
                  ))}
                </div>
              )}
              {props.rules?.truncated === true && (
                <p class={styles.ruleNotice} data-testid="inspector-probe-rules-truncated">
                  {t('inspection.probe.rules.truncated')}
                </p>
              )}
              {props.rules != null && props.rules.unreadableSheets > 0 && (
                <p class={styles.ruleNotice} data-testid="inspector-probe-rules-cors">
                  {t('inspection.probe.rules.cors', { count: props.rules.unreadableSheets })}
                </p>
              )}
            </div>
          )}
        </Tabs>
      )}

      {(inspected.busy || inspected.state !== null) && (
        <Button variant="secondary" onClick={inspected.cancel}>
          {t('inspection.cancel')}
        </Button>
      )}
    </div>
  );
}
