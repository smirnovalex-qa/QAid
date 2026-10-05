/**
 * MAIN-world сборщики базовой секции и окружения (TASK-025, TASK-013).
 *
 * Эти функции инъектируются в контекст страницы через
 * `chrome.scripting.executeScript({ world: 'MAIN', func })` — Chrome сериализует
 * их как `func.toString()`, поэтому каждая ОБЯЗАНА быть самодостаточной: только
 * глобалы страницы (`location`, `document`, `navigator`, `window`, `Intl`, `Date`)
 * и никаких рантайм-ссылок на модуль (только `import type`, который стирается
 * компилятором). Отсюда — никаких вынесенных констант/хелперов уровня модуля
 * (ADR-0028): любая такая ссылка стала бы свободной и упала ReferenceError.
 *
 * Приватность: сборщики ничего не отправляют — лишь возвращают снимок вызывающей
 * стороне (нашему background по запросу), которая передаёт его в UI.
 */
import type { EnvironmentPart, MetaPart } from '../types';

/** Читает адрес страницы (URL + заголовок документа). Самодостаточна (ADR-0028). */
export function readPageMeta(): MetaPart {
  return {
    url: location.href,
    title: document.title,
  };
}

/**
 * Читает снимок окружения страницы: UA, язык(и), платформа, вьюпорт, экран, DPR,
 * `Intl` locale/timeZone, ISO-время, online/cookieEnabled. Самодостаточна (ADR-0028):
 * `resolved` вычисляется inline, без внешних хелперов.
 */
export function readEnvironmentSnapshot(): EnvironmentPart {
  const nav = navigator;
  let locale = '';
  let timeZone = '';
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    locale = resolved.locale;
    timeZone = resolved.timeZone;
  } catch {
    /* Intl недоступен/урезан — оставляем пустые строки, снимок остаётся валидным */
  }
  return {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: [...nav.languages],
    // `navigator.platform` устарел, но для баг-репорта остаётся полезным сигналом ОС
    // и поддержан всеми движками; осознанно оставляем.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    platform: nav.platform,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    devicePixelRatio: window.devicePixelRatio,
    locale,
    timeZone,
    isoTime: new Date().toISOString(),
    online: nav.onLine,
    cookieEnabled: nav.cookieEnabled,
  };
}
