/**
 * Structured JSON logger for the MCP server.
 *
 * IMPORTANT: writes to **stderr**, never stdout. The stdio MCP transport owns
 * stdout for JSON-RPC framing; any stray stdout write corrupts the protocol.
 *
 * Format:
 *   { "level": "info", "ts": "2026-06-22T...", "service": "mcp", "msg": "...", ... }
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[raw] ?? LEVELS.info;
}

type Writer = (line: string) => void;
let _writer: Writer = (line) => process.stderr.write(line + "\n");

/** Test-only: replace the output writer. Returns a restore function. */
export function _setWriter(w: Writer): () => void {
  _writer = w;
  return () => {
    _writer = (line) => process.stderr.write(line + "\n");
  };
}

function serializeError(err: unknown): { message: string; name: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err), name: "UnknownError" };
}

function emit(level: LogLevel, msg: string, extra: Record<string, unknown>): void {
  if (LEVELS[level] < getMinLevel()) return;
  _writer(
    JSON.stringify({
      level,
      ts: new Date().toISOString(),
      service: "mcp",
      msg,
      ...extra,
    }),
  );
}

export const logger = {
  debug: (msg: string, extra: Record<string, unknown> = {}) => emit("debug", msg, extra),
  info: (msg: string, extra: Record<string, unknown> = {}) => emit("info", msg, extra),
  warn: (msg: string, extra: Record<string, unknown> = {}) => emit("warn", msg, extra),
  error: (msg: string, err?: unknown, extra: Record<string, unknown> = {}) =>
    emit("error", msg, { ...(err !== undefined ? { err: serializeError(err) } : {}), ...extra }),
};
