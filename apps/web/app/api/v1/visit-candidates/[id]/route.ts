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
  resolveWorkOrderForProperty,
  type VisitClassification,
} from "@ai-fsm/domain";
import {
  entityLinkFromCandidate,
  ensureFieldDayVisit,
  learnPropertyCoordsFromSegment,
  markVisitCandidateConfirmed,
} from "@/lib/field/confirm-visit";
import { listOpenWorkOrdersAtProperty } from "@/lib/field/open-work-orders";

export const dynamic = "force-dynamic";

// EPIC-007 + Arrival Assignment Protocol: review a detected visit.
//   confirm → activity_entries (source auto_visit) on work_order when known,
//             ensure calendar field-day visit, learn property coords.
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
  work_order_id: z.string().uuid().nullish(),
  visit_id: z.string().uuid().nullish(),
  rebalance: rebalanceSchema,
  /** End any open activity before writing (one-open invariant). */
  switch_activity: z.boolean().optional(),
});

type CandidateRow = {
  id: string;
  status: string;
  location_segment_id: string | null;
  property_id: string | null;
  matched_client_id: string | null;
  job_id: string | null;
  visit_id: string | null;
  work_order_id: string | null;
  wo_resolution: string;
  arrival_time: string;
  departure_time: string | null;
};

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
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
              job_id, visit_id, work_order_id, wo_resolution,
              arrival_time::text, departure_time::text
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

    const fieldClass = classification as Exclude<VisitClassification, "ignore">;
    const activityType = CLASSIFICATION_TO_ACTIVITY[fieldClass];
    const category = activityCategoryFor(activityType);

    // Resolve work order (product: multi-WO always needs explicit choice).
    let workOrderId = d.work_order_id ?? cand.work_order_id ?? null;
    if (cand.property_id) {
      const openWos = await listOpenWorkOrdersAtProperty(
        client,
        session.accountId,
        cand.property_id,
        cand.arrival_time,
      );
      const resolution = resolveWorkOrderForProperty({
        openWorkOrders: openWos,
        overrideWorkOrderId: d.work_order_id ?? workOrderId,
      });
      if (resolution.status === "ambiguous") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "ambiguous_work_order",
              message: "Choose a work order",
              options: resolution.options,
              traceId: session.traceId,
            },
          },
          { status: 409 },
        );
      }
      if (resolution.status === "clear") {
        workOrderId = resolution.workOrderId;
        if (!d.visit_id && resolution.visitId) {
          // use resolved visit when candidate lacks one
          cand.visit_id = cand.visit_id ?? resolution.visitId;
        }
      }
    }

    const departureTime = cand.departure_time;

    // Switch open activity if requested (one open activity per account).
    const { rows: openActs } = await client.query<{ id: string }>(
      `SELECT id FROM activity_entries
       WHERE account_id = $1 AND voided_at IS NULL AND ended_at IS NULL
       FOR UPDATE`,
      [session.accountId],
    );
    if (openActs[0] && d.switch_activity) {
      await client.query(
        `UPDATE activity_entries
         SET ended_at = $1::timestamptz, updated_at = now()
         WHERE id = $2 AND account_id = $3 AND ended_at IS NULL`,
        [cand.arrival_time, openActs[0].id, session.accountId],
      );
    } else if (openActs[0] && !departureTime) {
      // Opening a new open activity while one is running without switch.
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "activity_open",
            message: "An activity is already open; confirm with switch_activity to replace it",
            open_activity_id: openActs[0].id,
            traceId: session.traceId,
          },
        },
        { status: 409 },
      );
    }

    // Overlap guard for closed windows (open-ended uses infinity).
    const { rows: overlap } = await client.query<OverlapRow & { activity_type: string }>(
      `SELECT id, activity_type, started_at::text, ended_at::text FROM activity_entries
       WHERE account_id = $1 AND voided_at IS NULL
         AND started_at < $3::timestamptz
         AND COALESCE(ended_at, 'infinity'::timestamptz) > $2::timestamptz
       FOR UPDATE`,
      [
        session.accountId,
        cand.arrival_time,
        departureTime ?? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      ],
    );
    // Filter out the activity we just closed via switch (if any).
    const overlapFiltered = openActs[0] && d.switch_activity
      ? overlap.filter((r) => r.id !== openActs[0].id)
      : overlap;

    const changeEnd = departureTime ?? new Date().toISOString();
    const resolved = resolveOverlapRebalance({
      overlaps: overlapFiltered,
      entriesForProposal: overlapFiltered.map((r) => ({
        id: r.id,
        activity_type: r.activity_type,
        started_at: r.started_at,
        ended_at: r.ended_at,
      })),
      change: { started_at: cand.arrival_time, ended_at: changeEnd },
      clientRebalance: d.rebalance as RebalanceAdjustment[] | undefined,
    });
    if (!resolved.ok) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "activity_overlap",
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

    const visitOverride = d.visit_id ?? cand.visit_id;
    // Multi-day T&M: ensure a calendar field day. Still-on-site uses arrival as
    // departure so duration stays 0 (presence/arrived only, no auto-complete).
    const departureForFieldDay = departureTime ?? cand.arrival_time;

    const fieldDay = await ensureFieldDayVisit(client, {
      accountId: session.accountId,
      userId: session.userId,
      jobId: cand.job_id,
      visitId: visitOverride,
      classification: fieldClass,
      arrivalTime: cand.arrival_time,
      departureTime: departureForFieldDay,
      workOrderId,
    });

    if (fieldDay.reason === "ambiguous_work_order") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "ambiguous_work_order",
            message: "Choose a work order",
            traceId: session.traceId,
          },
        },
        { status: 409 },
      );
    }

    const resolvedVisitId = fieldDay.visitId ?? visitOverride;

    const [entityType, entityId] = entityLinkFromCandidate({
      work_order_id: workOrderId,
      visit_id: resolvedVisitId,
      job_id: cand.job_id,
      matched_client_id: cand.matched_client_id,
    });

    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, 'auto_visit', $10)
       RETURNING id`,
      [
        session.accountId,
        session.userId,
        cand.arrival_time,
        activityType,
        category,
        cand.arrival_time,
        departureTime, // null when still on site
        entityType,
        entityId,
        d.note ?? null,
      ],
    );
    const entryId = ins[0].id;

    await applyRebalance(
      client,
      { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
      resolved.rebalance,
    );

    await markVisitCandidateConfirmed(
      client,
      id,
      session.accountId,
      fieldClass,
      entryId,
      resolvedVisitId,
      workOrderId,
      cand.job_id,
    );

    if (cand.location_segment_id) {
      await client.query(
        `UPDATE location_segments
         SET status = 'confirmed', activity_entry_id = $1,
             suggested_activity_type = $2, updated_at = now()
         WHERE id = $3 AND account_id = $4 AND status = 'provisional'`,
        [entryId, activityType, cand.location_segment_id, session.accountId],
      );
    }

    if (cand.property_id && cand.location_segment_id) {
      await learnPropertyCoordsFromSegment(
        client,
        cand.property_id,
        session.accountId,
        cand.location_segment_id,
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      data: {
        id,
        status: "confirmed",
        activity_entry_id: entryId,
        visit_id: resolvedVisitId,
        work_order_id: workOrderId,
        field_day_created: fieldDay.created,
        field_day_reason: fieldDay.reason,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/v1/visit-candidates/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to update candidate", 500, session.traceId);
  } finally {
    client.release();
  }
});
