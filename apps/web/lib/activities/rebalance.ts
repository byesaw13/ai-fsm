import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";

/** One neighbour adjustment as accepted by the correction routes. */
export interface RebalanceInput {
  id: string;
  started_at?: string;
  ended_at?: string;
  delete?: boolean;
}

export interface OverlapRow {
  id: string;
  started_at: string;
  ended_at: string | null;
}

function time(iso: string): number {
  return new Date(iso).getTime();
}

export function rebalanceCoversOverlaps(
  overlaps: OverlapRow[],
  adjustments: RebalanceInput[] | undefined,
  change: { started_at: string; ended_at: string },
): boolean {
  if (overlaps.length === 0) return !adjustments?.length;
  if (!adjustments?.length) return false;
  if (overlaps.length !== adjustments.length) return false;

  const byId = new Map(adjustments.map((a) => [a.id, a]));
  const changeStart = time(change.started_at);
  const changeEnd = time(change.ended_at);

  return overlaps.every((overlap) => {
    const adj = byId.get(overlap.id);
    if (!adj) return false;
    if (adj.delete) return true;
    const start = time(adj.started_at ?? overlap.started_at);
    const end = overlap.ended_at ? time(adj.ended_at ?? overlap.ended_at) : Number.POSITIVE_INFINITY;
    return end > start && (end <= changeStart || start >= changeEnd);
  });
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

    const existing = await client.query<{
      id: string; activity_type: string; started_at: string; ended_at: string | null;
      entity_type: string | null; entity_id: string | null; note: string | null;
    }>(
      `SELECT id, activity_type, started_at::text, ended_at::text, entity_type, entity_id, note
         FROM activity_entries
        WHERE id = $1 AND account_id = $2 AND ended_at IS NOT NULL AND voided_at IS NULL
        FOR UPDATE`,
      [adj.id, ctx.accountId],
    );
    const row = existing.rows[0];
    if (!row) continue;

    const updated = await client.query<{
      id: string; activity_type: string; started_at: string; ended_at: string | null;
      entity_type: string | null; entity_id: string | null; note: string | null;
    }>(
      `UPDATE activity_entries
       SET started_at = COALESCE($1::timestamptz, started_at),
           ended_at   = COALESCE($2::timestamptz, ended_at)
       WHERE id = $3 AND account_id = $4 AND ended_at IS NOT NULL AND voided_at IS NULL
       RETURNING id, activity_type, started_at::text, ended_at::text, entity_type, entity_id, note`,
      [adj.started_at ?? null, adj.ended_at ?? null, adj.id, ctx.accountId],
    );
    const next = updated.rows[0];
    if (!next) continue;
    await appendAuditLog(client, {
      account_id: ctx.accountId,
      entity_type: "activity_entry",
      entity_id: row.id,
      action: "update",
      actor_id: ctx.userId,
      trace_id: ctx.traceId,
      old_value: {
        activity_type: row.activity_type, started_at: row.started_at, ended_at: row.ended_at,
        entity_type: row.entity_type, entity_id: row.entity_id, note: row.note,
      },
      new_value: {
        activity_type: next.activity_type, started_at: next.started_at, ended_at: next.ended_at,
        entity_type: next.entity_type, entity_id: next.entity_id, note: next.note,
        reason: "rebalanced (trimmed by timeline correction)",
      },
    });
  }
}
