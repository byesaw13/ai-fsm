import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkSchedulingPreconditions,
  EXECUTION_VISIT_TYPES,
  FIELD_ACTIVE_VISIT_STATUSES,
  VISIT_TYPES,
} from "@ai-fsm/domain";
import type { VisitType } from "@ai-fsm/domain";
import { syncWorkOrderLeadFromVisit } from "../../../../../../lib/work-orders/assign-lead";
import {
  resolveWorkOrderForVisit,
  syncWorkOrderStatus,
} from "../../../../../../lib/work-orders/sync-status";
import { withAuth, withRole } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const createVisitBody = z.object({
  assigned_user_id: z.string().uuid().optional(),
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  tech_notes: z.string().optional(),
  booking_request_id: z.string().uuid().optional(),
  work_order_id: z.string().uuid().optional(),
  visit_type: z.enum([...VISIT_TYPES] as [VisitType, ...VisitType[]]).default("standard"),
});

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    // Extract [id] from URL — HOF wrappers don't forward route params
    const jobId = request.url.match(/\/jobs\/([^/]+)\/visits/)?.[1];

    if (!jobId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // RLS automatically scopes tech to assigned visits — no extra filter needed
    const visits = await query(
      `SELECT * FROM visits WHERE job_id = $1 AND account_id = $2 ORDER BY scheduled_start ASC LIMIT $3 OFFSET $4`,
      [jobId, session.accountId, limit, offset]
    );

    return NextResponse.json({ data: visits, limit, offset });
  }
);

export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const jobId = request.url.match(/\/jobs\/([^/]+)\/visits/)?.[1];

    if (!jobId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createVisitBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const {
      assigned_user_id,
      scheduled_start,
      scheduled_end,
      tech_notes,
      booking_request_id,
      work_order_id,
      visit_type,
    } = parsed.data;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const { rows: jobRows } = await client.query<{ status: string }>(
        `SELECT status FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [jobId, session.accountId]
      );
      // Only field-active visits block booking — future `scheduled` days must coexist (multi-day).
      const { rows: fieldActiveRows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM visits
         WHERE job_id = $1 AND account_id = $2
           AND status = ANY($3::text[])`,
        [jobId, session.accountId, [...FIELD_ACTIVE_VISIT_STATUSES]],
      );
      const { rows: overlapRows } = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM visits
         WHERE job_id = $1 AND account_id = $2
           AND status NOT IN ('cancelled','completed')
           AND scheduled_start < $4::timestamptz
           AND scheduled_end > $3::timestamptz`,
        [jobId, session.accountId, scheduled_start, scheduled_end],
      );
      const guard = checkSchedulingPreconditions({
        jobStatus: jobRows[0]?.status ?? null,
        fieldActiveVisitCount: parseInt(fieldActiveRows[0]?.count ?? "0", 10),
        overlappingVisitCount: parseInt(overlapRows[0]?.count ?? "0", 10),
      });

      if (!guard.ok) {
        await client.query("ROLLBACK");
        const message =
          guard.error === "ACTIVE_VISIT_EXISTS"
            ? "A visit is already in progress for this project. Finish or cancel it before scheduling another day."
            : guard.error === "VISIT_OVERLAP"
              ? "That time overlaps an existing visit on this project. Pick a different day or time."
              : guard.error === "JOB_NOT_SCHEDULABLE"
                ? "This project is not open for new visits."
                : guard.error;
        return NextResponse.json(
          { error: { code: guard.error, message, traceId: session.traceId } },
          { status: 422 },
        );
      }

      let resolvedWorkOrderId: string | null = null;
      if ((EXECUTION_VISIT_TYPES as readonly string[]).includes(visit_type)) {
        resolvedWorkOrderId = await resolveWorkOrderForVisit(
          client,
          jobId,
          session.accountId,
          work_order_id,
        );
        if (!resolvedWorkOrderId) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: {
                code: "PRECONDITION_FAILED",
                message: work_order_id
                  ? "Work order not found or not schedulable for this project"
                  : "Select a work order — this project has multiple active work orders",
                traceId: session.traceId,
              },
            },
            { status: 422 },
          );
        }
      }

      const { rows } = await client.query(
        `INSERT INTO visits (account_id, job_id, work_order_id, assigned_user_id, scheduled_start, scheduled_end, tech_notes, visit_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          session.accountId,
          jobId,
          resolvedWorkOrderId,
          assigned_user_id ?? null,
          scheduled_start,
          scheduled_end,
          tech_notes ?? null,
          visit_type,
        ]
      );

      const visit = rows[0];

      if (booking_request_id) {
        const bookingRequest = await client.query(
          `UPDATE booking_requests
           SET status = 'converted',
               reviewed_by = COALESCE(reviewed_by, $3),
               reviewed_at = COALESCE(reviewed_at, now()),
               job_id = COALESCE(job_id, $4),
               visit_id = COALESCE(visit_id, $5),
               updated_at = now()
           WHERE id = $1
             AND account_id = $2
             AND job_id = $4
             AND status IN ('pending', 'reviewed')
           RETURNING *`,
          [booking_request_id, session.accountId, session.userId, jobId, visit.id]
        );

        if (!bookingRequest.rows[0]) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: {
                code: "PRECONDITION_FAILED",
                message: "The booking request could not be converted for this visit.",
                traceId: session.traceId,
              },
            },
            { status: 422 }
          );
        }
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: visit.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: visit,
      });

      // Auto-advance job to 'scheduled' when a visit is created for it.
      // Keeps downstream auto-advances (visit started → in_progress, visit
      // completed → completed) reliable regardless of how the job was created.
      const jobStatus = jobRows[0]?.status;
      if (jobStatus === "draft" || jobStatus === "quoted") {
        await client.query(
          `UPDATE jobs SET status = 'scheduled', updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [jobId, session.accountId]
        );
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "job",
          entity_id: jobId,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: { status: jobStatus },
          new_value: { status: "scheduled" },
        });
      }

      if (resolvedWorkOrderId) {
        await syncWorkOrderLeadFromVisit(
          client,
          resolvedWorkOrderId,
          session.accountId,
          assigned_user_id ?? null,
        );
        await syncWorkOrderStatus(client, resolvedWorkOrderId, session.accountId);
      }

      await client.query("COMMIT");
      return NextResponse.json({ data: visit }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create visit",
            traceId: session.traceId,
          },
        },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
