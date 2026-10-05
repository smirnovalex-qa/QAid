/**
 * UI фичи «Экспорт состояния бага» → «Хендофф агенту» (TASK-025/040), поверхность
 * side panel / popup. Редизайн-хендофф: три фазы вместо плоской формы.
 *
 *  • idle     — ничего не пишется, пока пользователь не «вооружит» захват (нулевые
 *               накладные расходы). Выбор живых каналов (шаги/консоль/сеть) и того,
 *               что собрать в момент фиксации (storage / окружение / скриншот).
 *  • armed    — идёт сессия захвата: живой кольцевой буфер действий + консоль/сеть,
 *               счётчики растут (опрос буферов), пользователь воспроизводит баг.
 *  • captured — снимок собран в артефакт (Markdown + JSON), редактируемые заголовок и
 *               описание, отправка агенту в один тап (deep-link + файл в репозиторий),
 *               и сворачиваемые опции проекта.
 *
 * Приватность — центральная (PRD §): storage/cookies выключены по умолчанию; уходят
 * только выбранные, замаскированные секции; НИКАКОЙ автоотправки в сеть — deep-link
 * открывает агента локально, полный отчёт пишется в проект (FSA). Скриншот —
 * компаньон-PNG (локальное скачивание), вне Markdown/JSON-артефакта.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  Alert,
  Button,
  Chip,
  Collapsible,
  Field,
  FeaturePanel,
  Input,
  Toggle,
  useCopy,
  useToast,
} from '@/ui';
import { setToolStatus } from '@/ui/shell';
import { createPermissionBroker } from '@/shared/permissions';
import type { PermissionBroker, PermissionRequest } from '@/shared/permissions';
import { capture, tabs } from '@/platform';
import { logger } from '@/shared/logger';
import { t } from '@/i18n';
import { useSettings } from '@/shared/storage';
import { buildTimeline, composeArtifact, renderMarkdown } from './logic';
import {
  armNetworkLog,
  clearActions,
  clearConsole,
  collectEnv,
  collectNetwork,
  collectNetworkTimeline,
  collectStorage,
  disarmNetworkLog,
  installActions,
  installConsole,
  readActions,
  readConsole,
  stopActions,
} from './bridge';
import { bugReportBinding } from './settings';
import { CONSOLE_RING_CAP } from './types';
import type { ArtifactParts, BugArtifact, SectionSelection } from './types';
import {
  buildHandoffPackage,
  createRuntimeTransports,
  detectCapabilities,
  forgetProjectDirectory,
  getHandoffTargets,
  hasProjectDirectory,
  pickProjectDirectory,
  validateCwd,
  validateRepo,
} from './handoff';
import type { DeliveryContext, HandoffFallback, ProjectTarget } from './handoff';
import { DiscoveryPanel } from './handoff/DiscoveryPanel';
import styles from './bug-report.module.css';

type Phase = 'idle' | 'armed' | 'captured';

/** Живой набор каналов захвата (armed-слой) + собираемое в момент фиксации. */
interface Channels {
  steps: boolean;
  console: boolean;
  network: boolean;
  storage: boolean;
  environment: boolean;
  screenshot: boolean;
  /**
   * «Код страницы (HTML)» (v3 Capture). Презентационный канал: бэкенд-коллектора HTML
   * в `ArtifactParts` пока нет, поэтому переключатель только UI-состояние (в артефакт
   * не попадает, в настройках не персистится) — см. отчёт по пробелам.
   */
  dom: boolean;
}

/** Счётчики сессии (растут во время `armed`). */
interface Counters {
  steps: number;
  console: number;
  network: number;
}

/** Базовые права сбора: `scripting` (MAIN-инъекция) + постоянный host-доступ. */
const BASE_PERMS: PermissionRequest = { optional: ['scripting'], host: ['*://*/*'] };
/** Секция storage/cookies дополнительно требует право `cookies`. */
const STORAGE_PERMS: PermissionRequest = { optional: ['scripting', 'cookies'], host: ['*://*/*'] };

let brokerSingleton: PermissionBroker | undefined;
function getBroker(): PermissionBroker {
  brokerSingleton ??= createPermissionBroker();
  return brokerSingleton;
}

