/**
 * Structured JSON logger for the worker service.
 *
 * Mirrors the web logger interface but tags records with service: "worker".
 * Emits newline-delimited JSON to stdout for log aggregation.
 *
 * Format:
 *   { "level": "info", "ts": "2026-02-19T02:00:00.000Z",
 *     "service": "worker", "msg": "...", ...extra }
 *
 * Usage:
 *   import { logger } from "./logger.js";
 *   logger.info("poll tick", { due: 3 });
 *   logger.error("db error", err, { automationId });
 *
 * Test helper:
 *   import { _setWriter } from "./logger.js";  // test-only
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  ts: string;
  service: "worker";
  msg: string;
  err?: { message: string; name: string; stack?: string };
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[raw] ?? LEVELS.info;
}

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
    service: "worker",
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

  error(msg: string, err?: unknown, extra: Record<string, unknown> = {}): void {
    const errFields = err !== undefined ? { err: serializeError(err) } : {};
    emit("error", msg, { ...errFields, ...extra });
  },
};
