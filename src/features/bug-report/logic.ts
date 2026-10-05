/**
 * Чистая логика фичи «Экспорт состояния бага» (TASK-025).
 *
 * БЕЗ DOM и `chrome.*`: zod-схема артефакта, КОМПОЗИЦИЯ секций-частей (каждый
 * сборщик отдаёт свою часть — здесь их только собираем по выбору пользователя),
 * маскирование чувствительных полей (токены/куки → `***`), рендер Markdown из
 * структуры и сериализация JSON. Единственный покрытый почти-на-100% модуль фичи
 * (канон «core ~100%»); MAIN-сборщики и адаптеры тестируются отдельно.
 *
 * Приватность — центральное требование: маскирование не отправляет ничего наружу,
 * а лишь готовит артефакт к безопасной вставке в трекер; секции включаются только
 * по явному выбору (см. `composeArtifact`).
 */
import { z } from 'zod';
import { StorageSnapshotSchema } from '@/shared/inspection/storage/logic';
import { OPTIONAL_SECTIONS } from './types';
import type {
  ActionKind,
  ActionRecord,
  ArtifactParts,
  BugArtifact,
  ComposeOptions,
  ConsoleEntry,
  EnvironmentPart,
  MetaPart,
  NetworkEntry,
  NetworkPart,
  NotePart,
  StorageSnapshot,
  TimelineClockAnchor,
  TimelineEvent,
} from './types';

/** Плейсхолдер маскированного значения. */
export const MASK = '***';

// ── zod-схемы секций и артефакта (граница сообщений + канон формы) ────────────

/** Схема базовой секции (URL/заголовок). */
export const MetaPartSchema: z.ZodType<MetaPart> = z.object({
  url: z.string(),
  title: z.string(),
});

/** Схема снимка окружения. */
export const EnvironmentPartSchema: z.ZodType<EnvironmentPart> = z.object({
  userAgent: z.string(),
  language: z.string(),
  languages: z.array(z.string()),
  platform: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  screen: z.object({ width: z.number(), height: z.number() }),
  devicePixelRatio: z.number(),
  locale: z.string(),
  timeZone: z.string(),
  isoTime: z.string(),
  online: z.boolean(),
  cookieEnabled: z.boolean(),
});

/** Схема одной записи консоли. */
export const ConsoleEntrySchema: z.ZodType<ConsoleEntry> = z.object({
  level: z.enum(['error', 'warn']),
  source: z.enum(['console', 'onerror', 'unhandledrejection']),
  text: z.string(),
  at: z.number(),
});

/** Схема одной строки сетевой сводки. */
export const NetworkEntrySchema: z.ZodType<NetworkEntry> = z.object({
  method: z.string(),
  url: z.string(),
  status: z.number(),
  mocked: z.boolean(),
  source: z.enum(['fetch', 'xhr']),
  durationMs: z.number(),
  error: z.string().nullable(),
});

/** Схема сетевой секции. */
export const NetworkPartSchema: z.ZodType<NetworkPart> = z.object({
  available: z.boolean(),
  total: z.number(),
  failed: z.number(),
  mocked: z.number(),
  entries: z.array(NetworkEntrySchema),
});

/** Схема заметки репортёра. */
export const NotePartSchema: z.ZodType<NotePart> = z.object({
  title: z.string(),
  steps: z.string(),
});

/** Все значения `ActionKind` (единый источник для zod-enum). */
const ACTION_KINDS = [
  'click',
  'input',
  'change',
  'submit',
  'navigation',
  'key',
  'resize',
] as const satisfies readonly ActionKind[];

/** Схема одной записи буфера действий (снимок MAIN-world). */
export const ActionRecordSchema: z.ZodType<ActionRecord> = z.object({
  kind: z.enum(ACTION_KINDS),
  at: z.number(),
  target: z.string().optional(),
  field: z.string().optional(),
  detail: z.string().optional(),
}) as z.ZodType<ActionRecord>;

/** Схема якоря клоков MAIN-world (перевод perf.now → wall-clock). */
export const TimelineClockAnchorSchema: z.ZodType<TimelineClockAnchor> = z.object({
  perfNow: z.number(),
  wall: z.number(),
});

