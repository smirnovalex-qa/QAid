/**
 * UI фичи «Decode & format» (JWT · Base64 · URL · JSON), дизайн v3. Тонкий слой над
 * чистой `logic.ts`: собственные под-вкладки (`Tabs`, по умолчанию первая), пересчёт
 * «на лету» с дебаунсом ~150мс, копирование с тостом, «Сделать вводом» (меняет режим).
 * Рендерится внутри tool-view оболочки — без собственного заголовка.
 */
import { useEffect, useId, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Alert, Badge, Chip, SegmentedControl, Tabs, useToast } from '@/ui/components';
import { cn } from '@/ui/cn';
import { copyText } from '@/ui/clipboard';
import { locale, t } from '@/i18n';
import {
  decodeBase64,
  decodeJwt,
  decodeUrl,
  encodeBase64,
  encodeUrl,
  minifyJson,
  prettyJson,
  validateJson,
} from './logic';
import type { DecodeError, DecodeResult, DecoderTab, JwtDecoded } from './types';
import styles from './decoders.module.css';

const DEBOUNCE_MS = 150;

type Direction = 'encode' | 'decode';
type JsonAction = 'format' | 'minify' | 'validate';

interface ComputeInput {
  tab: DecoderTab;
  input: string;
  urlSafe: boolean;
  wholeUrl: boolean;
  b64Dir: Direction;
  urlDir: Direction;
  jsonAction: JsonAction;
  indent: number;
}

interface ErrView {
  title: string;
  msg: string;
}

interface ComputeOutput {
  output: string;
  error: ErrView | null;
  jwt: JwtDecoded | null;
}

const EMPTY: ComputeOutput = { output: '', error: null, jwt: null };

/** Переводит ошибку логики в «заголовок + деталь» (тексты из прототипа). */
function errView(e: DecodeError, tab: DecoderTab, input: string): ErrView {
  switch (e.kind) {
    case 'too-large':
      return { title: t('dec.err.large.title'), msg: t('dec.err.large.msg') };
    case 'invalid-json':
      return {
        title: t('dec.err.json.title'),
        msg: e.position
          ? t('dec.err.json.at', {
              line: e.position.line,
              column: e.position.column,
              offset: e.position.offset,
            })
          : e.message,
      };
    case 'invalid-url-escape':
      return {
        title: t('dec.err.url.title'),
        msg: t('dec.err.url.msg', { pos: (e.position?.offset ?? input.indexOf('%')) + 1 }),
      };
    case 'invalid-utf8':
      return { title: t('dec.err.decode.title'), msg: t('dec.err.utf8.msg') };
    case 'malformed-jwt':
      return input.trim().split('.').length < 3
        ? { title: t('dec.err.notJwt.title'), msg: t('dec.err.notJwt.msg') }
        : { title: t('dec.err.decode.title'), msg: t('dec.err.jwtPart.msg') };
    case 'invalid-base64':
    case 'empty-input':
      return {
        title: t('dec.err.decode.title'),
        msg: tab === 'jwt' ? t('dec.err.jwtPart.msg') : t('dec.err.base64.msg'),
      };
  }
}

/** Приводит строковый {@link DecodeResult} к состоянию панели. */
function fromResult(r: DecodeResult<string>, p: ComputeInput): ComputeOutput {
  return r.ok
    ? { output: r.value, error: null, jwt: null }
    : { output: '', error: errView(r.error, p.tab, p.input), jwt: null };
}

/** Чистое вычисление результата активной под-вкладки (пустой ввод → нейтрально). */
function compute(p: ComputeInput): ComputeOutput {
  if (p.input.trim() === '') return EMPTY;
  switch (p.tab) {
    case 'base64':
      if (p.b64Dir === 'encode') {
        return fromResult(
          encodeBase64(p.input, {
            variant: p.urlSafe ? 'url-safe' : 'standard',
            padding: !p.urlSafe,
          }),
          p,
        );
      }
      // Как в прототипе: «-» и «_» в тексте допустимы и без чипа URL-safe.
      return fromResult(
        decodeBase64(p.input, {
          variant: p.urlSafe || /[-_]/.test(p.input) ? 'url-safe' : 'standard',
        }),
        p,
      );
    case 'url': {
      const mode = p.wholeUrl ? 'full' : 'component';
      return fromResult(
        p.urlDir === 'encode' ? encodeUrl(p.input, mode) : decodeUrl(p.input, mode),
        p,
      );
    }
    case 'json': {
      if (p.jsonAction === 'minify') return fromResult(minifyJson(p.input), p);
      if (p.jsonAction === 'validate') {
        const r = validateJson(p.input);
        return r.ok
          ? { output: t('dec.json.valid'), error: null, jwt: null }
          : { output: '', error: errView(r.error, p.tab, p.input), jwt: null };
      }
      return fromResult(prettyJson(p.input, { indent: p.indent }), p);
    }
    case 'jwt': {
      const r = decodeJwt(p.input.trim());
      if (!r.ok) return { output: '', error: errView(r.error, p.tab, p.input), jwt: null };
      return { output: '', error: null, jwt: r.value };
    }
  }
}

