/**
 * UI фичи «Случайный текст» (дизайн v3). Тонкий слой над чистой `logic.ts`:
 * чипы наборов символов, длина/количество, «Ещё настройки», одна инлайн-ошибка
 * (кнопка дизейблится), генерация — только по кнопке, персист применённых
 * параметров через биндинг (TASK-005), вывод Text/JSON/CSV с копированием.
 */
import { useEffect, useId, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  Alert,
  Button,
  Chip,
  Collapsible,
  Field,
  Input,
  SegmentedControl,
  useToast,
} from '@/ui/components';
import { cn } from '@/ui/cn';
import { useSettings } from '@/shared/storage';
import { copyText } from '@/ui/clipboard';
import { toCSV, toJSON, toPlainText } from '@/shared/export/export';
import { t } from '@/i18n';
import { MAX_COUNT, MAX_LENGTH, batch, validateParams } from './logic';
import type { CaseTransform, RandomStringsParams, ValidationError } from './logic';
import type { AlphabetOptions } from './types';
import { randomStringsBinding } from './settings';
import styles from './random-strings.module.css';

type CharsetFlag =
  'latinLower' | 'latinUpper' | 'cyrillicLower' | 'cyrillicUpper' | 'digits' | 'special' | 'emoji';

type CharsetFlags = Record<CharsetFlag, boolean>;
type ExportFormat = 'plain' | 'json' | 'csv';

const CHARSET_ORDER: readonly CharsetFlag[] = [
  'latinLower',
  'latinUpper',
  'cyrillicLower',
  'cyrillicUpper',
  'digits',
  'special',
  'emoji',
];

const CHARSET_LABEL: Record<CharsetFlag, string> = {
  latinLower: 'rs.latinLower',
  latinUpper: 'rs.latinUpper',
  cyrillicLower: 'rs.cyrillicLower',
  cyrillicUpper: 'rs.cyrillicUpper',
  digits: 'rs.digits',
  special: 'rs.special',
  emoji: 'rs.emoji',
};

function flagsOf(a: AlphabetOptions): CharsetFlags {
  return {
    latinLower: a.latinLower,
    latinUpper: a.latinUpper,
    cyrillicLower: a.cyrillicLower,
    cyrillicUpper: a.cyrillicUpper,
    digits: a.digits,
    special: a.special,
    emoji: a.emoji,
  };
}