/** Схема одного события таймлайна (дискриминированный union по `kind`). */
export const TimelineEventSchema: z.ZodType<TimelineEvent> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('action'),
    at: z.number(),
    action: z.enum(ACTION_KINDS),
    target: z.string().optional(),
    field: z.string().optional(),
    detail: z.string().optional(),
  }),
  z.object({
    kind: z.literal('console'),
    at: z.number(),
    level: z.enum(['error', 'warn']),
    source: z.enum(['console', 'onerror', 'unhandledrejection']),
    text: z.string(),
  }),
  z.object({
    kind: z.literal('network'),
    at: z.number(),
    method: z.string(),
    url: z.string(),
    status: z.number(),
    mocked: z.boolean(),
    durationMs: z.number(),
    error: z.string().nullable(),
  }),
]) as z.ZodType<TimelineEvent>;

/**
 * Схема полного артефакта «состояния бага». `timeline` (TASK-036) добавлен
 * ОБРАТНОСОВМЕСТИМО: `.default(null)` — старые снимки без ключа `timeline` остаются
 * валидными (парсятся в `timeline: null`).
 */
export const BugArtifactSchema: z.ZodType<BugArtifact> = z.object({
  version: z.literal(1),
  capturedAt: z.string(),
  meta: MetaPartSchema,
  environment: EnvironmentPartSchema.nullable(),
  storage: StorageSnapshotSchema.nullable() as z.ZodType<StorageSnapshot | null>,
  console: z.array(ConsoleEntrySchema).nullable(),
  network: NetworkPartSchema.nullable(),
  timeline: z.array(TimelineEventSchema).nullable().default(null),
  note: NotePartSchema.nullable(),
}) as z.ZodType<BugArtifact>;

// ── композиция ───────────────────────────────────────────────────────────────

/**
 * Собирает артефакт из готовых частей по выбору секций. Мета включается всегда
 * (базовый контекст). Опциональная секция попадает в артефакт, только если она
 * выбрана И её часть собрана; иначе — `null` (честная маркировка отсутствия).
 * Чистая функция: никакого сбора, только сборка переданного.
 */
export function composeArtifact(parts: ArtifactParts, options: ComposeOptions): BugArtifact {
  const on = options.sections;
  const artifact: BugArtifact = {
    version: 1,
    capturedAt: options.capturedAt,
    meta: parts.meta,
    environment: on.environment && parts.environment ? parts.environment : null,
    storage: on.storage && parts.storage ? parts.storage : null,
    console: on.console && parts.console ? parts.console : null,
    network: on.network && parts.network ? parts.network : null,
    timeline: on.timeline && parts.timeline ? parts.timeline : null,
    note: on.note && parts.note ? parts.note : null,
  };
  return options.mask ? maskArtifact(artifact) : artifact;
}

// ── маскирование ─────────────────────────────────────────────────────────────

/** Ключ похож на секрет (токен/кука/пароль/ключ и т.п.) — регистронезависимо. */
export function looksSecretKey(key: string): boolean {
  return /(token|secret|auth|password|passwd|jwt|bearer|credential|api[-_]?key|apikey|access|refresh|session|sid)/i.test(
    key,
  );
}

/** Значение похоже на токен: JWT-триплет либо длинная «непрозрачная» строка без пробелов. */
export function looksTokenValue(value: string): boolean {
  const v = value.trim();
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(v)) return true;
  return v.length >= 24 && /^[A-Za-z0-9+/=._-]+$/.test(v);
}

/**
 * Редактирует значения query-параметров URL, чьё имя похоже на секрет (`?token=…`
 * → `?token=***`). Непарсибельный URL возвращается как есть (best-effort).
 */
export function redactUrl(url: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const base = url.slice(0, qIndex);
  const query = url.slice(qIndex + 1);
  const parts = query.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return pair;
    const name = pair.slice(0, eq);
    return looksSecretKey(name) ? `${name}=${MASK}` : pair;
  });
  return `${base}?${parts.join('&')}`;
}

