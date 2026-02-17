import type { PoolClient } from "pg";

export interface AuditEntry {
  account_id: string;
  entity_type: string;
  entity_id: string;
  action: "insert" | "update" | "delete";
  actor_id: string;
  trace_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}

/**
 * Append one row to audit_log within an existing DB transaction.
 *
 * Must be called inside a transaction that already has the app.* session
 * variables set (app_account_id, app_user_id, app_role) so RLS allows the
 * INSERT. The RLS audit_log_insert policy requires account_id = app_account_id().
 */
export async function appendAuditLog(
  client: PoolClient,
  entry: AuditEntry
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, trace_id, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.account_id,
      entry.entity_type,
      entry.entity_id,
      entry.action,
      entry.actor_id,
      entry.trace_id ?? null,
      entry.old_value != null ? JSON.stringify(entry.old_value) : null,
      entry.new_value != null ? JSON.stringify(entry.new_value) : null,
    ]
  );
}
