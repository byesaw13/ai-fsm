import type { PoolClient } from "pg";
import { recordStatusChange } from "@/lib/status-history";

/**
 * When a linked project finishes (completed / invoiced), mark open booking
 * requests as converted so they don't sit as "reviewed" and get closed as
 * "cancelled" by mistake.
 *
 * "converted" = fulfilled into the work system (project/visit), not "cancelled".
 */
export async function markLinkedBookingRequestConverted(
  client: PoolClient,
  opts: {
    accountId: string;
    jobId: string;
    userId: string;
    note?: string;
  }
): Promise<{ id: string; fromStatus: string } | null> {
  const { rows } = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM booking_requests
     WHERE account_id = $1
       AND job_id = $2
       AND status NOT IN ('converted', 'cancelled', 'duplicate')
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE`,
    [opts.accountId, opts.jobId]
  );
  const br = rows[0];
  if (!br) return null;

  await client.query(
    `UPDATE booking_requests
     SET status = 'converted',
         reviewed_by = COALESCE(reviewed_by, $3),
         reviewed_at = COALESCE(reviewed_at, now()),
         review_notes = COALESCE(
           review_notes,
           $4
         ),
         updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [
      br.id,
      opts.accountId,
      opts.userId,
      opts.note ?? "Auto-converted: linked project completed/invoiced.",
    ]
  );

  await recordStatusChange(client, {
    accountId: opts.accountId,
    entityType: "booking_request",
    entityId: br.id,
    fromStatus: br.status,
    toStatus: "converted",
    changedBy: opts.userId,
    note: opts.note ?? "Linked project completed/invoiced",
  });

  return { id: br.id, fromStatus: br.status };
}
