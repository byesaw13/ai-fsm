import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import { vaultItemsFromRecords, type ReportRecord } from "./logic";

/**
 * TASK-175: on publish, copy vault-tagged "Keep for your records" lines into the
 * house's vault. Idempotent — an item with the same category, name and note is
 * never added twice, so re-publishing or re-saving a published report is safe.
 * Returns how many items were added.
 */
export async function saveRecordsToVault(
  db: PoolClient,
  input: {
    accountId: string;
    userId: string;
    traceId?: string;
    jobId: string;
    propertyId: string;
    records: ReportRecord[];
  },
): Promise<number> {
  let added = 0;
  for (const draft of vaultItemsFromRecords(input.records)) {
    const { rows } = await db.query(
      `INSERT INTO property_vault_items
         (account_id, property_id, category, name, notes, linked_visit_id, created_by)
       SELECT $1, $2, $3, $4, $5,
              (SELECT v.id FROM visits v
                WHERE v.job_id = $6 AND v.account_id = $1
                ORDER BY v.completed_at DESC NULLS LAST, v.scheduled_start DESC
                LIMIT 1),
              $7
       WHERE NOT EXISTS (
         SELECT 1 FROM property_vault_items
         WHERE account_id = $1 AND property_id = $2 AND category = $3
           AND lower(name) = lower($4)
           AND lower(COALESCE(notes, '')) = lower(COALESCE($5, ''))
       )
       RETURNING *`,
      [input.accountId, input.propertyId, draft.category, draft.name.slice(0, 255), draft.notes, input.jobId, input.userId],
    );
    if (!rows[0]) continue;
    added += 1;
    await appendAuditLog(db, {
      account_id: input.accountId, entity_type: "vault_item", entity_id: rows[0].id,
      action: "insert", actor_id: input.userId, trace_id: input.traceId ?? null,
      new_value: rows[0],
    });
  }
  return added;
}
