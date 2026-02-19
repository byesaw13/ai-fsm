/**
 * Structured JSON logger for the web application.
 *
 * Emits newline-delimited JSON to stdout so log aggregators (journald,
 * Loki, CloudWatch) can parse fields without regex.
 *
 * Format:
 *   { "level": "info", "ts": "2026-02-19T02:00:00.000Z",
 *     "service": "web", "msg": "...", "traceId": "...", ...extra }
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("job created", { traceId, jobId });
 *   logger.error("db error", err, { traceId });
 *
 * Test helper:
 *   import { _setWriter } from "@/lib/logger";  // test-only
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  ts: string;
  service: "web";
  msg: string;
  traceId?: string;
  err?: { message: string; name: string; stack?: string };
  [key: string]: unknown;
}

// Minimum level to emit. Override with LOG_LEVEL env var.
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[raw] ?? LEVELS.info;
}

// Injectable writer — tests swap this out to capture output.
type Writer = (line: string) => void;
let _writer: Writer = (line) => process.stdout.write(line + "\n");

/** Test-only: replace the output writer. Returns a restore function. */
export function _setWriter(w: Writer): () => void {
  _writer = w;
  return () => {
    _writer = (line) => process.stdout.write(line + "\n");
  };
}

function emit(level: LogLevel, msg: string, extra: Record<string, unknown>): void {
  if (LEVELS[level] < getMinLevel()) return;

  const record: LogRecord = {
    level,
    ts: new Date().toISOString(),
    service: "web",
    msg,
    ...extra,
  };

  _writer(JSON.stringify(record));
}

function serializeError(err: unknown): { message: string; name: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err), name: "UnknownError" };
}

export const logger = {
  debug(msg: string, extra: Record<string, unknown> = {}): void {
    emit("debug", msg, extra);
  },

  info(msg: string, extra: Record<string, unknown> = {}): void {
    emit("info", msg, extra);
  },

  warn(msg: string, extra: Record<string, unknown> = {}): void {
    emit("warn", msg, extra);
  },

  /**
   * Log an error. The second argument may be the raw Error (or unknown
   * catch value) — it is serialized into `err.message / err.name / err.stack`.
   * Additional structured fields go in the third argument.
   */
  error(msg: string, err?: unknown, extra: Record<string, unknown> = {}): void {
    const errFields = err !== undefined ? { err: serializeError(err) } : {};
    emit("error", msg, { ...errFields, ...extra });
  },
};
