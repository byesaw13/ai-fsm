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

export async function logCommunication(opts: LogCommunicationOpts): Promise<void> {
  await query(
    `INSERT INTO communications_log
       (account_id, channel, direction, outcome, client_id, booking_request_id,
        job_id, visit_id, body_preview, initiated_by, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
}
