import type { Client } from "pg";

export interface WorkerCommunicationLog {
  accountId: string;
  channel: "email";
  direction: "outbound";
  outcome: "sent" | "failed";
  clientId?: string | null;
  jobId?: string | null;
  visitId?: string | null;
  bodyPreview?: string | null;
  externalId?: string | null;
}

export async function logWorkerCommunication(
  client: Client,
  opts: WorkerCommunicationLog
): Promise<void> {
  await client.query(
    `INSERT INTO communications_log
       (account_id, channel, direction, outcome, client_id, job_id, visit_id,
        body_preview, initiated_by, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)`,
    [
      opts.accountId,
      opts.channel,
      opts.direction,
      opts.outcome,
      opts.clientId ?? null,
      opts.jobId ?? null,
      opts.visitId ?? null,
      opts.bodyPreview ?? null,
      opts.externalId ?? null,
    ]
  );
}
