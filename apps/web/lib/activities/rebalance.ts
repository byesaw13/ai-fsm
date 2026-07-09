import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import {
  proposeRebalance,
  rebalanceHasDeletes,
  type RebalanceAdjustment,
  type TimelineEntry,
} from "./timeline";

export interface OverlapRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  activity_type?: string;
}

function time(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * True when every overlapping row is covered by an adjustment that removes the
 * overlap (trim, close open activity, or delete).
 */
export function rebalanceCoversOverlaps(
  overlaps: OverlapRow[],
  adjustments: RebalanceAdjustment[] | undefined,
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
    // Prefer adjustment end (needed to close open activities).
    const endIso = adj.ended_at ?? overlap.ended_at;
    const end = endIso != null ? time(endIso) : Number.POSITIVE_INFINITY;
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
 * Apply neighbour rebalancing inside an open transaction.
 * Supports closing open activities (set ended_at) and shifting their start.
 * Deletes only apply to completed rows.
 */
export async function applyRebalance(
  client: PoolClient,
  ctx: RebalanceContext,
  adjustments: RebalanceAdjustment[] | undefined,
): Promise<void> {
  for (const adj of adjustments ?? []) {
    if (ctx.skipId != null && adj.id === ctx.skipId) continue;

    if (adj.delete) {
      const existing = await client.query<{
        id: string;
        activity_type: string;
        started_at: string;
        ended_at: string | null;
        entity_type: string | null;
        entity_id: string | null;
        note: string | null;
      }>(
        `DELETE FROM activity_entries
         WHERE id = $1 AND account_id = $2 AND ended_at IS NOT NULL AND voided_at IS NULL
         RETURNING id, activity_type, started_at::text, ended_at::text, entity_type, entity_id, note`,
        [adj.id, ctx.accountId],
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
          activity_type: row.activity_type,
          started_at: row.started_at,
          ended_at: row.ended_at,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          note: row.note,
        },
        new_value: { reason: "rebalanced (engulfed by timeline correction)" },
      });
      continue;
    }

    // Include open rows so we can stop the clock (set ended_at).
    const existing = await client.query<{
      id: string;
      user_id: string;
      activity_type: string;
      category: string;
      started_at: string;
      ended_at: string | null;
      entity_type: string | null;
      entity_id: string | null;
      note: string | null;
      source: string;
      assignment_kind: string | null;
      labor_bucket: string | null;
    }>(
      `SELECT id, user_id, activity_type, category, started_at::text, ended_at::text,
              entity_type, entity_id, note, source, assignment_kind, labor_bucket
         FROM activity_entries
        WHERE id = $1 AND account_id = $2 AND voided_at IS NULL
        FOR UPDATE`,
      [adj.id, ctx.accountId],
    );
    const row = existing.rows[0];
    if (!row) continue;

    const updated = await client.query<{
      id: string;
      activity_type: string;
      started_at: string;
      ended_at: string | null;
      entity_type: string | null;
      entity_id: string | null;
      note: string | null;
    }>(
      `UPDATE activity_entries
       SET started_at = COALESCE($1::timestamptz, started_at),
           ended_at   = COALESCE($2::timestamptz, ended_at)
       WHERE id = $3 AND account_id = $4 AND voided_at IS NULL
       RETURNING id, activity_type, started_at::text, ended_at::text, entity_type, entity_id, note`,
      [adj.started_at ?? null, adj.ended_at ?? null, adj.id, ctx.accountId],
    );
    const next = updated.rows[0];
    if (!next) continue;

    const wasOpen = row.ended_at == null;
    const nowClosed = wasOpen && next.ended_at != null;
    await appendAuditLog(client, {
      account_id: ctx.accountId,
      entity_type: "activity_entry",
      entity_id: row.id,
      action: "update",
      actor_id: ctx.userId,
      trace_id: ctx.traceId,
      old_value: {
        activity_type: row.activity_type,
        started_at: row.started_at,
        ended_at: row.ended_at,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        note: row.note,
      },
      new_value: {
        activity_type: next.activity_type,
        started_at: next.started_at,
        ended_at: next.ended_at,
        entity_type: next.entity_type,
        entity_id: next.entity_id,
        note: next.note,
        reason: nowClosed
          ? "rebalanced (stopped open activity for timeline correction)"
          : "rebalanced (trimmed by timeline correction)",
        preserve_tail: adj.preserve_tail ?? null,
      },
    });

    // Re-insert the trailing portion after a spanning trim so soft auto-rebalance
    // does not drop post-change minutes (e.g. 13:00–14:00 after inserting 12–13).
    if (adj.preserve_tail) {
      const tail = adj.preserve_tail;
      if (new Date(tail.ended_at) > new Date(tail.started_at)) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO activity_entries
             (account_id, user_id, session_date, activity_type, category,
              started_at, ended_at, entity_type, entity_id, source, note,
              assignment_kind, labor_bucket)
           VALUES (
             $1, $2, ($3::timestamptz)::date, $4, $5,
             $3::timestamptz, $6::timestamptz, $7, $8, $9, $10,
             $11, $12
           )
           RETURNING id`,
          [
            ctx.accountId,
            row.user_id,
            tail.started_at,
            row.activity_type,
            row.category,
            tail.ended_at,
            row.entity_type,
            row.entity_id,
            row.source,
            row.note,
            row.assignment_kind,
            row.labor_bucket,
          ],
        );
        await appendAuditLog(client, {
          account_id: ctx.accountId,
          entity_type: "activity_entry",
          entity_id: ins.rows[0].id,
          action: "insert",
          actor_id: ctx.userId,
          trace_id: ctx.traceId,
          old_value: null,
          new_value: {
            activity_type: row.activity_type,
            started_at: tail.started_at,
            ended_at: tail.ended_at,
            split_from: row.id,
            reason: "rebalanced (preserved tail after spanning trim)",
          },
        });
      }
    }
  }
}

export type ResolveOverlapResult =
  | { ok: true; rebalance: RebalanceAdjustment[] }
  | {
      ok: false;
      status: 409;
      code: "CONFLICT";
      message: string;
      proposed_rebalance: RebalanceAdjustment[];
      overlaps: OverlapRow[];
      requires_delete_confirm: boolean;
    };

/**
 * Server-owned overlap resolution for a change window.
 * - Soft adjustments (trim / close open): auto-apply when client sent nothing
 *   usable, or accept client payload that covers all overlaps.
 * - Deletes: require client to send a covering rebalance (UI confirms first).
 */
export function resolveOverlapRebalance(opts: {
  overlaps: OverlapRow[];
  entriesForProposal: TimelineEntry[];
  change: { id?: string; started_at: string; ended_at: string };
  clientRebalance: RebalanceAdjustment[] | undefined;
}): ResolveOverlapResult {
  const { overlaps, entriesForProposal, change, clientRebalance } = opts;
  const proposed = proposeRebalance(entriesForProposal, change);

  if (overlaps.length === 0) {
    // No overlap: only empty rebalance is valid (reject stale delete payloads).
    if (clientRebalance?.length) {
      return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message: "No overlapping activity to rebalance.",
        proposed_rebalance: [],
        overlaps: [],
        requires_delete_confirm: false,
      };
    }
    return { ok: true, rebalance: [] };
  }

  if (rebalanceCoversOverlaps(overlaps, clientRebalance, change)) {
    return { ok: true, rebalance: clientRebalance ?? [] };
  }

  // Soft server proposal: no deletes — stop clock + trims only.
  if (proposed.length > 0 && !rebalanceHasDeletes(proposed) && rebalanceCoversOverlaps(overlaps, proposed, change)) {
    return { ok: true, rebalance: proposed };
  }

  // Client must accept (deletes or any proposal that needs explicit confirm).
  return {
    ok: false,
    status: 409,
    code: "CONFLICT",
    message: rebalanceHasDeletes(proposed)
      ? "This time range fully covers existing activity. Confirm to archive overlapping blocks and continue."
      : "This time range overlaps activity already logged. Accept the suggested adjustments or edit the timeline.",
    proposed_rebalance: proposed,
    overlaps,
    requires_delete_confirm: rebalanceHasDeletes(proposed),
  };
}

/** Load day-scoped entries for proposeRebalance (account ledger). */
export async function loadTimelineEntriesForRebalance(
  client: PoolClient,
  accountId: string,
  changeStartIso: string,
  changeEndIso: string,
): Promise<TimelineEntry[]> {
  // Pull anything that could overlap the window, plus a bit of padding so
  // proposal matches assertNoOverlap (open rows have infinite end).
  const { rows } = await client.query<TimelineEntry>(
    `SELECT id, activity_type, started_at::text, ended_at::text
       FROM activity_entries
      WHERE account_id = $1
        AND voided_at IS NULL
        AND started_at < $3::timestamptz
        AND COALESCE(ended_at, 'infinity'::timestamptz) > $2::timestamptz
      ORDER BY started_at ASC`,
    [accountId, changeStartIso, changeEndIso],
  );
  return rows;
}
