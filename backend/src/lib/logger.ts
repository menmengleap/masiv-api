/**
 * Simple structured logger with an in-memory ring buffer.
 *
 * The ring buffer powers the admin "Bot Logs" / system logs panel without
 * needing a separate log store. Business-level events (sync, orders, worker
 * ticks) are pushed here as well as written to stdout.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 'api' | 'bot' | 'worker' | 'db' | 'system';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: LogSource;
  message: string;
}

const RING_SIZE = 500;
const ring: LogEntry[] = [];

function push(entry: LogEntry) {
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
}

function emit(level: LogLevel, source: LogSource, message: string, meta?: unknown) {
  const ts = new Date().toISOString();
  push({ ts, level, source, message });
  const line = `${ts} [${level.toUpperCase()}] [${source}] ${message}`;
  const metaStr = meta === undefined ? '' : ` ${safeStringify(meta)}`;
  if (level === 'error') console.error(line + metaStr);
  else if (level === 'warn') console.warn(line + metaStr);
  else console.log(line + metaStr);
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const logger = {
  info: (source: LogSource, message: string, meta?: unknown) => emit('info', source, message, meta),
  warn: (source: LogSource, message: string, meta?: unknown) => emit('warn', source, message, meta),
  error: (source: LogSource, message: string, meta?: unknown) => emit('error', source, message, meta),
  debug: (source: LogSource, message: string, meta?: unknown) => emit('debug', source, message, meta),
  /** Most recent entries, newest last. Optionally filter by source. */
  recent(limit = 100, source?: LogSource): LogEntry[] {
    const items = source ? ring.filter((e) => e.source === source) : ring;
    return items.slice(-limit);
  },
};