const PLACEHOLDERS: Record<DecoderTab, string> = {
  jwt: 'eyJhbGciOi…',
  base64: 'SGVsbG8=',
  url: 'https%3A%2F%2F…',
  json: '{"key": "value"}',
};

const TAB_IDS: DecoderTab[] = ['jwt', 'base64', 'url', 'json'];

/** Локальное время для JWT-claims (язык — из активной локали). */
function formatEpoch(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-GB');
}

export function DecodersPanel(): JSX.Element {
  const [tab, setTab] = useState<DecoderTab>('jwt');
  const [inputs, setInputs] = useState<Record<DecoderTab, string>>({
    jwt: '',
    base64: '',
    url: '',
    json: '',
  });
  const [b64Dir, setB64Dir] = useState<Direction>('decode');
  const [urlDir, setUrlDir] = useState<Direction>('decode');
  const [urlSafe, setUrlSafe] = useState(false);
  const [wholeUrl, setWholeUrl] = useState(false);
  const [jsonAction, setJsonAction] = useState<JsonAction>('format');
  const [indent, setIndent] = useState(2);

  const [result, setResult] = useState<ComputeOutput>(EMPTY);
  const { show } = useToast();

  const inputId = useId();
  const errId = useId();
  const input = inputs[tab];

  // Применение с дебаунсом: любой релевантный вход перезапускает таймер.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setResult(compute({ tab, input, urlSafe, wholeUrl, b64Dir, urlDir, jsonAction, indent }));
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [tab, input, urlSafe, wholeUrl, b64Dir, urlDir, jsonAction, indent]);

  const { output, error, jwt } = result;

  const copyStr = (value: string): void => {
    if (value === '') return;
    void copyText(value).then((okFlag) => {
      if (okFlag) show(t('toast.copied'), { severity: 'success' });
    });
  };

  const dir = tab === 'url' ? urlDir : b64Dir;
  const setDir = tab === 'url' ? setUrlDir : setB64Dir;
  const dirOptions = [
    { value: 'decode', label: t('dec.decode') },
    { value: 'encode', label: t('dec.encode') },
  ];

  const canSwap = output !== '' && (tab === 'base64' || tab === 'url');
  const onSwap = (): void => {
    setInputs({ ...inputs, [tab]: output });
    setDir(dir === 'encode' ? 'decode' : 'encode');
  };

  let outLabel = t('dec.out.decoded');
  if (tab === 'json') {
    outLabel = jsonAction === 'validate' ? t('dec.out.result') : t('dec.out.formatted');
  } else if (dir === 'encode') {
    outLabel = t('dec.out.encoded');
  }

  // JWT: статус + времена.
  let jwtBadge: JSX.Element | null = null;
  let jwtTimes = '';
  if (jwt) {
    const c = jwt.claims;
    jwtBadge = c.expired ? (
      <Badge tone="danger">{t('dec.jwt.expired')}</Badge>
    ) : c.notYetValid ? (
      <Badge tone="warning">{t('dec.jwt.notYetValid')}</Badge>
    ) : (
      <Badge tone="success">{t('dec.jwt.valid')}</Badge>
    );
    jwtTimes = [
      c.iat ? t('dec.jwt.issued', { when: formatEpoch(c.iat.epochSeconds) }) : '',
      c.exp ? t('dec.jwt.expires', { when: formatEpoch(c.exp.epochSeconds) }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  const headerText = jwt ? JSON.stringify(jwt.header, null, 2) : '';
  const payloadText = jwt ? JSON.stringify(jwt.payload, null, 2) : '';

  return (
    <div class={styles.panel}>
      <Tabs
        tabs={TAB_IDS.map((id) => ({ id, label: t(`dec.tab.${id}`) }))}
        activeId={tab}
        onChange={(id) => {
          setTab(id as DecoderTab);
        }}
      >
        <div class={styles.body}>
          {(tab === 'base64' || tab === 'url' || tab === 'json') && (
            <div class={styles.modeRow}>
              {tab === 'json' ? (
                <SegmentedControl
                  size="sm"
                  label={t('dec.json.action')}
                  value={jsonAction}
                  onChange={(v) => {
                    setJsonAction(v as JsonAction);
                  }}
                  options={[
                    { value: 'format', label: t('dec.json.format') },
                    { value: 'minify', label: t('dec.json.minify') },
                    { value: 'validate', label: t('dec.json.validate') },
                  ]}
                />
              ) : (
                <SegmentedControl
                  size="sm"
                  label={t('dec.mode')}
                  value={dir}
                  onChange={(v) => {
                    setDir(v as Direction);
                  }}
                  options={dirOptions}
                />
              )}
              <span class={styles.spacer} />
              {tab === 'base64' && (
                <Chip
                  pressed={urlSafe}
                  onClick={() => {
                    setUrlSafe(!urlSafe);
                  }}
                >
                  {t('dec.b64.urlsafe')}
                </Chip>
              )}
              {tab === 'url' && (
                <Chip
                  pressed={wholeUrl}
                  onClick={() => {
                    setWholeUrl(!wholeUrl);
                  }}
                >
                  {t('dec.url.whole')}
                </Chip>
              )}
              {tab === 'json' &&
                jsonAction === 'format' &&
                [2, 4].map((n) => (
                  <Chip
                    key={n}
                    pressed={indent === n}
                    onClick={() => {
                      setIndent(n);
                    }}
                  >
                    {t('dec.json.spaces', { n })}
                  </Chip>
                ))}
            </div>
          )}

          <div class={styles.field}>
            <div class={styles.labelRow}>
              <label class={styles.label} for={inputId}>
                {t('dec.input')}
              </label>
              <span class={styles.live}>{t('dec.live')}</span>
            </div>
            <textarea
              id={inputId}
              class={cn(styles.area, error !== null && styles.invalid)}
              data-testid="dec-input"
              spellcheck={false}
              placeholder={PLACEHOLDERS[tab]}
              value={input}
              aria-invalid={error !== null ? true : undefined}
              aria-describedby={error !== null ? errId : undefined}
              onInput={(e) => {
                setInputs({ ...inputs, [tab]: e.currentTarget.value });
              }}
            />
          </div>

          {error && (
            <Alert id={errId} tone="danger" title={error.title}>
              <span data-testid="dec-error">{error.msg}</span>
            </Alert>
          )}

          {jwt && (
            <div class={styles.jwt} data-testid="dec-jwt">
              <div class={styles.statusRow}>
                {jwtBadge}
                {jwtTimes !== '' && <span class={styles.times}>{jwtTimes}</span>}
              </div>
              <Alert tone="warn">{t('dec.jwt.noSig')}</Alert>
              <div class={styles.codeBlock}>
                <span class={styles.label}>{t('dec.jwt.header')}</span>
                <pre class={styles.code} data-testid="dec-jwt-header">
                  {headerText}
                </pre>
              </div>
              <div class={styles.codeBlock}>
                <div class={styles.codeHead}>
                  <span class={styles.label}>{t('dec.jwt.payload')}</span>
                  <button
                    type="button"
                    class={styles.copyBtn}
                    onClick={() => {
                      copyStr(payloadText);
                    }}
                  >
                    {t('dec.copy')}
                  </button>
                </div>
                <pre class={styles.code} data-testid="dec-jwt-payload">
                  {payloadText}
                </pre>
              </div>
            </div>
          )}

          {output !== '' && (
            <div class={styles.card}>
              <div class={styles.cardHead}>
                <span class={styles.cardTitle}>{outLabel}</span>
                {canSwap && (
                  <button type="button" class={styles.linkBtn} onClick={onSwap}>
                    {t('dec.useAsInput')}
                  </button>
                )}
                <button
                  type="button"
                  class={styles.copyBtn}
                  onClick={() => {
                    copyStr(output);
                  }}
                >
                  {t('dec.copy')}
                </button>
              </div>
              <pre class={styles.out} data-testid="dec-output">
                {output}
              </pre>
            </div>
          )}

          <span class={styles.note}>{t('dec.localNote')}</span>
        </div>
      </Tabs>
    </div>
  );
}
