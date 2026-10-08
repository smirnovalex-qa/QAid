/**
 * Структурное логирование с префиксом `[qaid]`.
 *
 * `debug` — дешёвый no-op в prod-сборке (`import.meta.env.PROD`). Логи никуда не
 * отправляются: приватность и local-first (PRD §9 / ARCHITECTURE §11).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[qaid]';
const isProd = import.meta.env.PROD;

function emit(level: Level, args: unknown[]): void {
  if (level === 'debug' && isProd) return;
  console[level](PREFIX, ...args);
}

export const logger = {
  debug: (...args: unknown[]): void => {
    emit('debug', args);
  },
  info: (...args: unknown[]): void => {
    emit('info', args);
  },
  warn: (...args: unknown[]): void => {
    emit('warn', args);
  },
  error: (...args: unknown[]): void => {
    emit('error', args);
  },
};
