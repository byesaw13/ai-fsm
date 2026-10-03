export const LINE_OUTCOMES = [
  "completed",
  "changed",
  "removed_credited",
  "deferred",
  "not_completed",
] as const;

export type LineOutcome = (typeof LINE_OUTCOMES)[number];

export const LINE_OUTCOME_LABELS: Record<LineOutcome, string> = {
  completed: "Completed",
  changed: "Changed",
  removed_credited: "Removed / credited",
  deferred: "Deferred",
  not_completed: "Not completed",
};

export function isLineOutcome(value: string | null | undefined): value is LineOutcome {
  return LINE_OUTCOMES.includes(value as LineOutcome);
}

/** Deferred and not-completed work must not be billed as if it was done. */
export function outcomeBlocksBilling(outcome: string | null | undefined): boolean {
  return outcome === "deferred" || outcome === "not_completed" || outcome === "removed_credited";
}
