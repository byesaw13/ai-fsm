export type AttentionSurface = "today" | "desk";

/** Unsent Hold — louder than any other Today leftover. */
export const HOLD_SEND_BILL_LABEL = "Hold — send the bill";

/** Field leftovers — the phone, after the van. */
export const ATTENTION_TODAY_LABELS = [
  HOLD_SEND_BILL_LABEL,
  "Open, no next visit",
  "Receipts not on a job",
  "Miles not on a job",
  "Schedule jobs",
  "Order materials",
] as const;

/** Money and office leaks — the desk. */
export const ATTENTION_DESK_LABELS = [
  "Draft bills",
  "Follow up quotes",
  "Collect deposits",
  "Collect overdue bills",
  "Review requests",
  "Clear exception lanes",
  "Customer Promises",
] as const;

const TODAY = new Set<string>(ATTENTION_TODAY_LABELS);
const DESK = new Set<string>(ATTENTION_DESK_LABELS);

export function attentionSurfaceForLabel(label: string): AttentionSurface {
  if (TODAY.has(label)) return "today";
  if (DESK.has(label)) return "desk";
  return "desk";
}

export function filterAttentionForSurface<T extends { label: string }>(
  items: T[],
  surface: AttentionSurface,
): T[] {
  const filtered = items.filter((item) => attentionSurfaceForLabel(item.label) === surface);
  if (surface !== "today") return filtered;
  const hold = filtered.filter((item) => item.label === HOLD_SEND_BILL_LABEL);
  const rest = filtered.filter((item) => item.label !== HOLD_SEND_BILL_LABEL);
  return [...hold, ...rest];
}
