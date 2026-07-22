import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { activityCategoryFor, type ActivityType } from "@ai-fsm/domain";
import { ensureFieldDayVisit } from "@/lib/field/confirm-visit";
import { mirrorTasksToCompletionCriteria } from "@/lib/work-orders/task-time";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const taskEntry = z.object({
  task_id: z.string().uuid().nullable(),
  label: z.string().max(300),
  minutes: z.number().int().min(0).max(24 * 60),
  status: z.enum(["done", "partial", "blocked"]),
  note: z.string().max(1000).default(""),
});
const otherEntry = z.object({
  activity_type: z.enum(["material_run", "travel", "admin"]),
  minutes: z.number().int().min(1).max(24 * 60),
  note: z.string().max(1000).default(""),
});
const bodySchema = z.object({
  job_id: z.string().uuid(),
  /** When set, tasks must belong to this work order (my-work assignment scope). */
  work_order_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  task_entries: z.array(taskEntry),
  other_entries: z.array(otherEntry),
});

/**
 * POST /api/v1/field/daily-recap/commit — write a REVIEWED recap draft to the
 * ledger: per-task time (activity_entries.task_id) plus non-task buckets, and
 * toggle task done/blocked. Transactional. This is the only path that writes
 * the recap — the AI output is never auto-committed.
 *
 * Field-day spine: when possible, ensure a completed standard visit for the
 * local day under each work order that received task time, and hang job_work
 * rows on that visit (keep task_id). Falls back to entity_type=work_order when
 * a visit cannot be resolved (ambiguous multi-WO, cancelled job, etc.).
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid recap", details: parsed.error.flatten(), traceId: session.traceId } },
      { status: 400 },
    );
  }
  const { job_id, work_order_id, date, task_entries, other_entries } = parsed.data;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );

    // Job must exist in this account before any job-level activity inserts.
    const jobCheck = await client.query<{ id: string }>(
      `SELECT id FROM jobs WHERE id = $1 AND account_id = $2`,
      [job_id, session.accountId],
    );
    if (jobCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Project not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    // Optional work-order scope: must belong to this job (+ assigned lead for tech).
    if (work_order_id) {
      const woCheck = await client.query<{ id: string }>(
        `SELECT id FROM work_orders
          WHERE id = $1 AND account_id = $2 AND job_id = $3
            AND (
              $4::text IN ('owner','admin')
              OR assigned_user_id = $5
            )`,
        [work_order_id, session.accountId, job_id, session.role, session.userId],
      );
      if (woCheck.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Work order not found or not assigned to you",
              traceId: session.traceId,
            },
          },
          { status: 403 },
        );
      }
    }

    // Resolve task_id → work_order_id, scoped to this job (+ optional WO).
    const taskIds = task_entries.map((t) => t.task_id).filter((x): x is string => !!x);
    const woByTask = new Map<string, string>();
    if (taskIds.length) {
      const { rows } = await client.query<{ id: string; work_order_id: string }>(
        work_order_id
          ? `SELECT t.id, t.work_order_id
               FROM work_order_tasks t JOIN work_orders wo ON wo.id = t.work_order_id
              WHERE t.account_id = $1 AND wo.job_id = $2 AND wo.id = $3 AND t.id = ANY($4::uuid[])
                AND (
                  $5::text IN ('owner','admin')
                  OR wo.assigned_user_id = $6
                )`
          : `SELECT t.id, t.work_order_id
               FROM work_order_tasks t JOIN work_orders wo ON wo.id = t.work_order_id
              WHERE t.account_id = $1 AND wo.job_id = $2 AND t.id = ANY($3::uuid[])
                AND (
                  $4::text IN ('owner','admin')
                  OR wo.assigned_user_id = $5
                )`,
        work_order_id
          ? [session.accountId, job_id, work_order_id, taskIds, session.role, session.userId]
          : [session.accountId, job_id, taskIds, session.role, session.userId],
      );
      for (const r of rows) woByTask.set(r.id, r.work_order_id);
    }

    // Optional business day for the operator on this local date.
    const bd = await client.query<{ id: string }>(
      `SELECT id FROM business_days
        WHERE account_id = $1 AND user_id = $2 AND business_date = $3::date
        LIMIT 1`,
      [session.accountId, session.userId, date],
    );
    const businessDayId = bd.rows[0]?.id ?? null;

    // Minutes per work order (for field-day window + ensureFieldDayVisit gate).
    const minutesByWo = new Map<string, number>();
    for (const t of task_entries) {
      if (!t.task_id || t.minutes <= 0) continue;
      const woId = woByTask.get(t.task_id);
      if (!woId) continue;
      minutesByWo.set(woId, (minutesByWo.get(woId) ?? 0) + t.minutes);
    }
    // When scoped to a WO with only unplanned/other time, still try that WO's day.
    if (work_order_id && !minutesByWo.has(work_order_id)) {
      const totalOther =
        other_entries.reduce((s, o) => s + o.minutes, 0) +
        task_entries.filter((t) => !t.task_id).reduce((s, t) => s + t.minutes, 0);
      if (totalOther > 0) minutesByWo.set(work_order_id, totalOther);
    }

    // Midday UTC anchor on the business date; durations are what baselines use.
    const dayAnchorMs = new Date(`${date}T13:00:00.000Z`).getTime();
    const visitIdByWo = new Map<string, string>();

    for (const [woId, minutes] of minutesByWo) {
      const windowMin = Math.max(minutes, 15);
      const arrival = new Date(dayAnchorMs).toISOString();
      const departure = new Date(dayAnchorMs + windowMin * 60_000).toISOString();
      const fieldDay = await ensureFieldDayVisit(client, {
        accountId: session.accountId,
        userId: session.userId,
        jobId: job_id,
        visitId: null,
        classification: "job_work",
        arrivalTime: arrival,
        departureTime: departure,
        workOrderId: woId,
        techNotes: "Auto-created from Daily Recap",
      });
      if (fieldDay.visitId) visitIdByWo.set(woId, fieldDay.visitId);
    }

    // Prefer a single visit for job-level (unplanned/other) rows when one WO day exists.
    const primaryVisitId =
      (work_order_id && visitIdByWo.get(work_order_id)) ||
      (visitIdByWo.size === 1 ? [...visitIdByWo.values()][0] : null);

    let cursorMs = dayAnchorMs;
    const nextRange = (minutes: number) => {
      const started = new Date(cursorMs).toISOString();
      cursorMs += minutes * 60_000;
      return { started, ended: new Date(cursorMs).toISOString() };
    };

    const insertActivity = async (
      activityType: string,
      minutes: number,
      entityType: string,
      entityId: string | null,
      taskId: string | null,
      note: string | null,
    ) => {
      if (minutes <= 0) return;
      const { started, ended } = nextRange(minutes);
      await client.query(
        `INSERT INTO activity_entries
           (account_id, user_id, session_date, activity_type, category,
            started_at, ended_at, entity_type, entity_id, task_id, source, note, business_day_id)
         VALUES ($1,$2,$3::date,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9,$10,'manual',$11,$12)`,
        [
          session.accountId,
          session.userId,
          date,
          activityType,
          activityCategoryFor(activityType as ActivityType),
          started,
          ended,
          entityType,
          entityId,
          taskId,
          note,
          businessDayId,
        ],
      );
    };

    let recorded = 0;
    for (const t of task_entries) {
      if (t.task_id) {
        const woId = woByTask.get(t.task_id);
        if (!woId) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: work_order_id
                  ? "A task does not belong to this work order"
                  : "A task does not belong to this job",
                traceId: session.traceId,
              },
            },
            { status: 400 },
          );
        }
        const visitId = visitIdByWo.get(woId);
        if (visitId) {
          await insertActivity("job_work", t.minutes, "visit", visitId, t.task_id, t.note || null);
        } else {
          // Fallback when field day cannot be created (multi-WO ambiguity, etc.).
          await insertActivity("job_work", t.minutes, "work_order", woId, t.task_id, t.note || null);
        }
        // "I did this" — toggle the task per its status.
        if (t.status === "done") {
          await client.query(
            `UPDATE work_order_tasks SET completed = true, completed_at = now(), status = 'done',
                    note = COALESCE(NULLIF($3,''), note), updated_at = now()
              WHERE id = $1 AND account_id = $2`,
            [t.task_id, session.accountId, t.note],
          );
        } else if (t.status === "blocked") {
          await client.query(
            `UPDATE work_order_tasks SET status = 'blocked', note = COALESCE(NULLIF($3,''), note), updated_at = now()
              WHERE id = $1 AND account_id = $2`,
            [t.task_id, session.accountId, t.note],
          );
        } else if (t.note) {
          await client.query(
            `UPDATE work_order_tasks SET note = $3, updated_at = now() WHERE id = $1 AND account_id = $2`,
            [t.task_id, session.accountId, t.note],
          );
        }
      } else {
        // Unplanned work not in the task list — prefer field-day visit, else job.
        const note = [t.label, t.note].filter(Boolean).join(" — ") || null;
        if (primaryVisitId) {
          await insertActivity("job_work", t.minutes, "visit", primaryVisitId, null, note);
        } else {
          await insertActivity("job_work", t.minutes, "job", job_id, null, note);
        }
      }
      recorded += t.minutes;
    }

    for (const o of other_entries) {
      if (primaryVisitId) {
        await insertActivity(o.activity_type, o.minutes, "visit", primaryVisitId, null, o.note || null);
      } else {
        await insertActivity(o.activity_type, o.minutes, "job", job_id, null, o.note || null);
      }
      recorded += o.minutes;
    }

    // Slice 1b: keep JSONB checklist in sync with task done/blocked from recap.
    for (const woId of new Set(woByTask.values())) {
      await mirrorTasksToCompletionCriteria(client, woId, session.accountId);
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { recorded_minutes: recorded } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/v1/field/daily-recap/commit error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not save the recap", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
