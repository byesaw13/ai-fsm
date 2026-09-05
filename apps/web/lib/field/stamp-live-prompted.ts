import type { PoolClient } from "pg";

/** First live-prompt stamp so HA ack is not required (TASK-116). */
export async function stampLivePromptedAt(
  client: PoolClient,
  candidateId: string,
  accountId: string,
): Promise<void> {
  await client.query(
    `UPDATE visit_candidates
        SET live_prompted_at = COALESCE(live_prompted_at, now()), updated_at = now()
      WHERE id = $1 AND account_id = $2 AND status = 'pending'`,
    [candidateId, accountId],
  );
}