/**
 * Возвращает КОПИЮ артефакта с замаскированными чувствительными полями:
 *  - cookies — значения целиком (куки по своей природе секретны);
 *  - local/session storage — значение, если ключ похож на секрет ИЛИ само значение
 *    похоже на токен;
 *  - network — query-параметры URL с секретными именами.
 * Мета/окружение/заметка/консоль не трогаются (в них нет структурированных секретов).
 */
export function maskArtifact(artifact: BugArtifact): BugArtifact {
  const storage: StorageSnapshot | null = artifact.storage
    ? {
        cookies: artifact.storage.cookies.map((c) => ({ ...c, value: MASK })),
        local: artifact.storage.local.map((e) =>
          looksSecretKey(e.key) || looksTokenValue(e.value) ? { ...e, value: MASK } : e,
        ),
        session: artifact.storage.session.map((e) =>
          looksSecretKey(e.key) || looksTokenValue(e.value) ? { ...e, value: MASK } : e,
        ),
      }
    : null;

  const network: NetworkPart | null = artifact.network
    ? {
        ...artifact.network,
        entries: artifact.network.entries.map((e) => ({ ...e, url: redactUrl(e.url) })),
      }
    : null;

  // Таймлайн: значения ввода уже маскируются на этапе сбора (MAIN-world), поэтому
  // здесь редактируем лишь URL сетевых событий (секретные query-параметры), как в
  // сетевой секции. Действия/консоль не трогаем.
  const timeline: TimelineEvent[] | null = artifact.timeline
    ? artifact.timeline.map((e) => (e.kind === 'network' ? { ...e, url: redactUrl(e.url) } : e))
    : null;

  return { ...artifact, storage, network, timeline };
}

// ── таймлайн: слияние потоков, таймкоды, рендер (TASK-036) ────────────────────

/** Сетевой вход для слияния: строка лога TASK-022 с монотонным `startedAt` (perf.now). */
export interface TimelineNetworkInput {
  method: string;
  url: string;
  status: number;
  mocked: boolean;
  durationMs: number;
  error: string | null;
  /** `performance.now()`-базис страницы (переводится на wall-clock через якорь). */
  startedAt: number;
}

/** Входные потоки для построения единой шкалы. */
export interface TimelineInput {
  actions?: readonly ActionRecord[];
  console?: readonly ConsoleEntry[];
  network?: readonly TimelineNetworkInput[];
  /** Якорь клоков MAIN-world; нужен, чтобы поместить сетевые (perf.now) события на ось. */
  anchor?: TimelineClockAnchor;
}

/**
 * Сливает потоки действий/консоли/сети в единый отсортированный таймлайн.
 * Все события приводятся к wall-clock оси (`Date.now()`): действия и консоль уже в
 * ней; сетевые (монотонный `startedAt`) переводятся через `anchor`
 * (`wall + (startedAt − perfNow)`). Без якоря сеть не может быть размещена — опускается.
 *
 * Сортировка СТАБИЛЬНА и ДЕТЕРМИНИРОВАНА: ключ `(at, порядковый индекс вставки)` —
 * события с равным таймстемпом сохраняют исходный порядок (действия → консоль → сеть).
 */
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const seq: { ev: TimelineEvent; idx: number }[] = [];
  let idx = 0;

  for (const a of input.actions ?? []) {
    seq.push({
      ev: {
        kind: 'action',
        at: a.at,
        action: a.kind,
        ...(a.target !== undefined ? { target: a.target } : {}),
        ...(a.field !== undefined ? { field: a.field } : {}),
        ...(a.detail !== undefined ? { detail: a.detail } : {}),
      },
      idx: idx++,
    });
  }

  for (const c of input.console ?? []) {
    seq.push({
      ev: { kind: 'console', at: c.at, level: c.level, source: c.source, text: c.text },
      idx: idx++,
    });
  }

  const anchor = input.anchor;
  if (anchor) {
    for (const n of input.network ?? []) {
      seq.push({
        ev: {
          kind: 'network',
          at: Math.round(anchor.wall + (n.startedAt - anchor.perfNow)),
          method: n.method,
          url: n.url,
          status: n.status,
          mocked: n.mocked,
          durationMs: n.durationMs,
          error: n.error,
        },
        idx: idx++,
      });
    }
  }

  seq.sort((a, b) => (a.ev.at !== b.ev.at ? a.ev.at - b.ev.at : a.idx - b.idx));
  return seq.map((s) => s.ev);
}

