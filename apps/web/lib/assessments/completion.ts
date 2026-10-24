/**
 * The stored completion time as an ISO string, or null. A save made only to
 * prepare a quote sends this back so it never reopens a completed assessment
 * (TASK-179). Accepts the Date the page loads from Postgres or a string.
 */
export function completionToKeep(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
