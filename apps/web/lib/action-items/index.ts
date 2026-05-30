import type { PoolClient } from "pg";

export async function createActionItem(
  client: PoolClient,
  params: {
    accountId: string;
    entityType: "booking_request" | "estimate" | "job" | "invoice";
    entityId: string;
    actionType: string;
    title: string;
    dueAt?: Date | null;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO action_items (account_id, entity_type, entity_id, action_type, title, due_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [params.accountId, params.entityType, params.entityId, params.actionType, params.title, params.dueAt ?? null]
  );
}

export async function resolveActionItems(
  client: PoolClient,
  params: {
    accountId: string;
    entityId: string;
    actionTypes: string[];
    resolvedBy: string | null;  // null for system/automated resolutions (no user actor)
  }
): Promise<void> {
  await client.query(
    `UPDATE action_items
     SET resolved_at = now(), resolved_by = $1
     WHERE account_id = $2
       AND entity_id = $3
       AND action_type = ANY($4)
       AND resolved_at IS NULL`,
    [params.resolvedBy, params.accountId, params.entityId, params.actionTypes]
  );
}
