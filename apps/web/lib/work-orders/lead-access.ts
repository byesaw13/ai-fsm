import type { PoolClient } from "pg";
import type { CompletionCriterion } from "@ai-fsm/domain";
import { getPool } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

export async function setDbSessionContext(
  client: PoolClient,
  session: Pick<SessionPayload, "userId" | "accountId" | "role">,
): Promise<void> {
  await client.query(
    `SELECT set_config('app.current_user_id', $1, true),
            set_config('app.current_account_id', $2, true),
            set_config('app.current_role', $3, true)`,
    [session.userId, session.accountId, session.role],
  );
}

export async function withLeadWorkOrderContext<T>(
  session: Pick<SessionPayload, "userId" | "accountId" | "role">,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await setDbSessionContext(client, session);
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

/** Apply client completion toggles; preserve server-owned label/required fields. */
export function mergeCompletionCriteriaToggles(
  existing: CompletionCriterion[],
  toggles: Array<{ id: string; completed: boolean }>,
): CompletionCriterion[] | { error: string } {
  const toggleById = new Map(toggles.map((t) => [t.id, t.completed]));
  for (const id of toggleById.keys()) {
    if (!existing.some((c) => c.id === id)) {
      return { error: `Unknown completion criterion: ${id}` };
    }
  }
  return existing.map((c) =>
    toggleById.has(c.id) ? { ...c, completed: toggleById.get(c.id)! } : c,
  );
}