/**
 * Lead source / referral ROI helpers (TASK-017).
 * Labels for booking_requests.referral_source + pure rollup math.
 */

export const REFERRAL_SOURCES = [
  "online",
  "friend_neighbor",
  "realtor",
  "repeat",
  "other",
  "unknown",
] as const;

export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const REFERRAL_SOURCE_LABELS: Record<ReferralSource, string> = {
  online: "Online",
  friend_neighbor: "Friend / neighbor",
  realtor: "Realtor",
  repeat: "Repeat client",
  other: "Other",
  unknown: "Not captured",
};

export function normalizeReferralSource(raw: string | null | undefined): ReferralSource {
  const s = (raw ?? "").trim();
  if ((REFERRAL_SOURCES as readonly string[]).includes(s) && s !== "unknown") {
    return s as ReferralSource;
  }
  return "unknown";
}

export function referralSourceLabel(raw: string | null | undefined): string {
  return REFERRAL_SOURCE_LABELS[normalizeReferralSource(raw)];
}

export type ReferralRoiRowInput = {
  source: string | null;
  request_count: number;
  job_count: number;
  revenue_cents: number;
  paid_cents: number;
};

export type ReferralRoiRow = {
  source: ReferralSource;
  label: string;
  request_count: number;
  job_count: number;
  revenue_cents: number;
  paid_cents: number;
  /** paid_cents per converted job, or null when job_count is 0 */
  paid_per_job_cents: number | null;
  /** jobs / requests as 0–1, or null when request_count is 0 */
  conversion_rate: number | null;
};

/** Pure: normalize + enrich one aggregation row for display. */
export function buildReferralRoiRow(input: ReferralRoiRowInput): ReferralRoiRow {
  const source = normalizeReferralSource(input.source);
  const request_count = Math.max(0, Math.floor(input.request_count));
  const job_count = Math.max(0, Math.floor(input.job_count));
  const revenue_cents = Math.round(input.revenue_cents);
  const paid_cents = Math.round(input.paid_cents);
  return {
    source,
    label: REFERRAL_SOURCE_LABELS[source],
    request_count,
    job_count,
    revenue_cents,
    paid_cents,
    paid_per_job_cents: job_count > 0 ? Math.round(paid_cents / job_count) : null,
    conversion_rate: request_count > 0 ? job_count / request_count : null,
  };
}

/** Pure: sort rows by paid revenue descending (then requests). */
export function sortReferralRoiRows(rows: ReferralRoiRow[]): ReferralRoiRow[] {
  return [...rows].sort((a, b) => {
    if (b.paid_cents !== a.paid_cents) return b.paid_cents - a.paid_cents;
    if (b.revenue_cents !== a.revenue_cents) return b.revenue_cents - a.revenue_cents;
    return b.request_count - a.request_count;
  });
}
