/** Whole minutes between two timestamps, or null if the activity is still open. */
export function durationMinutes(
  startedAt: string | Date | null | undefined,
  endedAt: string | Date | null | undefined,
): number | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 60000));
}

/** ISO date (YYYY-MM-DD) for "today" in the host timezone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}