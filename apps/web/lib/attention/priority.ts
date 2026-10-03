export type AttentionTone = "danger" | "warning" | "default";

export type AttentionPriority = {
  rank: number;
  reason: string;
};

/**
 * Lower rank is handled first.
 * Promise, then money, then lateness, blocked work, scheduling, then cleanup.
 * Tone is not the sort key: a warning receipt must not outrank overdue money.
 */
const RANK_BY_LABEL: Record<string, AttentionPriority> = {
  "Customer Promises": { rank: 20, reason: "Customer promise" },
  "Collect overdue bills": { rank: 30, reason: "Money is late" },
  "Collect deposits": { rank: 40, reason: "Money to collect" },
  "Hold — send the bill": { rank: 50, reason: "Finished work is not billed" },
  "Draft bills": { rank: 60, reason: "A bill is ready to send" },
  "Clear exception lanes": { rank: 80, reason: "Work is blocked" },
  "Order materials": { rank: 90, reason: "Materials are needed before the visit" },
  "Open, no next visit": { rank: 100, reason: "Nothing is on the calendar" },
  "Schedule jobs": { rank: 100, reason: "Nothing is on the calendar" },
  "Review requests": { rank: 110, reason: "A request is waiting" },
  "Follow up quotes": { rank: 120, reason: "A quote is waiting on the customer" },
  "Receipts not on a job": { rank: 150, reason: "Receipt is not attached" },
  "Miles not on a job": { rank: 160, reason: "Miles are not tagged" },
  "Customer reports to send": { rank: 170, reason: "The customer has not seen the report" },
};

export function attentionPriority(item: {
  label: string;
  detail: string;
  tone: AttentionTone;
}): AttentionPriority {
  if (item.label === "Customer Promises" && item.tone === "danger") {
    return { rank: 10, reason: "A customer promise is late" };
  }
  if (item.label === "Follow up quotes" && /expired/i.test(item.detail)) {
    return { rank: 70, reason: "A quote expired" };
  }
  return RANK_BY_LABEL[item.label] ?? { rank: 200, reason: "Needs a look" };
}

export function compareNeedsAttention<
  T extends { label: string; detail: string; tone: AttentionTone; count: number },
>(a: T, b: T): number {
  const rank = attentionPriority(a).rank - attentionPriority(b).rank;
  if (rank !== 0) return rank;
  return b.count - a.count;
}
