import { Pool } from "pg";
import type { PoolClient } from "pg";
import { getEnv } from "./env";
import type { SessionPayload } from "./auth/session";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const env = getEnv();
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  }
  return pool;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query<T>(text, params);
  return rows;
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withDbSession<T>(
  session: SessionPayload,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );
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

export async function queryForSession<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  session: SessionPayload,
  text: string,
  params?: unknown[],
): Promise<T[]> {
  return withDbSession(session, async (client) => {
    const { rows } = await client.query<T>(text, params);
    return rows;
  });
}

export async function queryOneForSession<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  session: SessionPayload,
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await queryForSession<T>(session, text, params);
  return rows[0] ?? null;
}