function parseNum(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

type ErrKind = 'length_bad' | 'length_order' | 'count' | 'alphabet';

/** Одна ошибка по приоритету из прототипа; null — ошибок нет. */
function pickError(errors: readonly ValidationError[], p: RandomStringsParams): ErrKind | null {
  const has = (code: ValidationError['code']): boolean => errors.some((e) => e.code === code);
  if (has('length_range') || has('length_too_big')) {
    const bad =
      !Number.isInteger(p.lengthFrom) ||
      !Number.isInteger(p.lengthTo) ||
      p.lengthFrom < 0 ||
      p.lengthTo < 0 ||
      p.lengthTo > MAX_LENGTH;
    return bad ? 'length_bad' : 'length_order';
  }
  if (has('count_range')) return 'count';
  if (has('empty_alphabet')) return 'alphabet';
  return null;
}

const ERR_KEY: Record<ErrKind, string> = {
  length_bad: 'rs.err.length_bad',
  length_order: 'rs.err.length_order',
  count: 'rs.err.count_range',
  alphabet: 'rs.err.empty_alphabet',
};

export function RandomStringsPanel(): JSX.Element {
  const settings = useSettings(randomStringsBinding);
  const ready = settings.ready.value;
  const errId = useId();

  const initial = randomStringsBinding.value.value;
  const [flags, setFlags] = useState<CharsetFlags>(flagsOf(initial.alphabet));
  const [customStr, setCustomStr] = useState(initial.alphabet.custom);
  const [lengthFromStr, setLengthFromStr] = useState(String(initial.lengthFrom));
  const [lengthToStr, setLengthToStr] = useState(String(initial.lengthTo));
  const [prefix, setPrefix] = useState(initial.prefix);
  const [suffix, setSuffix] = useState(initial.suffix);
  const [caseTransform, setCaseTransform] = useState<CaseTransform>(initial.caseTransform);
  const [countStr, setCountStr] = useState(String(initial.count));
  const [exportFormat, setExportFormat] = useState<ExportFormat>('plain');
  const [rows, setRows] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Восстанавливаем сохранённые параметры один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    const p = randomStringsBinding.value.value;
    setFlags(flagsOf(p.alphabet));
    setCustomStr(p.alphabet.custom);
    setLengthFromStr(String(p.lengthFrom));
    setLengthToStr(String(p.lengthTo));
    setPrefix(p.prefix);
    setSuffix(p.suffix);
    setCaseTransform(p.caseTransform);
    setCountStr(String(p.count));
    setSeeded(true);
  }, [ready, seeded]);

  const params: RandomStringsParams = {
    alphabet: { ...flags, custom: customStr },
    lengthFrom: parseNum(lengthFromStr),
    lengthTo: parseNum(lengthToStr),
    prefix,
    suffix,
    caseTransform,
    count: parseNum(countStr),
  };
  const kind = pickError(validateParams(params), params);
  const errMsg = kind ? t(ERR_KEY[kind]) : '';
  const lengthInvalid = kind === 'length_bad' || kind === 'length_order';
  const countInvalid = kind === 'count';

  const caseLabel: Record<CaseTransform, string> = {
    none: t('rs.case.none'),
    upper: t('rs.case.upper'),
    lower: t('rs.case.lower'),
    title: t('rs.case.title'),
  };
  const extras = [
    customStr !== '' && t('rs.extra.custom'),
    (prefix !== '' || suffix !== '') && t('rs.extra.affix'),
    caseTransform !== 'none' && caseLabel[caseTransform],
  ].filter(Boolean);
  const moreSummary = extras.join(', ');

  const { show } = useToast();

  const describe = (invalid: boolean): { 'aria-invalid'?: boolean; 'aria-describedby'?: string } =>
    invalid ? { 'aria-invalid': true, 'aria-describedby': errId } : {};

  const onGenerate = (): void => {
    if (kind) return;
    setRows(batch(params));
    void randomStringsBinding.set(params);
  };

  const shown =
    exportFormat === 'json'
      ? toJSON({ rows })
      : exportFormat === 'csv'
        ? toCSV({ rows })
        : toPlainText({ rows });

  const onCopy = (): void => {
    void copyText(shown).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  return (
    <div class={styles.panel}>
      <div class={styles.group}>
        <span class={styles.label}>{t('rs.charset')}</span>
        <div class={styles.chips}>
          {CHARSET_ORDER.map((key) => (
            <Chip
              key={key}
              pressed={flags[key]}
              onClick={() => {
                setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
              }}
            >
              {t(CHARSET_LABEL[key])}
            </Chip>
          ))}
        </div>
      </div>

      <div class={styles.grid3}>
        <Field label={t('rs.lengthFrom')}>
          {(c) => (
            <Input
              {...c}
              {...describe(lengthInvalid)}
              class={cn(styles.mono, lengthInvalid && styles.invalid)}
              type="number"
              value={lengthFromStr}
              onInput={(e) => {
                setLengthFromStr(e.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label={t('rs.lengthTo')}>
          {(c) => (
            <Input
              {...c}
              {...describe(lengthInvalid)}
              class={cn(styles.mono, lengthInvalid && styles.invalid)}
              type="number"
              value={lengthToStr}
              onInput={(e) => {
                setLengthToStr(e.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label={t('rs.count')}>
          {(c) => (
            <Input
              {...c}
              {...describe(countInvalid)}
              class={cn(styles.mono, countInvalid && styles.invalid)}
              type="number"
              value={countStr}
              onInput={(e) => {
                const raw = e.currentTarget.value;
                const n = parseNum(raw);
                if (Number.isFinite(n) && n > MAX_COUNT) {
                  setCountStr(String(MAX_COUNT));
                  show(t('rs.warn.count_clamped'), { severity: 'info' });
                } else {
                  setCountStr(raw);
                }
              }}
            />
          )}
        </Field>
      </div>

      <Collapsible label={t('rs.more')} summary={moreSummary}>
        <div class={styles.more}>
          <Field label={t('rs.custom')}>
            {(c) => (
              <Input
                {...c}
                class={styles.mono ?? ''}
                value={customStr}
                placeholder={t('rs.customPh')}
                onInput={(e) => {
                  setCustomStr(e.currentTarget.value);
                }}
              />
            )}
          </Field>
          <div class={styles.grid2}>
            <Field label={t('rs.prefix')}>
              {(c) => (
                <Input
                  {...c}
                  class={styles.mono ?? ''}
                  value={prefix}
                  placeholder="user_"
                  onInput={(e) => {
                    setPrefix(e.currentTarget.value);
                  }}
                />
              )}
            </Field>
            <Field label={t('rs.suffix')}>
              {(c) => (
                <Input
                  {...c}
                  class={styles.mono ?? ''}
                  value={suffix}
                  placeholder="@test.io"
                  onInput={(e) => {
                    setSuffix(e.currentTarget.value);
                  }}
                />
              )}
            </Field>
          </div>
          <div class={styles.group}>
            <span class={styles.label}>{t('rs.caseTransform')}</span>
            <SegmentedControl
              label={t('rs.caseTransform')}
              value={caseTransform}
              onChange={(v) => {
                setCaseTransform(v as CaseTransform);
              }}
              options={[
                { value: 'none', label: caseLabel.none },
                { value: 'upper', label: caseLabel.upper },
                { value: 'lower', label: caseLabel.lower },
                { value: 'title', label: caseLabel.title },
              ]}
            />
          </div>
        </div>
      </Collapsible>

      {errMsg !== '' && (
        <Alert tone="danger" id={errId}>
          {errMsg}
        </Alert>
      )}

      <Button class={styles.generate ?? ''} block onClick={onGenerate} disabled={kind !== null}>
        {t('rs.generate')}
      </Button>

      {rows.length > 0 && (
        <div class={styles.card}>
          <div class={styles.cardHead}>
            <SegmentedControl
              size="sm"
              class={styles.fmt ?? ''}
              label={t('rs.exportFormat')}
              value={exportFormat}
              onChange={(v) => {
                setExportFormat(v as ExportFormat);
              }}
              options={[
                { value: 'plain', label: t('rs.export.plain') },
                { value: 'json', label: t('rs.export.json') },
                { value: 'csv', label: t('rs.export.csv') },
              ]}
            />
            <Button variant="secondary" size="sm" onClick={onCopy}>
              {t('rs.copy')}
            </Button>
          </div>
          <textarea
            class={styles.output}
            data-testid="rs-output"
            readOnly
            value={shown}
            aria-label={t('rs.output')}
          />
        </div>
      )}
    </div>
  );
}
