import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";
import { visitTransitions, visitStatusSchema } from "@ai-fsm/domain";
import type { VisitStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const transitionBody = z.object({
  status: visitStatusSchema,
  tech_notes: z.string().optional(),
});

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/visits\/([^/]+)\/transition/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = transitionBody.safeParse(body);

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

    const targetStatus = parsed.data.status as VisitStatus;
    const techNotes = parsed.data.tech_notes;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const visit = existing.rows[0];
      const currentStatus = visit.status as VisitStatus;
      const allowed = visitTransitions[currentStatus];

      if (!allowed.includes(targetStatus)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "INVALID_TRANSITION",
              message: `Cannot transition visit from '${currentStatus}' to '${targetStatus}'`,
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Precondition: a visit must have an assigned technician before it can be started.
      if (targetStatus === "arrived" && !visit.assigned_user_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "Visit must have an assigned technician before it can be started",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // -----------------------------------------------------------------------
      // "Start Job" — when tech taps arrived, we step through two valid DB
      // transitions in one transaction to satisfy the trigger:
      //   1. scheduled → arrived  (records arrived_at)
      //   2. arrived   → in_progress
      // The visit is never visible in 'arrived' state outside this tx.
      // -----------------------------------------------------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let updated: any;
      let effectiveStatus: VisitStatus;

      if (targetStatus === "arrived") {
        // Step 1: scheduled → arrived (DB trigger allows this)
        await client.query(
          `UPDATE visits SET status = 'arrived', arrived_at = now(), updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [id, session.accountId]
        );
        // Step 2: arrived → in_progress (DB trigger allows this)
        const noteClause2 = techNotes !== undefined ? `, tech_notes = $3` : "";
        const params2: unknown[] = [id, session.accountId];
        if (techNotes !== undefined) params2.push(techNotes);
        const { rows: rows2 } = await client.query(
          `UPDATE visits SET status = 'in_progress', updated_at = now()${noteClause2}
           WHERE id = $1 AND account_id = $2
           RETURNING *`,
          params2
        );
        updated = rows2[0];
        effectiveStatus = "in_progress";
      } else {
        const completedClause = targetStatus === "completed" ? ", completed_at = now()" : "";
        const noteClause = techNotes !== undefined ? `, tech_notes = $4` : "";
        const params: unknown[] = [targetStatus, id, session.accountId];
        if (techNotes !== undefined) params.push(techNotes);
        const { rows } = await client.query(
          `UPDATE visits
           SET status = $1, updated_at = now()${completedClause}${noteClause}
           WHERE id = $2 AND account_id = $3
           RETURNING *`,
          params
        );
        updated = rows[0];
        effectiveStatus = targetStatus;
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: { status: effectiveStatus },
      });

      // -----------------------------------------------------------------------
      // Job auto-advancement:
      //
      // • When a visit starts (arrived → in_progress), advance the parent job
      //   from 'scheduled' to 'in_progress' so the job reflects active work.
      //
      // • When a visit completes, auto-advance the parent job to 'completed'
      //   if every sibling visit is now completed or cancelled. This puts the
      //   job in the "ready to invoice" queue for the admin.
      // -----------------------------------------------------------------------
      if (updated.job_id) {
        const jobRow = await client.query(
          `SELECT id, status FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
          [updated.job_id, session.accountId]
        );
        const job = jobRow.rows[0];

        if (job) {
          if (effectiveStatus === "in_progress" && job.status === "scheduled") {
            // Visit started — advance job from scheduled → in_progress
            await client.query(
              `UPDATE jobs SET status = 'in_progress', updated_at = now()
               WHERE id = $1 AND account_id = $2`,
              [updated.job_id, session.accountId]
            );
            await appendAuditLog(client, {
              account_id: session.accountId,
              entity_type: "job",
              entity_id: updated.job_id,
              action: "update",
              actor_id: session.userId,
              trace_id: session.traceId,
              old_value: { status: "scheduled" },
              new_value: { status: "in_progress" },
            });
          } else if (
            effectiveStatus === "completed" &&
            (job.status === "in_progress" || job.status === "scheduled")
          ) {
            // Visit completed — check if all sibling visits are done
            const pendingVisits = await client.query(
              `SELECT COUNT(*) FROM visits
               WHERE job_id = $1 AND account_id = $2
                 AND status NOT IN ('completed', 'cancelled')`,
              [updated.job_id, session.accountId]
            );

            if (parseInt(pendingVisits.rows[0].count) === 0) {
              await client.query(
                `UPDATE jobs SET status = 'completed', updated_at = now()
                 WHERE id = $1 AND account_id = $2`,
                [updated.job_id, session.accountId]
              );
              await appendAuditLog(client, {
                account_id: session.accountId,
                entity_type: "job",
                entity_id: updated.job_id,
                action: "update",
                actor_id: session.userId,
                trace_id: session.traceId,
                old_value: { status: job.status },
                new_value: { status: "completed" },
              });
            }
          }
        }
      }

      await client.query("COMMIT");
      return NextResponse.json({ data: updated });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits transition POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to transition visit",
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
