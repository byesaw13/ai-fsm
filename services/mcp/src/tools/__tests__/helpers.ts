import type { Executor, Session } from "../../types.js";

export const TEST_SESSION: Session = {
  userId: "00000000-0000-0000-0000-0000000000aa",
  accountId: "00000000-0000-0000-0000-0000000000bb",
  role: "owner",
  fullName: "Test Owner",
};

export interface Handler {
  /** Matched against the SQL text of each query. */
  match: RegExp;
  rows: Record<string, unknown>[];
}

export interface RecordedCall {
  text: string;
  params?: unknown[];
}

/**
 * In-memory Executor for unit tests. Each query is matched against `handlers`
 * by regex (first match wins) and the canned rows are returned. Unmatched
 * queries throw, so tests fail loudly when a tool's SQL changes shape.
 */
export function makeExec(handlers: Handler[]): { exec: Executor; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const exec: Executor = {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]) {
      calls.push({ text, params });
      const handler = handlers.find((h) => h.match.test(text));
      if (!handler) {
        throw new Error(`makeExec: no handler matched query:\n${text}`);
      }
      return { rows: handler.rows as T[] };
    },
  };
  return { exec, calls };
}
