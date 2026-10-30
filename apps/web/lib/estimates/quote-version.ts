/**
 * Quote saves carry the updated_at the page loaded (TASK-222).
 *
 * node-pg turns timestamptz into a Date, which keeps milliseconds and drops
 * the rest. Compare at that precision. The row trigger sets updated_at on
 * every write, so a later save has a new value.
 */

export const STALE_QUOTE_MESSAGE =
  "This quote changed since you opened it. Reload to see the latest before saving.";

/** Instant in milliseconds, or null when the value is not a timestamp. */
function quoteVersionMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function quoteVersionsMatch(stored: unknown, loaded: unknown): boolean {
  const storedMs = quoteVersionMs(stored);
  const loadedMs = quoteVersionMs(loaded);
  return storedMs !== null && storedMs === loadedMs;
}

/** ISO timestamp the page stores after a load or a successful save. */
export function quoteUpdatedAt(value: unknown): string {
  const ms = quoteVersionMs(value);
  return ms === null ? "" : new Date(ms).toISOString();
}

export function assertQuoteVersion(stored: unknown, loaded: unknown): void {
  if (quoteVersionMs(loaded) === null || quoteVersionMs(stored) === null) {
    throw Object.assign(new Error("Invalid request body"), { code: "VALIDATION_ERROR" });
  }
  if (!quoteVersionsMatch(stored, loaded)) {
    throw Object.assign(new Error(STALE_QUOTE_MESSAGE), { code: "STALE_QUOTE" });
  }
}
