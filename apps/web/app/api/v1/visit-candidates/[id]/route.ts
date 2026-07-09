import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { canViewReports } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import {
  applyRebalance,
  resolveOverlapRebalance,
  type OverlapRow,
} from "@/lib/activities/rebalance";
import type { RebalanceAdjustment } from "@/lib/activities/timeline";
import {
  VISIT_CLASSIFICATIONS,
  CLASSIFICATION_TO_ACTIVITY,
  activityCategoryFor,
  type VisitClassification,
} from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// EPIC-007: review a detected visit.
//   confirm → write an activity_entries ledger row (source auto_detected_location)
//             and, if the property has no coords yet, learn them from the stop.
//   ignore  → mark ignored; nothing reaches the ledger.

function idFromPath(request: NextRequest): string | undefined {
  return request.nextUrl.pathname.split("/").at(-1);
}

function err(code: string, message: string, status: number, traceId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, traceId, ...(extra ?? {}) } }, { status });
}

const rebalanceSchema = z.array(z.object({
  id: z.string().uuid(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  delete: z.boolean().optional(),
  preserve_tail: z.object({
    started_at: z.string().datetime(),
    ended_at: z.string().datetime(),
  }).optional(),
})).optional();

const bodySchema = z.object({
  action: z.enum(["confirm", "ignore"]),
  classification: z.enum(VISIT_CLASSIFICATIONS).optional(),
  note: z.string().max(500).nullish(),
  rebalance: rebalanceSchema,
});

type CandidateRow = {
  id: string;
  status: string;
  location_segment_id: string;
  property_id: string | null;
  matched_client_id: string | null;
  job_id: string | null;
  visit_id: string | null;
  arrival_time: string;
  departure_time: string;
};

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  // Owner/admin only — these are account-wide records (matches the list GET).
  if (!canViewReports(session.role)) {
    return err("FORBIDDEN", "Not permitted", 403, session.traceId);
  }
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Candidate not found", 404, session.traceId);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid request", 400, session.traceId, {
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  // Confirm needs a classification; "ignore" the classification can be the body action.
  const classification: VisitClassification | null =
    d.action === "ignore" ? "ignore" : (d.classification ?? null);
  if (d.action === "confirm" && (!classification || classification === "ignore")) {
    return err("VALIDATION_ERROR", "A classification is required to confirm", 400, session.traceId);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const { rows } = await client.query<CandidateRow>(
      `SELECT id, status, location_segment_id, property_id, matched_client_id,
              job_id, visit_id, arrival_time::text, departure_time::text
       FROM visit_candidates
       WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [id, session.accountId],
    );
    const cand = rows[0];
    if (!cand) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Candidate not found", 404, session.traceId);
    }
    if (cand.status !== "pending") {
      await client.query("ROLLBACK");
      return NextResponse.json({ data: { id, status: cand.status, already: true } });
    }

    if (d.action === "ignore") {
      await client.query(
        `UPDATE visit_candidates SET status = 'ignored', classification = 'ignore', updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [id, session.accountId],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { id, status: "ignored" } });
    }

    // confirm — refuse to double-count time already in the ledger.
    const { rows: overlap } = await client.query<OverlapRow & { activity_type: string }>(
      `SELECT id, activity_type, started_at::text, ended_at::text FROM activity_entries
       WHERE account_id = $1 AND voided_at IS NULL
         AND started_at < $3 AND COALESCE(ended_at, 'infinity'::timestamptz) > $2
       FOR UPDATE`,
      [session.accountId, cand.arrival_time, cand.departure_time],
    );
    const resolved = resolveOverlapRebalance({
      overlaps: overlap,
      entriesForProposal: overlap.map((r) => ({
        id: r.id,
        activity_type: r.activity_type,
        started_at: r.started_at,
        ended_at: r.ended_at,
      })),
      change: { started_at: cand.arrival_time, ended_at: cand.departure_time },
      clientRebalance: d.rebalance as RebalanceAdjustment[] | undefined,
    });
    if (!resolved.ok) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: resolved.code,
            message: resolved.message,
            proposed_rebalance: resolved.proposed_rebalance,
            overlaps: resolved.overlaps,
            requires_delete_confirm: resolved.requires_delete_confirm,
            traceId: session.traceId,
          },
        },
        { status: 409 },
      );
    }

    const activityType = CLASSIFICATION_TO_ACTIVITY[classification as Exclude<VisitClassification, "ignore">];
    const category = activityCategoryFor(activityType);
    // Link to the strongest available entity (property isn't a ledger entity type).
    const [entityType, entityId] = cand.job_id
      ? ["job", cand.job_id]
      : cand.visit_id
        ? ["visit", cand.visit_id]
        : cand.matched_client_id
          ? ["client", cand.matched_client_id]
          : [null, null];

    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, 'auto_visit', $10)
       RETURNING id`,

      [
        session.accountId, session.userId, cand.arrival_time, activityType, category,
        cand.arrival_time, cand.departure_time, entityType, entityId, d.note ?? null,
      ],
    );
    const entryId = ins[0].id;

    await applyRebalance(
      client,
      { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
      resolved.rebalance,
    );

    await client.query(
      `UPDATE visit_candidates
       SET status = 'confirmed', classification = $1, activity_entry_id = $2, updated_at = now()
       WHERE id = $3 AND account_id = $4`,
      [classification, entryId, id, session.accountId],
    );

    // Learn-on-confirm: bootstrap the property's geofence center from this stop's
    // coordinates if it doesn't have any yet. Future visits then get distance
    // scoring automatically.
    if (cand.property_id) {
      await client.query(
        `UPDATE properties p
         SET latitude = s.latitude, longitude = s.longitude,
             coordinate_source = 'confirmed_visit', coordinate_confidence = 'confirmed',
             coordinate_updated_at = now(), updated_at = now()
         FROM location_segments s
         WHERE p.id = $1 AND p.account_id = $2 AND p.latitude IS NULL
           AND s.id = $3 AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL`,
        [cand.property_id, session.accountId, cand.location_segment_id],
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { id, status: "confirmed", activity_entry_id: entryId } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/v1/visit-candidates/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to update candidate", 500, session.traceId);
  } finally {
    client.release();
  }
});
