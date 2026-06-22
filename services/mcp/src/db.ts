import pg from "pg";
import type { PoolClient } from "pg";
import type { Executor, Session } from "./types.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    // Small pool: this is a single-operator local server, not a web tier.
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run `fn` inside a **read-only** transaction with the RLS session context set
 * to the operator's identity — mirroring `withDbSession` in
 * `apps/web/lib/db.ts` so tenant isolation is enforced the same way the web app
 * enforces it.
 *
 * Two independent guards back the v1 read-only contract:
 *   1. `SET LOCAL transaction_read_only = on` — Postgres rejects any write.
 *   2. `app.current_*` session vars feed the same RLS policies the web app uses.
 *
 * Tool queries additionally pass `account_id = $1` explicitly, matching the
 * established app convention (RLS is defense in depth, not the only scope).
 */
export async function withMcpSession<T>(
  session: Session,
  fn: (exec: Executor) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL transaction_read_only = on");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const exec: Executor = {
      async query<R extends Record<string, unknown>>(text: string, params?: unknown[]) {
        const result = await client.query<R>(text, params as unknown[]);
        return { rows: result.rows };
      },
    };

    const out = await fn(exec);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