/**
 * Относительный таймкод события от базы (первого события): `+0.0s`, `+1.2s`.
 * Отрицательная дельта клампится к нулю (защита от рассинхрона клоков).
 */
export function relativeTimecode(at: number, base: number): string {
  const delta = Math.max(0, at - base);
  return `+${(delta / 1000).toFixed(1)}s`;
}

/** Человекочитаемое описание одного события таймлайна (детерминированно, EN). */
export function describeTimelineEvent(ev: TimelineEvent): string {
  switch (ev.kind) {
    case 'action':
      return describeAction(ev);
    case 'console':
      return `Console \`[${ev.level}]\` (${ev.source}) ${ev.text.replaceAll('\n', ' ')}`;
    case 'network':
      return `Network ${ev.method} ${ev.url} → ${
        ev.error !== null ? `ERR (${ev.error})` : String(ev.status)
      }`;
  }
}

/** Подпись действия по типу (значения ввода приходят уже маскированными). */
function describeAction(ev: Extract<TimelineEvent, { kind: 'action' }>): string {
  const target = ev.target !== undefined && ev.target !== '' ? ` \`${ev.target}\`` : '';
  const detail = ev.detail !== undefined && ev.detail !== '' ? ev.detail : '';
  switch (ev.action) {
    case 'click':
      return `Click on${target}`;
    case 'input':
      return `Input into ${ev.field ?? 'field'}${target}${detail !== '' ? ` (${detail})` : ''}`;
    case 'change':
      return `Change ${ev.field ?? 'field'}${target}${detail !== '' ? ` (${detail})` : ''}`;
    case 'submit':
      return `Submit form${target}`;
    case 'navigation':
      return `Navigation${detail !== '' ? ` → ${detail}` : ''}`;
    case 'key':
      return `Key ${detail !== '' ? detail : '(gesture)'}${target}`;
    case 'resize':
      return `Resize${detail !== '' ? ` → ${detail}` : ''}`;
  }
}

/**
 * Рендерит секцию «Steps to reproduce (auto)»: нумерованный список с относительными
 * таймкодами. Пустой таймлайн — честный `_none_`. Замечание об охвате (только
 * top-документ, iframes пропущены) — в конце секции.
 */
export function renderTimeline(events: readonly TimelineEvent[]): string[] {
  const lines: string[] = ['## Steps to reproduce (auto)', ''];
  if (events.length === 0) {
    lines.push('_no user actions captured_', '');
    return lines;
  }
  const base = events[0]?.at ?? 0;
  events.forEach((ev, i) => {
    lines.push(
      `${String(i + 1)}. \`${relativeTimecode(ev.at, base)}\` ${describeTimelineEvent(ev)}`,
    );
  });
  lines.push('', '_Top document only — iframes are not recorded._', '');
  return lines;
}

// ── рендер Markdown ──────────────────────────────────────────────────────────

/** Экранирует `|` в ячейке таблицы, чтобы не ломать разметку. */
function cell(value: string): string {
  return value.replaceAll('|', '\\|');
}

