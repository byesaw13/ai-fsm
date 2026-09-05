/**
 * Resolve push recipients (EPIC-005 TASK-118). Mirrors the owner/admin lookup
 * in lib/attention/email.ts.
 */
import type { PoolClient } from "pg";

/** All owner + admin user ids in the account (owner first). */
export async function ownerAndAdminUserIds(
  client: PoolClient,
  accountId: string,
): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM users
      WHERE account_id = $1 AND role IN ('owner', 'admin')
      ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC`,
    [accountId],
  );
  return rows.map((r) => r.id);
}
