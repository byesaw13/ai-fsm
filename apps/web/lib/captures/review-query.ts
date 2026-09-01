import {
  pickReviewCaptures,
  PROMISE_ENTITY_TYPES,
  type PromiseEntityType,
} from "@ai-fsm/domain";
import { withDbSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

export const REVIEWABLE_PROCESSING_STATES = [
  "proposed",
  "low_confidence",
  "awaiting_review",
  "snoozed",
  "failed",
] as const;

export type ReviewableProcessingState = (typeof REVIEWABLE_PROCESSING_STATES)[number];

const REVIEWABLE = new Set<string>(REVIEWABLE_PROCESSING_STATES);

export type CaptureEvidenceRow = {
  id: string;
  captured_at: string;
  snoozed_at: string | null;
  snooze_count: number;
  transcript: string | null;
  processing_state: string;
  proposed_title: string | null;
  proposed_due_at: string | null;
  proposed_span: string | null;
  confidence: string | null;
  suggested_entity_type: PromiseEntityType | null;
  suggested_entity_id: string | null;
  audio_filename: string | null;
  confirmed_at: string | null;
  dismissed_at: string | null;
};

export type ReviewCaptureView = {
  id: string;
  capturedAt: string;
  snoozedAt: string | null;
  snoozeCount: number;
  excerpt: string;
  proposedTitle: string | null;
  proposedDueAt: string | null;
  suggestedEntityType: PromiseEntityType | null;
  suggestedEntityId: string | null;
  hasAudio: boolean;
  processingState: string;
};

function asEntityType(value: string | null): PromiseEntityType | null {
  if (!value) return null;
  return (PROMISE_ENTITY_TYPES as readonly string[]).includes(value)
    ? (value as PromiseEntityType)
    : null;
}

export function captureIsReviewable(row: CaptureEvidenceRow): boolean {
  return (
    row.confirmed_at == null &&
    row.dismissed_at == null &&
    REVIEWABLE.has(row.processing_state)
  );
}

export function excerptFromCapture(
  row: Pick<CaptureEvidenceRow, "proposed_span" | "proposed_title" | "transcript">,
): string {
  const span = row.proposed_span?.trim();
  if (span) return span;
  const title = row.proposed_title?.trim();
  if (title) return title;
  const transcript = row.transcript?.trim() ?? "";
  if (transcript.length <= 280) return transcript;
  return `${transcript.slice(0, 277)}...`;
}

export function toReviewCaptureView(row: CaptureEvidenceRow): ReviewCaptureView {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    snoozedAt: row.snoozed_at,
    snoozeCount: Number(row.snooze_count) || 0,
    excerpt: excerptFromCapture(row),
    proposedTitle: row.proposed_title,
    proposedDueAt: row.proposed_due_at,
    suggestedEntityType: asEntityType(row.suggested_entity_type),
    suggestedEntityId: row.suggested_entity_id,
    hasAudio: Boolean(row.audio_filename),
    processingState: row.processing_state,
  };
}

/** Filter unconfirmed reviewable rows, then oldest unsnoozed first, cap 3. */
export function selectReviewCaptures(
  rows: CaptureEvidenceRow[],
  limit = 3,
): ReviewCaptureView[] {
  const reviewable = rows.filter(captureIsReviewable).map(toReviewCaptureView);
  const picked = pickReviewCaptures(reviewable, limit);
  const byId = new Map(reviewable.map((row) => [row.id, row]));
  return picked.flatMap((item) => {
    const view = byId.get(item.id);
    return view ? [view] : [];
  });
}

export async function loadReviewCaptures(
  session: SessionPayload,
  limit = 3,
): Promise<ReviewCaptureView[]> {
  return withDbSession(session, async (client) => {
    const { rows } = await client.query<CaptureEvidenceRow>(
      `SELECT id,
              captured_at::text,
              snoozed_at::text,
              snooze_count,
              transcript,
              processing_state,
              proposed_title,
              proposed_due_at::text,
              proposed_span,
              confidence,
              suggested_entity_type,
              suggested_entity_id,
              audio_filename,
              confirmed_at::text,
              dismissed_at::text
       FROM capture_evidence
       WHERE account_id = $1
         AND confirmed_at IS NULL
         AND dismissed_at IS NULL
         AND processing_state IN ('proposed', 'low_confidence', 'awaiting_review', 'snoozed', 'failed')`,
      [session.accountId],
    );
    return selectReviewCaptures(rows, limit);
  });
}
