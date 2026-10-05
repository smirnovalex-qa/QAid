/**
 * UI фичи «Случайные числа» (дизайн v3). Тонкий слой над чистой `logic.ts`:
 * локальная форма, одна инлайн-ошибка (кнопка дизейблится), генерация — только
 * по кнопке, персист применённых параметров через биндинг (TASK-005),
 * копирование результата с тостом.
 */
import { useEffect, useId, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Alert, Button, Field, Input, SegmentedControl, useToast } from '@/ui/components';
import { cn } from '@/ui/cn';
import { useSettings } from '@/shared/storage';
import { copyText } from '@/ui/clipboard';
import { t } from '@/i18n';
import { MAX_COUNT, batch, formatOutput, validateParams } from './logic';
import type { NumberMode, RandomNumbersParams, ValidationError } from './logic';
import { randomNumbersBinding } from './settings';
import styles from './random-numbers.module.css';

type SepMode = 'comma' | 'newline' | 'space';

function sepModeOf(sep: string): SepMode {
  if (sep === '\n') return 'newline';
  if (sep === ' ') return 'space';
  return 'comma';
}

function sepValue(mode: SepMode): string {
  switch (mode) {
    case 'comma':
      return ', ';
    case 'newline':
      return '\n';
    case 'space':
      return ' ';
  }
}

function parseNum(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

/** Одна ошибка по приоритету из прототипа; null — ошибок нет. */
function pickError(errors: readonly ValidationError[]): ValidationError | null {
  const order: ValidationError['code'][] = [
    'non_finite',
    'int_bounds_not_integer',
    'min_gt_max',
    'count_range',
    'precision_range',
  ];
  for (const code of order) {
    const e = errors.find((x) => x.code === code);
    if (e) return e;
  }
  return null;
}

function messageFor(e: ValidationError): string {
  switch (e.code) {
    case 'non_finite':
      return t('rn.err.non_finite');
    case 'int_bounds_not_integer':
      return t('rn.err.int_bounds');
    case 'min_gt_max':
      return t('rn.err.min_gt_max');
    case 'count_range':
      return t('rn.err.count_range');
    case 'precision_range':
      return t('rn.err.precision_range');
  }
}

interface Applied {
  count: number;
  min: string;
  max: string;
}

export function RandomNumbersPanel(): JSX.Element {
  const settings = useSettings(randomNumbersBinding);
  const ready = settings.ready.value;
  const errId = useId();

  const initial = randomNumbersBinding.value.value;
  const [mode, setMode] = useState<NumberMode>(initial.mode);
  const [minStr, setMinStr] = useState(String(initial.min));
  const [maxStr, setMaxStr] = useState(String(initial.max));
  const [precisionStr, setPrecisionStr] = useState(String(initial.precision));
  const [countStr, setCountStr] = useState(String(initial.count));
  const [sepMode, setSepMode] = useState<SepMode>(sepModeOf(initial.separator));
  const [output, setOutput] = useState('');
  const [applied, setApplied] = useState<Applied | null>(null);
  const [seeded, setSeeded] = useState(false);

  // Восстанавливаем сохранённые параметры один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    const p = randomNumbersBinding.value.value;
    setMode(p.mode);
    setMinStr(String(p.min));
    setMaxStr(String(p.max));
    setPrecisionStr(String(p.precision));
    setCountStr(String(p.count));
    setSepMode(sepModeOf(p.separator));
    setSeeded(true);
  }, [ready, seeded]);

  const isFloat = mode === 'float';
  const params: RandomNumbersParams = {
    mode,
    min: parseNum(minStr),
    max: parseNum(maxStr),
    // Скрытое в целочисленном режиме поле не должно блокировать генерацию.
    precision: isFloat ? parseNum(precisionStr) : initial.precision,
    count: parseNum(countStr),
    separator: sepValue(sepMode),
  };
  const err = pickError(validateParams(params));
  const errMsg = err ? messageFor(err) : '';
  const boundsInvalid =
    err !== null &&
    (err.code === 'non_finite' ||
      err.code === 'int_bounds_not_integer' ||
      err.code === 'min_gt_max');
  const countInvalid = err?.code === 'count_range';
  const precisionInvalid = err?.code === 'precision_range';

  const { show } = useToast();

  const describe = (invalid: boolean): { 'aria-invalid'?: boolean; 'aria-describedby'?: string } =>
    invalid ? { 'aria-invalid': true, 'aria-describedby': errId } : {};

  const onGenerate = (): void => {
    if (err) return;
    setOutput(formatOutput(batch(params), params.separator));
    setApplied({ count: params.count, min: minStr, max: maxStr });
    void randomNumbersBinding.set(params);
  };

  const onCopy = (): void => {
    void copyText(output).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  return (
    <div class={styles.panel}>
      <SegmentedControl
        label={t('rn.mode')}
        value={mode}
        onChange={(v) => {
          setMode(v as NumberMode);
        }}
        options={[
          { value: 'integer', label: t('rn.integer') },
          { value: 'float', label: t('rn.float') },
        ]}
      />

      <div class={styles.grid}>
        <Field label={t('rn.min')}>
          {(c) => (
            <Input
              {...c}
              {...describe(boundsInvalid)}
              class={cn(styles.mono, boundsInvalid && styles.invalid)}
              type="number"
              value={minStr}
              onInput={(e) => {
                setMinStr(e.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label={t('rn.max')}>
          {(c) => (
            <Input
              {...c}
              {...describe(boundsInvalid)}
              class={cn(styles.mono, boundsInvalid && styles.invalid)}
              type="number"
              value={maxStr}
              onInput={(e) => {
                setMaxStr(e.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label={t('rn.count')}>
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
                  show(t('rn.warn.count_clamped'), { severity: 'info' });
                } else {
                  setCountStr(raw);
                }
              }}
            />
          )}
        </Field>
        {isFloat && (
          <Field label={t('rn.precision')}>
            {(c) => (
              <Input
                {...c}
                {...describe(precisionInvalid)}
                class={cn(styles.mono, precisionInvalid && styles.invalid)}
                type="number"
                value={precisionStr}
                onInput={(e) => {
                  setPrecisionStr(e.currentTarget.value);
                }}
              />
            )}
          </Field>
        )}
      </div>

      <div class={styles.group}>
        <span class={styles.label}>{t('rn.separator')}</span>
        <SegmentedControl
          label={t('rn.separator')}
          value={sepMode}
          onChange={(v) => {
            setSepMode(v as SepMode);
          }}
          options={[
            { value: 'comma', label: t('rn.sep.comma') },
            { value: 'newline', label: t('rn.sep.newline') },
            { value: 'space', label: t('rn.sep.space') },
          ]}
        />
      </div>

      {errMsg !== '' && (
        <Alert tone="danger" id={errId}>
          {errMsg}
        </Alert>
      )}

      <Button class={styles.generate ?? ''} block onClick={onGenerate} disabled={err !== null}>
        {t('rn.generate')}
      </Button>

      {applied && output !== '' && (
        <div class={styles.card}>
          <div class={styles.cardHead}>
            <span class={styles.meta}>
              {t('rn.meta', {
                n: applied.count.toLocaleString(),
                a: applied.min,
                b: applied.max,
              })}
            </span>
            <Button variant="secondary" size="sm" onClick={onCopy}>
              {t('rn.copy')}
            </Button>
          </div>
          <textarea
            class={styles.output}
            data-testid="rn-output"
            readOnly
            value={output}
            aria-label={t('rn.output')}
          />
        </div>
      )}
    </div>
  );
}
