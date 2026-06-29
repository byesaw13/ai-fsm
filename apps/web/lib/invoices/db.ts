import type { PoolClient } from "pg";
import { withDbSession } from "../db";
import type { SessionPayload } from "../auth/session";

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
  return withDbSession(session, fn);
}

/**
 * Generate the next invoice number for an account.
 * Format: INV-{zero-padded 4-digit sequence}
 * Example: INV-0001, INV-0042, INV-1234
 *
 * Allocates from the highest existing suffix + 1 (not a row count): a
 * count-based sequence reuses a live number after a non-latest invoice is
 * removed/voided and collides with the (account_id, invoice_number) unique
 * index. Gaps are acceptable. Must run inside a transaction to avoid races.
 */
export async function generateInvoiceNumber(
  client: PoolClient,
  accountId: string
): Promise<string> {
  // Only consider numbers this generator produced (INV-####); custom/historical
  // invoice numbers in other formats are left out of the sequence (the unique
  // index still keeps everything distinct).
  const result = await client.query<{ next: string }>(
    `SELECT COALESCE(MAX(substring(invoice_number from '^INV-(\\d+)$')::int), 0) + 1 AS next
     FROM invoices
     WHERE account_id = $1 AND invoice_number ~ '^INV-\\d+$'`,
    [accountId]
  );
  const next = parseInt(result.rows[0]?.next ?? "1", 10);
  return `INV-${String(next).padStart(4, "0")}`;
}
