import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Run fn within a PostgreSQL transaction with RLS session context set.
 * Mirrors withEstimateContext from lib/estimates/db.ts.
 *
 * Source evidence:
 *   Myprogram: supabase/migrations/003_rls_policies.sql (set_config pattern)
 *   AI-FSM: db/migrations/003_rls_policies.sql (app.* session vars)
 *   AI-FSM: apps/web/lib/estimates/db.ts (established pattern for this project)
 */
export async function withInvoiceContext<T>(
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

/**
 * Generate the next invoice number for an account.
 * Format: INV-{zero-padded 4-digit count}
 * Example: INV-0001, INV-0042, INV-1234
 *
 * Must be called inside a transaction to avoid race conditions.
 */
export async function generateInvoiceNumber(
  client: PoolClient,
  accountId: string
): Promise<string> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM invoices WHERE account_id = $1`,
    [accountId]
  );
  const count = parseInt(result.rows[0]?.count ?? "0", 10) + 1;
  return `INV-${String(count).padStart(4, "0")}`;
}