function renderEnvironment(env: EnvironmentPart): string[] {
  return [
    '## Environment',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| User-Agent | ${cell(env.userAgent)} |`,
    `| Platform | ${cell(env.platform)} |`,
    `| Language | ${cell(env.language)} |`,
    `| Languages | ${cell(env.languages.join(', '))} |`,
    `| Viewport | ${String(env.viewport.width)}×${String(env.viewport.height)} |`,
    `| Screen | ${String(env.screen.width)}×${String(env.screen.height)} |`,
    `| DPR | ${String(env.devicePixelRatio)} |`,
    `| Locale | ${cell(env.locale)} |`,
    `| Time zone | ${cell(env.timeZone)} |`,
    `| Time (ISO) | ${cell(env.isoTime)} |`,
    `| Online | ${env.online ? 'yes' : 'no'} |`,
    `| Cookies enabled | ${env.cookieEnabled ? 'yes' : 'no'} |`,
    '',
  ];
}

function renderStorage(storage: StorageSnapshot): string[] {
  const lines: string[] = ['## Storage & cookies', ''];
  lines.push(`### Cookies (${String(storage.cookies.length)})`, '');
  if (storage.cookies.length === 0) lines.push('_none_', '');
  else {
    for (const c of storage.cookies) lines.push(`- \`${c.name}\` = \`${c.value}\` (${c.domain})`);
    lines.push('');
  }
  lines.push(`### localStorage (${String(storage.local.length)})`, '');
  if (storage.local.length === 0) lines.push('_none_', '');
  else {
    for (const e of storage.local) lines.push(`- \`${e.key}\` = \`${e.value}\``);
    lines.push('');
  }
  lines.push(`### sessionStorage (${String(storage.session.length)})`, '');
  if (storage.session.length === 0) lines.push('_none_', '');
  else {
    for (const e of storage.session) lines.push(`- \`${e.key}\` = \`${e.value}\``);
    lines.push('');
  }
  return lines;
}

function renderConsole(entries: ConsoleEntry[]): string[] {
  const lines: string[] = [`## Console (${String(entries.length)})`, ''];
  if (entries.length === 0) {
    lines.push('_no errors or warnings captured_', '');
    return lines;
  }
  for (const e of entries) {
    lines.push(`- \`[${e.level}]\` (${e.source}) ${e.text.replaceAll('\n', ' ')}`);
  }
  lines.push('');
  return lines;
}

function renderNetwork(net: NetworkPart): string[] {
  const lines: string[] = ['## Network', ''];
  if (!net.available) {
    lines.push('_unavailable — network logging (mock feature) is not active on this tab._', '');
    return lines;
  }
  lines.push(
    `Total: ${String(net.total)} · failed: ${String(net.failed)} · mocked: ${String(net.mocked)}`,
    '',
    '| Method | URL | Status | Mocked | ms |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const e of net.entries) {
    lines.push(
      `| ${e.method} | ${cell(e.url)} | ${e.error ? `ERR (${cell(e.error)})` : String(e.status)} | ${
        e.mocked ? 'yes' : 'no'
      } | ${String(e.durationMs)} |`,
    );
  }
  lines.push('');
  return lines;
}

function renderNote(note: NotePart): string[] {
  return [
    '## Reproduction',
    '',
    `**Title:** ${note.title.length > 0 ? note.title : '_(untitled)_'}`,
    '',
    '**Steps:**',
    '',
    note.steps.length > 0 ? note.steps : '_(no steps provided)_',
    '',
  ];
}

/**
 * Рендерит артефакт в Markdown-документ. Присутствуют только непустые секции
 * (`null`-секции опущены); в конце — машиночитаемый JSON во fenced-блоке (TASK-008),
 * чтобы вложение годилось и человеку, и инструменту.
 */
export function renderMarkdown(artifact: BugArtifact): string {
  const noteTitle = artifact.note?.title ?? '';
  const lines: string[] = [
    `# Bug report${noteTitle.length > 0 ? `: ${noteTitle}` : ''}`,
    '',
    `- Captured: ${artifact.capturedAt}`,
    `- URL: ${artifact.meta.url}`,
    `- Title: ${artifact.meta.title}`,
    '',
  ];

  if (artifact.environment) lines.push(...renderEnvironment(artifact.environment));
  if (artifact.storage) lines.push(...renderStorage(artifact.storage));
  if (artifact.console) lines.push(...renderConsole(artifact.console));
  if (artifact.network) lines.push(...renderNetwork(artifact.network));
  if (artifact.timeline) lines.push(...renderTimeline(artifact.timeline));
  if (artifact.note) lines.push(...renderNote(artifact.note));

  lines.push('## Machine-readable', '', '```json', renderJson(artifact), '```', '');
  return lines.join('\n');
}

/** Сериализует артефакт в человекочитаемый JSON (для вложения/копирования). */
export function renderJson(artifact: BugArtifact): string {
  return JSON.stringify(artifact, null, 2);
}

/** Проверяет, что все опциональные секции присутствуют в карте выбора (защита формы). */
export function hasAllSections(selection: Record<string, boolean>): boolean {
  return OPTIONAL_SECTIONS.every((s) => s in selection);
}
