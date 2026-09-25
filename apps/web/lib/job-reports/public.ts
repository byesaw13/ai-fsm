import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";

/**
 * Run `fn` for a published report's share token under that report's RLS
 * account context. The token → account step goes through the narrow
 * SECURITY DEFINER lookup (migration 198) so this works for the restricted
 * runtime role. Returns null when the token isn't a published report.
 */
export async function withPublishedReport<T>(
  token: string,
  fn: (db: PoolClient, accountId: string) => Promise<T>,
): Promise<T | null> {
  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query<{ account_id: string | null }>(
      `SELECT portal_job_report_account($1::uuid)::text AS account_id`,
      [token],
    );
    const accountId = rows[0]?.account_id;
    if (!accountId) {
      await db.query("ROLLBACK");
      return null;
    }
    await db.query(
      `SELECT set_config('app.current_account_id', $1, true), set_config('app.current_role', 'owner', true)`,
      [accountId],
    );
    const result = await fn(db, accountId);
    await db.query("COMMIT");
    return result;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}
