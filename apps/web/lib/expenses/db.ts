import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Run fn within a PostgreSQL transaction with RLS session context set.
 *
 * Mirrors withEstimateContext — sets app.current_user_id, app.current_account_id,
 * app.current_role as LOCAL (transaction-scoped) config vars so RLS policies
 * enforce tenant isolation and role-based access on the expenses table.
 */
export async function withExpenseContext<T>(
  session: SessionPayload,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [
      session.userId,
    ]);
    await client.query(
      "SELECT set_config('app.current_account_id', $1, true)",
      [session.accountId]
    );
    await client.query("SELECT set_config('app.current_role', $1, true)", [
      session.role,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
