export const OWNER_PROMISE_ACTION_TYPE = "owner_promise" as const;

export const PROMISE_ENTITY_TYPES = [
  "booking_request",
  "estimate",
  "job",
  "invoice",
] as const;
export type PromiseEntityType = (typeof PROMISE_ENTITY_TYPES)[number];

export const CAPTURE_PROCESSING_STATES = [
  "pending",
  "transcribed",
  "proposed",
  "low_confidence",
  "awaiting_review",
  "snoozed",
  "confirmed",
  "dismissed",
  "failed",
] as const;
export type CaptureProcessingState = (typeof CAPTURE_PROCESSING_STATES)[number];

export type ExtractedCommitment = {
  title: string;
  excerpt: string;
  confidence: "high";
};

export type ReviewCapture = {
  id: string;
  capturedAt: string;
  snoozedAt: string | null;
  snoozeCount: number;
};

const UNCERTAIN =
  /\b(may|might|could|maybe|perhaps)\b|should probably|thinking about|i['’]m thinking|i am thinking/i;

const FIRM =
  /\bi told\b|\bi promised\b|\bi would\b|\bi['’]d\b|\bi will\b|said (he|she|they) will\b|(he|she|they) will send\b/i;

function splitClauses(transcript: string): string[] {
  const protectedTitles = transcript.replace(
    /\b(Mrs|Mr|Ms|Dr|Jr|Sr)\./gi,
    "$1\u0000",
  );
  return protectedTitles
    .split(/(?<=[.!?])\s+|,\s+and\s+/i)
    .map((part) =>
      part.replace(/\u0000/g, ".").trim().replace(/^and\s+/i, ""),
    )
    .filter(Boolean);
}

function clauseIsFirm(clause: string): boolean {
  if (UNCERTAIN.test(clause) && !FIRM.test(clause)) return false;
  return FIRM.test(clause);
}

/** Conservative extract: firm promises only. Uncertain clauses stay original. */
export function extractFirmCommitments(transcript: string): ExtractedCommitment[] {
  return splitClauses(transcript)
    .filter(clauseIsFirm)
    .map((clause) => {
      const excerpt = clause.replace(/[.]+$/, "").trim();
      return { title: excerpt, excerpt, confidence: "high" as const };
    });
}

/** Oldest unsnoozed first, then snoozed-from-last-session, cap 3. */
export function pickReviewCaptures(
  items: ReviewCapture[],
  limit = 3,
): ReviewCapture[] {
  const byTime = (a: string, b: string) => a.localeCompare(b);
  const unsnoozed = items
    .filter((item) => item.snoozeCount === 0)
    .sort((a, b) => byTime(a.capturedAt, b.capturedAt));
  const snoozed = items
    .filter((item) => item.snoozeCount > 0)
    .sort((a, b) =>
      byTime(a.snoozedAt ?? a.capturedAt, b.snoozedAt ?? b.capturedAt),
    );
  return [...unsnoozed, ...snoozed].slice(0, limit);
}

export function promiseBucketTone(
  open: { dueAt: string | null }[],
  now: Date = new Date(),
): "danger" | "warning" {
  const nowMs = now.getTime();
  const overdue = open.some((row) => {
    if (!row.dueAt) return false;
    return new Date(row.dueAt).getTime() < nowMs;
  });
  return overdue ? "danger" : "warning";
}
