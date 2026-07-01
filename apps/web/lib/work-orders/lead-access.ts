import type { PoolClient } from "pg";

export async function assertAssignedLead(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
  userId: string,
): Promise<{ id: string; status: string; completion_criteria: unknown } | null> {
  const res = await client.query<{ id: string; status: string; completion_criteria: unknown }>(
    `SELECT id, status, completion_criteria FROM work_orders
     WHERE id = $1 AND account_id = $2 AND assigned_user_id = $3 FOR UPDATE`,
    [workOrderId, accountId, userId],
  );
  return res.rows[0] ?? null;
}