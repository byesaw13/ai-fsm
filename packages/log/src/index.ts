/**
 * Structured JSON logger shared across services.
 *
 * Emits newline-delimited JSON for log aggregators (journald, Loki, CloudWatch).
 *
 * Format:
 *   { "level": "info", "ts": "2026-02-19T02:00:00.000Z",
 *     "service": "web", "msg": "...", "traceId": "...", ...extra }
 *
 * Usage:
 *   const { logger } = createLogger({ service: "web" });
 *   logger.info("job created", { traceId, jobId });
 *   logger.error("db error", err, { traceId });
 *
 * MCP stdio transport must use sink: "stderr" so stdout stays reserved for JSON-RPC.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  ts: string;
  service: string;
  msg: string;
  err?: { message: string; name: string; stack?: string };
  [key: string]: unknown;
}

export interface LoggerOptions {
  service: string;
  sink?: "stdout" | "stderr";
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, extra?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[raw] ?? LEVELS.info;
}

type Writer = (line: string) => void;

function defaultWriter(sink: "stdout" | "stderr"): Writer {
  const stream = sink === "stderr" ? process.stderr : process.stdout;
  return (line) => stream.write(line + "\n");
}

function serializeError(err: unknown): { message: string; name: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err), name: "UnknownError" };
}

export interface LoggerBundle {
  logger: Logger;
  /** Test-only: replace the output writer. Returns a restore function. */
  _setWriter: (w: Writer) => () => void;
}

export function createLogger(options: LoggerOptions): LoggerBundle {
  const sink = options.sink ?? "stdout";
  let _writer: Writer = defaultWriter(sink);

  function emit(level: LogLevel, msg: string, extra: Record<string, unknown>): void {
    if (LEVELS[level] < getMinLevel()) return;

    const record: LogRecord = {
      level,
      ts: new Date().toISOString(),
      service: options.service,
      msg,
      ...extra,
    };

    _writer(JSON.stringify(record));
  }

  const logger: Logger = {
    debug(msg: string, extra: Record<string, unknown> = {}) {
      emit("debug", msg, extra);
    },

    info(msg: string, extra: Record<string, unknown> = {}) {
      emit("info", msg, extra);
    },

    warn(msg: string, extra: Record<string, unknown> = {}) {
      emit("warn", msg, extra);
    },

    error(msg: string, err?: unknown, extra: Record<string, unknown> = {}) {
      const errFields = err !== undefined ? { err: serializeError(err) } : {};
      emit("error", msg, { ...errFields, ...extra });
    },
  };

  function _setWriter(w: Writer): () => void {
    _writer = w;
    return () => {
      _writer = defaultWriter(sink);
    };
  }

  return { logger, _setWriter };
}