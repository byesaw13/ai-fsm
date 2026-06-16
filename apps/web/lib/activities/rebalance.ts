import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";

/** One neighbour adjustment as accepted by the correction routes. */
export interface RebalanceInput {
  id: string;
  started_at?: string;
  ended_at?: string;
  delete?: boolean;
}

interface RebalanceContext {
  accountId: string;
  userId: string;
  traceId: string;
  /** The entry being edited/inserted — never rebalance it against itself. */
  skipId?: string;
}

/**
 * Apply neighbour rebalancing inside an open transaction (RLS session vars must
 * already be set). Each adjustment either clamps a completed neighbour's bounds
 * or drops a fully-engulfed one; deletes are audited so the original survives in
 * audit_log.old_value. Only completed, non-voided rows are touched.
 */
export async function applyRebalance(
  client: PoolClient,
  ctx: RebalanceContext,
  adjustments: RebalanceInput[] | undefined,
): Promise<void> {
  for (const adj of adjustments ?? []) {
    if (ctx.skipId != null && adj.id === ctx.skipId) continue;

    if (adj.delete) {
      const existing = await client.query<{
        id: string; activity_type: string; started_at: string; ended_at: string | null;
        entity_type: string | null; entity_id: string | null; note: string | null;
      }>(
        `DELETE FROM activity_entries
         WHERE id = $1 AND account_id = $2 AND ended_at IS NOT NULL AND voided_at IS NULL
         RETURNING id, activity_type, started_at::text, ended_at::text, entity_type, entity_id, note`,
        [adj.id, ctx.accountId]
      );
      const row = existing.rows[0];
      if (!row) continue;
      await appendAuditLog(client, {
        account_id: ctx.accountId,
        entity_type: "activity_entry",
        entity_id: row.id,
        action: "delete",
        actor_id: ctx.userId,
        trace_id: ctx.traceId,
        old_value: {
          activity_type: row.activity_type, started_at: row.started_at, ended_at: row.ended_at,
          entity_type: row.entity_type, entity_id: row.entity_id, note: row.note,
        },
        new_value: { reason: "rebalanced (engulfed by timeline correction)" },
      });
      continue;
    }

    await client.query(
      `UPDATE activity_entries
       SET started_at = COALESCE($1::timestamptz, started_at),
           ended_at   = COALESCE($2::timestamptz, ended_at)
       WHERE id = $3 AND account_id = $4 AND ended_at IS NOT NULL AND voided_at IS NULL`,
      [adj.started_at ?? null, adj.ended_at ?? null, adj.id, ctx.accountId]
    );
  }
}
