import { query } from "@/lib/db";

export interface LogCommunicationOpts {
  accountId: string;
  channel: "sms" | "email" | "phone";
  direction: "outbound" | "inbound";
  outcome: "sent" | "delivered" | "failed" | "no_answer" | "left_voicemail" | "replied";
  clientId?: string | null;
  bookingRequestId?: string | null;
  jobId?: string | null;
  visitId?: string | null;
  bodyPreview?: string | null;
  initiatedBy?: string | null;
  externalId?: string | null;
}

/**
 * Logs a communication. Returns the new row id, or null if it was skipped as a
 * duplicate (same account_id + external_id). The dedup only applies when
 * external_id is set; see migration 100. Callers use the id both to detect
 * duplicates and to back-fill linkage (e.g. job_id) afterwards.
 */
export async function logCommunication(opts: LogCommunicationOpts): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `INSERT INTO communications_log
       (account_id, channel, direction, outcome, client_id, booking_request_id,
        job_id, visit_id, body_preview, initiated_by, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (account_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      opts.accountId,
      opts.channel,
      opts.direction,
      opts.outcome,
      opts.clientId ?? null,
      opts.bookingRequestId ?? null,
      opts.jobId ?? null,
      opts.visitId ?? null,
      opts.bodyPreview ?? null,
      opts.initiatedBy ?? null,
      opts.externalId ?? null,
    ]
  );
  return rows[0]?.id ?? null;
}
