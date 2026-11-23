import { queryOneForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import type { JobProgressInput } from "./progress-line";

/**
 * The records behind a job's progress line (TASK-240), for pages that do not
 * already load them (the customer page). Same rules as the job page's
 * commercial counts: latest estimate, latest approved estimate, latest
 * final/standard invoice that is not void.
 */
export async function loadJobProgressInput(
  session: SessionPayload,
  jobId: string,
): Promise<JobProgressInput | null> {
  const row = await queryOneForSession<{
    status: string;
    request_id: string | null;
    estimate_id: string | null;
    estimate_sent: boolean;
    approved_estimate_id: string | null;
    invoice_id: string | null;
    invoice_status: string | null;
  }>(
    session,
    `SELECT j.status,
            (SELECT br.id FROM booking_requests br
              WHERE br.job_id = j.id AND br.account_id = j.account_id
              ORDER BY br.created_at DESC LIMIT 1) AS request_id,
            (SELECT e.id FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id
              ORDER BY e.created_at DESC LIMIT 1) AS estimate_id,
            EXISTS (SELECT 1 FROM estimates e
                     WHERE e.job_id = j.id AND e.account_id = j.account_id
                       AND e.status IN ('sent','approved')) AS estimate_sent,
            (SELECT e.id FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved'
              ORDER BY e.created_at DESC LIMIT 1) AS approved_estimate_id,
            fi.id AS invoice_id,
            fi.status AS invoice_status
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT i.id, i.status FROM invoices i
          WHERE i.job_id = j.id AND i.account_id = j.account_id
            AND i.invoice_kind IN ('final','standard') AND i.status != 'void'
          ORDER BY i.created_at DESC LIMIT 1
       ) fi ON true
      WHERE j.id = $1 AND j.account_id = $2`,
    [jobId, session.accountId],
  );
  if (!row) return null;
  return {
    jobStatus: row.status,
    requestId: row.request_id,
    estimateId: row.estimate_id,
    estimateSent: row.estimate_sent,
    approvedEstimateId: row.approved_estimate_id,
    invoiceId: row.invoice_id,
    invoiceStatus: row.invoice_status,
  };
}
