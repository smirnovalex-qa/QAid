/**
 * UI фичи «Time, hash & UUID» (дизайн v3). Тонкий слой над чистой `logic.ts`:
 * собственные под-вкладки (`Tabs`, по умолчанию первая), пересчёт «на лету»,
 * копирование строк по клику с тостом. Предпочтения (зона, алгоритм) персистятся
 * через биндинг (TASK-005). Рендерится внутри tool-view оболочки — без заголовка.
 */
import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Alert, Button, Field, SegmentedControl, Select, Tabs, useToast } from '@/ui/components';
import { cn } from '@/ui/cn';
import { useSettings } from '@/shared/storage';
import { copyText } from '@/ui/clipboard';
import { locale, t } from '@/i18n';
import {
  MAX_UUID_BATCH,
  bytesToBase64,
  diff,
  fromEpochMs,
  hashText,
  md5,
  parseUnix,
  uuidV4Batch,
} from './logic';
import type { HashAlgo, TimestampView } from './types';
import { tsHashBinding } from './settings';
import styles from './timestamp-hash.module.css';

type SubTab = 'time' | 'hash' | 'uuid';
const TAB_IDS: SubTab[] = ['time', 'hash', 'uuid'];

const ALGOS: HashAlgo[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'MD5'];

/** Зоны из прототипа; текущая сохранённая зона добавляется в список при необходимости. */
const ZONES = [
  'UTC',
  'Europe/Moscow',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

type TimeKind = 's' | 'ms' | 'iso';
interface ParsedTime {
  ms: number;
  kind: TimeKind;
}

/** Автоопределение: Unix-секунды / Unix-мс / дата (как в прототипе). */
function parseTime(raw: string): ParsedTime | null {
  const s = raw.trim();
  if (s === '') return null;
  if (/^-?\d{1,11}(\.\d+)?$/.test(s)) {
    const r = parseUnix(s, 'seconds');
    return r.ok ? { ms: r.value, kind: 's' } : null;
  }
  if (/^-?\d{12,16}$/.test(s)) {
    const r = parseUnix(s, 'milliseconds');
    return r.ok ? { ms: r.value, kind: 'ms' } : null;
  }
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : { ms, kind: 'iso' };
}

/** «UTC+03:00» из смещения в минутах. */
function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/** Относительное время («через 2 часа») по активной локали. */
function relativeTime(ms: number): string {
  const d = (ms - Date.now()) / 1000;
  const a = Math.abs(d);
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  if (a < 60) return rtf.format(Math.round(d), 'second');
  if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  return rtf.format(Math.round(d / 86400), 'day');
}

/** Парсит hex-строку в байты (для base64-представления MD5). */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

interface CopyRowProps {
  label: string;
  value: string;
  onCopy: (value: string) => void;
  /** Подпись сверху (стек) вместо колонки; для длинных значений хеша. */
  stacked?: boolean;
  testId?: string;
}

/** Строка «подпись → значение» с копированием по клику (кнопка, доступна с клавиатуры). */
function CopyRow(props: CopyRowProps): JSX.Element {
  const { label, value, onCopy, stacked = false, testId } = props;
  return (
    <button
      type="button"
      class={cn(styles.copyRow, stacked && styles.stacked)}
      title={t('tsh.clickCopy')}
      data-testid={testId}
      onClick={() => {
        onCopy(value);
      }}
    >
      <span class={styles.rowLabel}>{label}</span>
      <span class={cn(styles.rowValue, stacked && styles.wrap)}>{value}</span>
      {!stacked && (
        <span class={styles.rowIcon} aria-hidden="true">
          ⧉
        </span>
      )}
    </button>
  );
}

export function TimestampHashPanel(): JSX.Element {
  const settings = useSettings(tsHashBinding);
  const ready = settings.ready.value;
  const initial = tsHashBinding.value.value;
  const { show } = useToast();

  const [tab, setTab] = useState<SubTab>('time');
  const [zone, setZone] = useState<string>(initial.zone);
  const [algo, setAlgo] = useState<HashAlgo>(initial.algo);
  const [seeded, setSeeded] = useState(false);

  // Время
  const [timeIn, setTimeIn] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [diffA, setDiffA] = useState('2026-10-01T09:00:00Z');
  const [diffB, setDiffB] = useState('2026-10-03T14:32:10Z');

  // Хеш
  const [hashIn, setHashIn] = useState('hello');
  const [hex, setHex] = useState('');
  const [b64, setB64] = useState('');

  // UUID
  const [countStr, setCountStr] = useState('5');
  const [uuids, setUuids] = useState<string[]>(() => uuidV4Batch(5));

  const timeId = useId();
  const timeMsgId = useId();
  const hashId = useId();
  const countId = useId();

  // Восстанавливаем сохранённые предпочтения один раз после первой загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    const s = tsHashBinding.value.value;
    setZone(s.zone);
    setAlgo(s.algo);
    setSeeded(true);
  }, [ready, seeded]);

  // Пересчёт хеша при изменении входа/алгоритма.
  useEffect(() => {
    let alive = true;
    const run = async (): Promise<void> => {
      if (algo === 'MD5') {
        const h = md5(hashIn);
        if (alive) {
          setHex(h);
          setB64(bytesToBase64(hexToBytes(h)));
        }
        return;
      }
      const res = await hashText(hashIn, algo);
      if (alive) {
        setHex(res.hex);
        setB64(res.base64);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [hashIn, algo]);

  const zoneOptions = useMemo(() => {
    const list = ZONES.includes(zone) ? ZONES : [zone, ...ZONES];
    return list.map((z) => ({ value: z, label: z }));
  }, [zone]);

  const copy = (value: string, message?: string): void => {
    if (value === '') return;
    void copyText(value).then((okFlag) => {
      if (okFlag) show(message ?? t('toast.copied'), { severity: 'success' });
    });
  };

  // — Время —
  const parsed = parseTime(timeIn);
  const viewRes = parsed ? fromEpochMs(parsed.ms, zone) : null;
  const view: TimestampView | null = viewRes?.ok ? viewRes.value : null;
  const timeInvalid = timeIn.trim() !== '' && (parsed === null || view === null);
  const detected = parsed
    ? t(`tsh.detect.${parsed.kind}`)
    : timeIn.trim() === ''
      ? ''
      : t('tsh.detect.err');

  const timeRows = view
    ? [
        { key: 'unixS', label: t('tsh.row.unixS'), value: String(view.epochSeconds) },
        { key: 'unixMs', label: t('tsh.row.unixMs'), value: String(view.epochMs) },
        { key: 'iso', label: t('tsh.row.iso'), value: view.iso },
        {
          key: 'zone',
          label: zone.split('/').pop()?.replace('_', ' ') ?? zone,
          value: `${view.inZone} ${offsetLabel(view.offsetMinutes)}`,
        },
        { key: 'rel', label: t('tsh.row.relative'), value: relativeTime(view.epochMs) },
      ]
    : [];

  const pa = parseTime(diffA);
  const pb = parseTime(diffB);
  let diffText = t('tsh.diff.empty');
  if (pa && pb) {
    const d = diff(pa.ms, pb.ms);
    diffText =
      `${d.ms < 0 ? '−' : ''}${String(d.days)}${t('tsh.unit.d')} ${String(d.hours)}${t('tsh.unit.h')} ` +
      `${String(d.minutes)}${t('tsh.unit.m')} ${String(d.seconds)}${t('tsh.unit.s')}  ·  ` +
      `${d.ms > 0 ? '+' : ''}${d.ms.toLocaleString(locale.value)} ${t('tsh.unit.ms')}`;
  }

  // — UUID —
  const generate = (): void => {
    const n = Math.max(1, Math.min(MAX_UUID_BATCH, Number.parseInt(countStr, 10) || 1));
    setCountStr(String(n));
    setUuids(uuidV4Batch(n));
  };

  const timePanel = (
    <div class={styles.body}>
      <div class={styles.inputRow}>
        <div class={styles.grow}>
          <label class={styles.label} for={timeId}>
            {t('tsh.time.input')}
          </label>
          <input
            id={timeId}
            class={cn(styles.input, timeInvalid && styles.invalid)}
            data-testid="tsh-time-input"
            spellcheck={false}
            value={timeIn}
            aria-invalid={timeInvalid ? true : undefined}
            aria-describedby={timeMsgId}
            onInput={(e) => {
              setTimeIn(e.currentTarget.value);
            }}
          />
        </div>
        <Button
          size="md"
          class={styles.nowBtn}
          onClick={() => {
            setTimeIn(String(Math.floor(Date.now() / 1000)));
          }}
        >
          {t('tsh.now')}
        </Button>
      </div>
      <span
        id={timeMsgId}
        class={cn(styles.help, timeInvalid && styles.helpError)}
        role={timeInvalid ? 'alert' : undefined}
        data-testid="tsh-detected"
      >
        {detected}
      </span>

      {timeRows.length > 0 && (
        <div class={styles.card} data-testid="tsh-time-rows">
          {timeRows.map((r) => (
            <CopyRow key={r.key} label={r.label} value={r.value} onCopy={copy} />
          ))}
        </div>
      )}

      <Field label={t('tsh.zone.label')}>
        {(c) => (
          <Select
            {...c}
            value={zone}
            options={zoneOptions}
            onChange={(e) => {
              setZone(e.currentTarget.value);
              void tsHashBinding.update({ zone: e.currentTarget.value });
            }}
          />
        )}
      </Field>

      <section class={styles.diffCard} aria-label={t('tsh.diff.title')}>
        <h4 class={styles.diffTitle}>{t('tsh.diff.title')}</h4>
        <div class={styles.diffGrid}>
          <input
            aria-label={t('tsh.diff.from')}
            spellcheck={false}
            value={diffA}
            class={cn(styles.input, styles.mono)}
            onInput={(e) => {
              setDiffA(e.currentTarget.value);
            }}
          />
          <input
            aria-label={t('tsh.diff.to')}
            spellcheck={false}
            value={diffB}
            class={cn(styles.input, styles.mono)}
            onInput={(e) => {
              setDiffB(e.currentTarget.value);
            }}
          />
        </div>
        <span class={styles.diffText} aria-live="polite" data-testid="tsh-diff-result">
          {diffText}
        </span>
      </section>
    </div>
  );

  const hashPanel = (
    <div class={styles.body}>
      <div class={styles.group}>
        <label class={styles.label} for={hashId}>
          {t('tsh.hash.input')}
        </label>
        <textarea
          id={hashId}
          class={styles.area}
          data-testid="tsh-hash-input"
          spellcheck={false}
          value={hashIn}
          onInput={(e) => {
            setHashIn(e.currentTarget.value);
          }}
        />
      </div>

      <SegmentedControl
        label={t('tsh.hash.algo')}
        value={algo}
        onChange={(v) => {
          setAlgo(v as HashAlgo);
          void tsHashBinding.update({ algo: v as HashAlgo });
        }}
        options={ALGOS.map((a) => ({ value: a, label: a }))}
      />

      {algo === 'MD5' && <Alert tone="warn">{t('tsh.md5.warn')}</Alert>}

      <div class={styles.card} aria-live="polite">
        <CopyRow
          stacked
          label={`HEX · ${t('tsh.clickCopy')}`}
          value={hex}
          onCopy={copy}
          testId="tsh-hash-hex"
        />
        <CopyRow
          stacked
          label={`Base64 · ${t('tsh.clickCopy')}`}
          value={b64}
          onCopy={copy}
          testId="tsh-hash-b64"
        />
      </div>
    </div>
  );

  const uuidPanel = (
    <div class={styles.body}>
      <div class={styles.inputRow}>
        <div class={styles.countBox}>
          <label class={styles.label} for={countId}>
            {t('tsh.uuid.count')}
          </label>
          <input
            id={countId}
            class={styles.input}
            inputMode="numeric"
            value={countStr}
            onInput={(e) => {
              const raw = e.currentTarget.value;
              const n = Number(raw);
              setCountStr(Number.isFinite(n) && n > MAX_UUID_BATCH ? String(MAX_UUID_BATCH) : raw);
            }}
          />
        </div>
        <Button class={styles.grow} onClick={generate}>
          {t('tsh.uuid.generate')}
        </Button>
      </div>
      <div class={styles.card}>
        <div class={styles.cardHead}>
          <span class={styles.meta}>{t('tsh.uuid.meta', { n: uuids.length })}</span>
          <button
            type="button"
            class={styles.copyBtn}
            onClick={() => {
              copy(uuids.join('\n'), t('tsh.copiedN', { n: uuids.length }));
            }}
          >
            {t('tsh.copyAll')}
          </button>
        </div>
        <pre class={styles.out} data-testid="tsh-uuid-output">
          {uuids.join('\n')}
        </pre>
      </div>
    </div>
  );

  return (
    <div class={styles.panel}>
      <Tabs
        tabs={TAB_IDS.map((id) => ({ id, label: t(`tsh.tab.${id}`) }))}
        activeId={tab}
        onChange={(id) => {
          setTab(id as SubTab);
        }}
      >
        {tab === 'time' ? timePanel : tab === 'hash' ? hashPanel : uuidPanel}
      </Tabs>
    </div>
  );
}