/** `sections`, производные из выбора каналов (steps → секция `timeline`). */
function sectionsFrom(ch: Channels): SectionSelection {
  return {
    environment: ch.environment,
    storage: ch.storage,
    console: ch.console,
    network: ch.network,
    timeline: ch.steps,
    note: true,
  };
}

/** `m:ss` из секунд (таймер сессии захвата). */
function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}

/** `YYYY-MM-DD HH:mm` из ISO-метки (детерминированно, локаль-независимо). */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Короткая подпись адреса страницы: `host/path` (без схемы), с усечением хвоста. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url;
  }
}

export function BugReportPanel(): JSX.Element {
  const settings = useSettings(bugReportBinding);
  const ready = settings.ready.value;
  const { show } = useToast();
  const { copy } = useCopy();

  const [phase, setPhase] = useState<Phase>('idle');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<Channels>({
    steps: true,
    console: true,
    network: true,
    storage: false,
    environment: true,
    screenshot: true,
    dom: false,
  });
  const [mask, setMask] = useState(false);
  const [includeJson, setIncludeJson] = useState(false);
  const [projectRepo, setProjectRepo] = useState('');
  const [projectCwd, setProjectCwd] = useState('');
  const [seeded, setSeeded] = useState(false);

  const [counters, setCounters] = useState<Counters>({ steps: 0, console: 0, network: 0 });
  const [artifact, setArtifact] = useState<BugArtifact | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const [sending, setSending] = useState('');
  const [sent, setSent] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [sentPath, setSentPath] = useState('');
  const [fallbacks, setFallbacks] = useState<HandoffFallback[]>([]);

  const [showSettings, setShowSettings] = useState(false);
  const [showIncl, setShowIncl] = useState(false);
  const [secs, setSecs] = useState(0);
  const [att, setAtt] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState('claude-code-desktop');
  const [hasDir, setHasDir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDownload, setConfirmDownload] = useState(false);

  // Возможности среды / транспорты / адресаты стабильны на время жизни панели.
  const caps = useMemo(() => detectCapabilities(), []);
  const transports = useMemo(() => createRuntimeTransports(), []);
  const targets = useMemo(() => getHandoffTargets(), []);

  const armedTabIdRef = useRef<number | null>(null);
  const armedChannelsRef = useRef<Channels | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Засев из сохранённых настроек единожды после загрузки.
  useEffect(() => {
    if (!ready || seeded) return;
    const s = bugReportBinding.value.value;
    setChannels({
      steps: s.sections.timeline,
      console: s.sections.console,
      network: s.sections.network,
      storage: s.sections.storage,
      environment: s.sections.environment,
      screenshot: s.screenshot,
      dom: false,
    });
    setMask(s.mask);
    setIncludeJson(s.handoff.includeJson);
    setProjectRepo(s.handoff.projectRepo);
    setProjectCwd(s.handoff.projectCwd);
    if (s.handoff.lastTargetId.trim() !== '') setTarget(s.handoff.lastTargetId);
    setSeeded(true);
  }, [ready, seeded]);

  useEffect(() => {
    void hasProjectDirectory().then(setHasDir);
  }, []);

  // Останавливаем опрос счётчиков/таймер при размонтировании; чистим статус оболочки.
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (pollRef.current !== null) clearInterval(pollRef.current);
      if (timerRef.current !== null) clearInterval(timerRef.current);
      // Отложенно: синхронная запись в signal во время анмаунта реентерит teardown.
      queueMicrotask(() => {
        setToolStatus('bug-report', null);
      });
    },
    [],
  );

  // Зеркалим фазу в оболочку (home «Активно» + живая пилюля). armed → live-таймер,
  // captured → «отчёт готов», idle → снятие. В проде источник — background/armed-буфер.
  useEffect(() => {
    const status =
      phase === 'armed'
        ? { live: true, text: `${formatSecs(secs)} · ${t('bugReport.status.capturing')}` }
        : phase === 'captured'
          ? { live: false, text: t('bugReport.status.reportReady') }
          : null;
    // Отложенная запись: синхронная запись в signal оболочки реентерит рендер Preact.
    queueMicrotask(() => {
      if (mountedRef.current) setToolStatus('bug-report', status);
    });
  }, [phase, secs]);

  // ── персист ──────────────────────────────────────────────────────────────────

  const persistChannels = (next: Channels): void => {
    setChannels(next);
    void bugReportBinding.update({ sections: sectionsFrom(next), screenshot: next.screenshot });
  };
  const toggleChannel = (key: keyof Channels, value: boolean): void => {
    persistChannels({ ...channels, [key]: value });
  };
  const toggleMask = (value: boolean): void => {
    setMask(value);
    void bugReportBinding.update({ mask: value });
  };
  const toggleIncludeJson = (value: boolean): void => {
    setIncludeJson(value);
    persistHandoff({ includeJson: value });
  };
  const changeRepo = (value: string): void => {
    setProjectRepo(value);
    persistHandoff({ projectRepo: value });
  };
  const changeCwd = (value: string): void => {
    setProjectCwd(value);
    persistHandoff({ projectCwd: value });
  };
  const persistHandoff = (patch: Record<string, unknown>): void => {
    void bugReportBinding.update({
      handoff: {
        lastTargetId: bugReportBinding.value.value.handoff.lastTargetId,
        projectRepo,
        projectCwd,
        includeJson,
        promptLimit: bugReportBinding.value.value.handoff.promptLimit,
        ...patch,
      },
    });
  };

  // ── общие ────────────────────────────────────────────────────────────────────

  const ensureTab = async (request: PermissionRequest): Promise<number | null> => {
    const granted = await getBroker().ensure(request);
    if (!granted) {
      setError(t('bugReport.error.permission'));
      return null;
    }
    const tabId = await tabs.queryActive();
    if (tabId === undefined) {
      setError(t('bugReport.error.noTab'));
      return null;
    }
    return tabId;
  };

  const stopPolling = (): void => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stopTimer = (): void => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Снимает живые каналы захвата на вооружённой вкладке (best-effort). */
  const disarmChannels = async (): Promise<void> => {
    const tabId = armedTabIdRef.current;
    const armed = armedChannelsRef.current;
    if (tabId === null || armed === null) return;
    try {
      if (armed.steps) await stopActions(tabId);
      if (armed.console) await clearConsole(tabId);
      if (armed.network) await disarmNetworkLog(tabId);
    } catch (e) {
      logger.debug('bugReport.disarmChannels', e);
    }
  };

  // ── arm ──────────────────────────────────────────────────────────────────────

  async function armCapture(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const tabId = await ensureTab(BASE_PERMS);
      if (tabId === null) return;

      const armed: Channels = { ...channels };
      if (armed.steps) {
        await clearActions(tabId);
        await installActions(tabId, bugReportBinding.value.value.timeline.limit, true);
      }
      if (armed.console) await installConsole(tabId, CONSOLE_RING_CAP);
      if (armed.network) await armNetworkLog(tabId);

      armedTabIdRef.current = tabId;
      armedChannelsRef.current = armed;
      setCounters({ steps: 0, console: 0, network: 0 });
      setSecs(0);
      setSent('');
      setSending('');
      setPhase('armed');

      stopPolling();
      pollRef.current = setInterval(() => {
        void pollCounters();
      }, 1200);
      stopTimer();
      timerRef.current = setInterval(() => {
        setSecs((v) => v + 1);
      }, 1000);
    } catch (e) {
      logger.error('bugReport.arm', e);
      setError(t('bugReport.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function pollCounters(): Promise<void> {
    const tabId = armedTabIdRef.current;
    const armed = armedChannelsRef.current;
    if (tabId === null || armed === null) return;
    try {
      const [acts, cons, net] = await Promise.all([
        armed.steps ? readActions(tabId) : Promise.resolve({ events: [] }),
        armed.console ? readConsole(tabId) : Promise.resolve([]),
        armed.network ? collectNetwork(tabId) : Promise.resolve({ total: 0 }),
      ]);
      setCounters({
        steps: acts.events.length,
        console: cons.length,
        network: 'total' in net ? net.total : 0,
      });
    } catch (e) {
      logger.debug('bugReport.pollCounters', e);
    }
  }

  async function disarm(): Promise<void> {
    stopPolling();
    stopTimer();
    await disarmChannels();
    armedTabIdRef.current = null;
    armedChannelsRef.current = null;
    setPhase('idle');
  }

  // ── capture ──────────────────────────────────────────────────────────────────

  async function captureBug(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    stopPolling();
    stopTimer();
    try {
      const tabId = await ensureTab(channels.storage ? STORAGE_PERMS : BASE_PERMS);
      if (tabId === null) return;

      const env = await collectEnv(tabId);
      const parts: ArtifactParts = { meta: env?.meta ?? { url: '', title: '' } };
      if (channels.environment && env) parts.environment = env.environment;
      if (channels.storage) parts.storage = await collectStorage(tabId);
      if (channels.console) parts.console = await readConsole(tabId);
      if (channels.network) parts.network = await collectNetwork(tabId);
      if (channels.steps) {
        const snap = await readActions(tabId);
        const consoleForTimeline = await readConsole(tabId);
        const netForTimeline = await collectNetworkTimeline(tabId);
        parts.timeline = buildTimeline({
          actions: snap.events,
          console: consoleForTimeline,
          anchor: snap.anchor,
          ...(netForTimeline ? { network: netForTimeline } : {}),
        });
      }
      const noteTitle = title.trim() !== '' ? title : t('bugReport.template.title');
      const noteBody = body.trim() !== '' ? body : t('bugReport.template.body');
      parts.note = { title: noteTitle, steps: noteBody };
      setTitle(noteTitle);
      setBody(noteBody);

      // Компаньон-скриншот: вне Markdown/JSON-артефакта, локальный PNG. Сбой — не фатален.
      if (channels.screenshot) {
        try {
          setScreenshot(await capture.visibleTab({ format: 'png' }));
        } catch (e) {
          logger.debug('bugReport.screenshot', e);
          setScreenshot(null);
        }
      } else {
        setScreenshot(null);
      }

      const built = composeArtifact(parts, {
        sections: sectionsFrom(channels),
        mask,
        capturedAt: new Date().toISOString(),
      });
      setArtifact(built);
      setMarkdown(renderMarkdown(built));
      setCounters({
        steps: built.timeline?.filter((e) => e.kind === 'action').length ?? counters.steps,
        console: built.console?.length ?? counters.console,
        network: built.network?.total ?? counters.network,
      });
      setSent('');
      setSending('');
      setSentMessage('');
      setFallbacks([]);
      setConfirmDownload(false);
      setAtt({ ...channels });
      await disarmChannels();
      armedTabIdRef.current = null;
      armedChannelsRef.current = null;
      setPhase('captured');
    } catch (e) {
      logger.error('bugReport.capture', e);
      setError(t('bugReport.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * «Баг уже случился?»: мгновенный снимок текущего состояния без arming (пропускаем
   * шаги/таймлайн). Консоль/сеть собираются как есть (буферы не вооружены — могут быть
   * пустыми); окружение/storage/скриншот подтягиваются в момент сбора.
   */
  async function captureNow(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    stopPolling();
    stopTimer();
    try {
      const tabId = await ensureTab(channels.storage ? STORAGE_PERMS : BASE_PERMS);
      if (tabId === null) return;

      const env = await collectEnv(tabId);
      const parts: ArtifactParts = { meta: env?.meta ?? { url: '', title: '' } };
      if (channels.environment && env) parts.environment = env.environment;
      if (channels.storage) parts.storage = await collectStorage(tabId);
      if (channels.console) parts.console = await readConsole(tabId);
      if (channels.network) parts.network = await collectNetwork(tabId);
      const noteTitle = title.trim() !== '' ? title : t('bugReport.template.title');
      const noteBody = body.trim() !== '' ? body : t('bugReport.template.body');
      parts.note = { title: noteTitle, steps: noteBody };
      setTitle(noteTitle);
      setBody(noteBody);

      if (channels.screenshot) {
        try {
          setScreenshot(await capture.visibleTab({ format: 'png' }));
        } catch (e) {
          logger.debug('bugReport.screenshot', e);
          setScreenshot(null);
        }
      } else {
        setScreenshot(null);
      }

      // Шаги/таймлайн принудительно выключены (репро пропущено).
      const built = composeArtifact(parts, {
        sections: { ...sectionsFrom(channels), timeline: false },
        mask,
        capturedAt: new Date().toISOString(),
      });
      setArtifact(built);
      setMarkdown(renderMarkdown(built));
      setCounters({
        steps: 0,
        console: built.console?.length ?? 0,
        network: built.network?.total ?? 0,
      });
      setSent('');
      setSending('');
      setSentMessage('');
      setFallbacks([]);
      setConfirmDownload(false);
      setAtt({ ...channels, steps: false });
      setPhase('captured');
    } catch (e) {
      logger.error('bugReport.captureNow', e);
      setError(t('bugReport.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  function newCapture(): void {
    stopPolling();
    stopTimer();
    setSent('');
    setSending('');
    setSentMessage('');
    setFallbacks([]);
    setAtt({});
    setSecs(0);
    setPhase('idle');
  }

  // ── send to agent ──────────────────────────────────────────────────────────────

  async function sendToAgent(id: string): Promise<void> {
    if (!artifact || sending !== '') return;
    setSending(id);
    setSent('');
    setError('');
    setFallbacks([]);
    setTarget(id);
    try {
      const chosen =
        targets.find((tg) => tg.id === id) ?? targets.find((tg) => tg.id === 'clipboard');
      if (!chosen) {
        setError(t('bugReport.error.generic'));
        return;
      }
      const pkg = buildHandoffPackage(artifact, {
        createdAt: new Date().toISOString(),
        includeJson,
        promptLimit: bugReportBinding.value.value.handoff.promptLimit,
      });
      const project: ProjectTarget = {
        ...(projectRepo.trim() !== '' ? { repo: projectRepo.trim() } : {}),
        ...(projectCwd.trim() !== '' ? { cwd: projectCwd.trim() } : {}),
      };
      const ctx: DeliveryContext = {
        pkg,
        project,
        capabilities: caps,
        transports,
        settings: { includeJson, promptLimit: bugReportBinding.value.value.handoff.promptLimit },
        t,
      };
      const result = await chosen.deliver(ctx);
      setSent(id);
      setSentMessage(result.message);
      setSentPath(result.filePath ?? '');
      setFallbacks(result.fallbacks);
      persistHandoff({ lastTargetId: id });
      show(result.message, { severity: result.ok ? 'success' : 'danger' });
    } catch (e) {
      logger.error('bugReport.sendToAgent', e);
      setError(t('bugReport.error.generic'));
    } finally {
      setSending('');
    }
  }

  // ── export helpers ─────────────────────────────────────────────────────────────

  const onCopyReport = (): void => {
    void copy(markdown);
  };

  const performDownload = (): void => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
    anchor.href = url;
    anchor.download = `bug-report-${stamp}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setConfirmDownload(false);
    show(t('bugReport.downloaded'), { severity: 'success' });
  };

  const downloadScreenshot = (): void => {
    if (screenshot === null) return;
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
    anchor.href = screenshot;
    anchor.download = `bug-shot-${stamp}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  async function pickFolder(): Promise<void> {
    try {
      await pickProjectDirectory();
    } catch (e) {
      logger.debug('bugReport.pickFolder', e);
    }
    setHasDir(await hasProjectDirectory());
  }
  async function forgetFolder(): Promise<void> {
    try {
      await forgetProjectDirectory();
    } catch (e) {
      logger.debug('bugReport.forgetFolder', e);
    }
    setHasDir(false);
  }

  if (!ready) {
    return (
      <FeaturePanel bare>
        <p class={styles.muted}>{t('bugReport.loading')}</p>
      </FeaturePanel>
    );
  }

  const repoTrimmed = projectRepo.trim();
  const cwdTrimmed = projectCwd.trim();
  const repoInvalid = repoTrimmed !== '' && !validateRepo(repoTrimmed).ok;
  const cwdInvalid = cwdTrimmed !== '' && !validateCwd(cwdTrimmed).ok;

  // 7 каналов захвата (v3 Capture): подпись + help; cookies — в warn-тоне.
  const channelRows: { key: keyof Channels; label: string; help: string; warn?: boolean }[] = [
    {
      key: 'steps',
      label: t('bugReport.channel.steps'),
      help: t('bugReport.channel.steps.help'),
    },
    {
      key: 'console',
      label: t('bugReport.channel.console'),
      help: t('bugReport.channel.console.help'),
    },
    {
      key: 'network',
      label: t('bugReport.channel.network'),
      help: t('bugReport.channel.network.help'),
    },
    {
      key: 'environment',
      label: t('bugReport.channel.environment'),
      help: t('bugReport.channel.environment.help'),
    },
    {
      key: 'screenshot',
      label: t('bugReport.channel.screenshot'),
      help: t('bugReport.channel.screenshot.help'),
    },
    {
      key: 'storage',
      label: t('bugReport.section.storage'),
      help: t('bugReport.channel.storage.help'),
      warn: true,
    },
    { key: 'dom', label: t('bugReport.channel.dom'), help: t('bugReport.channel.dom.help') },
  ];
  const onNames = channelRows.filter((r) => channels[r.key]).map((r) => r.label.toLowerCase());
  const collectsSummary = onNames.length > 0 ? onNames.join(', ') : t('bugReport.none');

  // Чипы «Приложено» (captured): подпись по каналу, включённому на момент сбора.
  const attLabels: Record<keyof Channels, string> = {
    steps: `${String(counters.steps)} ${t('bugReport.att.actions')}`,
    console: `${String(counters.console)} ${t('bugReport.att.errors')}`,
    network: `${String(counters.network)} ${t('bugReport.att.requests')}`,
    environment: t('bugReport.att.env'),
    screenshot: t('bugReport.att.screenshot'),
    storage: t('bugReport.att.storage'),
    dom: t('bugReport.att.dom'),
  };
  const attChips = channelRows.map((r) => r.key).filter((k) => channels[k]);
  const secretWarn = Boolean(att.storage) && !mask;

  // Адресаты отправки: основной (последний) + «Или:» остальные (без clipboard).
  const sendOrder = ['claude-code-desktop', 'cursor', 'codex'];
  const availableTargets = sendOrder.filter((id) => targets.some((tg) => tg.id === id));
  const mainTarget = availableTargets.includes(target)
    ? target
    : (availableTargets[0] ?? 'clipboard');
  const otherTargets = availableTargets.filter((id) => id !== mainTarget);
  const shortName = (id: string): string =>
    id.startsWith('claude-code')
      ? 'Claude Code'
      : id === 'cursor'
        ? 'Cursor'
        : id === 'codex'
          ? 'Codex'
          : id === 'clipboard'
            ? t('bugReport.handoff.target.clipboard')
            : id;
  const mainLabel =
    sending === mainTarget
      ? t('bugReport.send.opening')
      : sent === mainTarget
        ? t('bugReport.send.sentPrefix') + shortName(mainTarget)
        : t('bugReport.send.sendPrefix') + shortName(mainTarget);

  const metaLine =
    artifact !== null ? `${shortUrl(artifact.meta.url)} · ${formatStamp(artifact.capturedAt)}` : '';

  return (
    <FeaturePanel bare description={t('bugReport.desc')}>
      <div class={styles.panel} data-testid="bug-report">
        {error !== '' && (
          <p role="alert" class={styles.error}>
            {error}
          </p>
        )}

        {/* ── IDLE ── */}
        {phase === 'idle' && (
          <>
            <p class={styles.intro}>{t('bugReport.intro')}</p>

            <Button
              block
              class={styles.bigBtn}
              loading={busy}
              onClick={() => {
                void armCapture();
              }}
            >
              <span class={styles.recDot} aria-hidden="true" />
              {t('bugReport.arm')}
            </Button>

            <button
              type="button"
              class={styles.skipRow}
              disabled={busy}
              onClick={() => {
                void captureNow();
              }}
            >
              <span class={styles.skipText}>
                <span class={styles.skipLabel}>{t('bugReport.skip')}</span>
                <span class={styles.skipHelp}>{t('bugReport.skipHelp')}</span>
              </span>
              <span class={styles.skipArrow} aria-hidden="true">
                →
              </span>
            </button>

            <div class={styles.collects}>
              <span class={styles.collectsText}>
                <b class={styles.collectsLead}>{t('bugReport.collects')}:</b> {collectsSummary}
              </span>
              <button
                type="button"
                class={styles.changeBtn}
                aria-expanded={showIncl}
                onClick={() => {
                  setShowIncl((v) => !v);
                }}
              >
                {showIncl ? t('bugReport.hide') : t('bugReport.change')}
              </button>
            </div>

            {showIncl && (
              <div class={styles.channelCard}>
                {channelRows.map((r) => (
                  <div key={r.key} class={styles.channelRow}>
                    <Toggle
                      variant="plain"
                      label={r.label}
                      help={r.help}
                      helpTone={r.warn === true ? 'warn' : 'default'}
                      checked={channels[r.key]}
                      onChange={(v) => {
                        toggleChannel(r.key, v);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            <p class={styles.note}>{t('bugReport.privacy')}</p>
          </>
        )}

        {/* ── ARMED ── */}
        {phase === 'armed' && (
          <>
            <div class={styles.sessionCard} data-testid="bug-report-session">
              <div class={styles.sessionHead}>
                <span class={styles.recDotRed} aria-hidden="true" />
                <span class={styles.capturingLabel}>{t('bugReport.capturing')}</span>
                <span class={styles.spacer} />
                <span class={styles.sessionTime}>{formatSecs(secs)}</span>
              </div>
              <div class={styles.counterGrid}>
                <div class={styles.counter}>
                  <span class={styles.counterNum}>{counters.steps}</span>
                  <span class={styles.counterLbl}>{t('bugReport.armed.actions')}</span>
                </div>
                <div class={styles.counter}>
                  <span class={styles.counterNum}>{counters.console}</span>
                  <span class={styles.counterLbl}>{t('bugReport.armed.errors')}</span>
                </div>
                <div class={styles.counter}>
                  <span class={styles.counterNum}>{counters.network}</span>
                  <span class={styles.counterLbl}>{t('bugReport.armed.requests')}</span>
                </div>
              </div>
            </div>
            <p class={styles.instr}>{t('bugReport.reproduceHint')}</p>
            <Button
              block
              class={styles.bigBtn}
              loading={busy}
              onClick={() => {
                void captureBug();
              }}
            >
              {t('bugReport.capture')}
            </Button>
            <Button
              variant="ghost"
              block
              onClick={() => {
                void disarm();
              }}
            >
              {t('bugReport.cancel')}
            </Button>
          </>
        )}

        {/* ── CAPTURED ── */}
        {phase === 'captured' && (
          <>
            <div class={styles.readyHead}>
              <span class={styles.readyBadge}>✓ {t('bugReport.ready')}</span>
              <span class={styles.reportMeta} title={metaLine}>
                {metaLine}
              </span>
              <button type="button" class={styles.newLink} onClick={newCapture}>
                {t('bugReport.newReport')}
              </button>
            </div>

            <Field label={t('bugReport.note.title.label')}>
              {(c) => (
                <Input
                  {...c}
                  value={title}
                  class={styles.titleInput}
                  placeholder={t('bugReport.note.title.placeholder')}
                  onInput={(e) => {
                    setTitle(e.currentTarget.value);
                  }}
                />
              )}
            </Field>
            <Field label={t('bugReport.whatHappened')}>
              {(c) => (
                <textarea
                  {...c}
                  class={styles.textarea}
                  spellcheck={false}
                  value={body}
                  placeholder={t('bugReport.note.steps.placeholder')}
                  onInput={(e) => {
                    setBody(e.currentTarget.value);
                  }}
                />
              )}
            </Field>

            <div class={styles.group}>
              <span class={styles.fieldLabel}>{t('bugReport.attached')}</span>
              <div class={styles.chipWrap}>
                {attChips.map((k) => {
                  const on = Boolean(att[k]);
                  return (
                    <Chip
                      key={k}
                      pressed={on}
                      check={false}
                      onClick={() => {
                        setAtt((prev) => ({ ...prev, [k]: !on }));
                      }}
                    >
                      {(on ? '✓ ' : '+ ') + (attLabels[k] || '')}
                    </Chip>
                  );
                })}
              </div>
              {secretWarn && <Alert tone="warn">{t('bugReport.secretWarn')}</Alert>}
              <Toggle
                variant="plain"
                label={t('bugReport.mask.label')}
                checked={mask}
                onChange={toggleMask}
              />
            </div>

            <div class={styles.sendCard}>
              <span class={styles.fieldLabel}>{t('bugReport.send.legend')}</span>
              <Button
                block
                class={styles.bigBtn}
                loading={sending === mainTarget}
                disabled={sending !== ''}
                onClick={() => {
                  void sendToAgent(mainTarget);
                }}
              >
                {mainLabel}
              </Button>

              {otherTargets.length > 0 && (
                <div class={styles.orRow}>
                  <span class={styles.orLabel}>{t('bugReport.send.or')}</span>
                  {otherTargets.map((id) => (
                    <button
                      key={id}
                      type="button"
                      class={styles.orBtn}
                      disabled={sending !== ''}
                      onClick={() => {
                        void sendToAgent(id);
                      }}
                    >
                      {shortName(id)}
                    </button>
                  ))}
                </div>
              )}

              <div class={styles.exportRow}>
                <button type="button" class={styles.linkBtn} onClick={onCopyReport}>
                  {t('bugReport.copyAsText')}
                </button>
                <button
                  type="button"
                  class={styles.linkBtn}
                  onClick={() => {
                    setConfirmDownload(true);
                  }}
                >
                  {t('bugReport.downloadFile')}
                </button>
                {screenshot !== null && (
                  <button type="button" class={styles.linkBtn} onClick={downloadScreenshot}>
                    {t('bugReport.downloadShot')}
                  </button>
                )}
              </div>

              {sent !== '' && sending === '' && (
                <div class={styles.sentBox} role="status">
                  <span class={styles.sentMsg}>
                    {sentMessage !== ''
                      ? sentMessage
                      : shortName(sent) + t('bugReport.sent.openSuffix')}
                  </span>
                  <span class={styles.sentHint}>
                    {t('bugReport.sent.didntOpen')}{' '}
                    <button type="button" class={styles.linkInline} onClick={onCopyReport}>
                      {t('bugReport.copyAsText')}
                    </button>
                  </span>
                  {fallbacks.length > 0 && (
                    <div class={styles.sentFallbacks}>
                      {fallbacks.map((fb) => (
                        <button
                          key={fb.label}
                          type="button"
                          class={styles.linkInline}
                          onClick={() => {
                            void fb.run();
                          }}
                        >
                          {fb.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {sentPath !== '' && <span class={styles.sentPath}>{sentPath}</span>}
                </div>
              )}
            </div>

            {confirmDownload && (
              <div role="alertdialog" aria-label={t('bugReport.download')} class={styles.confirm}>
                <p class={styles.confirmText}>{t('bugReport.download.prompt')}</p>
                <div class={styles.confirmActions}>
                  <Button onClick={performDownload}>{t('bugReport.download.confirm')}</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmDownload(false);
                    }}
                  >
                    {t('bugReport.download.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {/* — сворачиваемый блок проекта — */}
            <Collapsible
              label={t('bugReport.project')}
              summary={projectRepo}
              open={showSettings}
              onToggle={setShowSettings}
            >
              <div class={styles.projBody}>
                <Field
                  label={t('bugReport.repoLabel')}
                  error={repoInvalid ? t('bugReport.handoff.project.repo.invalid') : ''}
                >
                  {(c) => (
                    <Input
                      {...c}
                      value={projectRepo}
                      class={styles.mono}
                      placeholder="acme/checkout"
                      onInput={(e) => {
                        changeRepo(e.currentTarget.value);
                      }}
                    />
                  )}
                </Field>
                <Field
                  label={t('bugReport.folderLabel')}
                  error={cwdInvalid ? t('bugReport.handoff.project.cwd.invalid') : ''}
                >
                  {(c) => (
                    <Input
                      {...c}
                      value={projectCwd}
                      class={styles.mono}
                      placeholder="C:\\Users\\me\\projects\\checkout"
                      onInput={(e) => {
                        changeCwd(e.currentTarget.value);
                      }}
                    />
                  )}
                </Field>

                <div class={styles.rowActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!caps.fsAccess}
                    onClick={() => {
                      void pickFolder();
                    }}
                  >
                    {hasDir
                      ? t('bugReport.handoff.project.pickedOn')
                      : t('bugReport.handoff.project.pick')}
                  </Button>
                  {hasDir && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void forgetFolder();
                      }}
                    >
                      {t('bugReport.handoff.project.forget')}
                    </Button>
                  )}
                </div>

                <span class={styles.note}>{t('bugReport.projNote')}</span>

                <Toggle
                  variant="plain"
                  label={t('bugReport.handoff.includeJson.label')}
                  checked={includeJson}
                  onChange={toggleIncludeJson}
                />

                <DiscoveryPanel />
              </div>
            </Collapsible>
          </>
        )}
      </div>
    </FeaturePanel>
  );
}
