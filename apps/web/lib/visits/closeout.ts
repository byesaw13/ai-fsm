import type { PoolClient } from "pg";
import {
  checkSchedulingPreconditions,
  FIELD_ACTIVE_VISIT_STATUSES,
  laborDescriptionFromVisitNotes,
  visitTransitions,
  type VisitCloseoutBody,
  type VisitStatus,
} from "@ai-fsm/domain";
import { checkCompletionPacket, isQuickJobPacketExempt } from "@/lib/completion-guard";
import { appendAuditLog } from "@/lib/db/audit";
import { createDraftFinalInvoiceForJob } from "@/lib/invoices/final-invoice";
import { buildNextScheduleDayPrefill } from "@/lib/jobs/next-schedule-day";
import { easternWallToUtc } from "@/lib/time/business-tz";
import { setVisitPlannedTasks } from "@/lib/work-orders/job-tasks";
import { syncWorkOrderStatus, syncWorkOrdersForJob } from "@/lib/work-orders/sync-status";
import { writeWorkflowEvent } from "@/lib/workflow-events";
import { seedConditionSnapshots } from "@/lib/visits/condition-seeding";
import { tagMileageForCompletedVisit } from "@/lib/mileage/tag-from-visit";
import { formatBusinessYmd } from "@/lib/time/business-tz";

export type CloseoutSession = {
  userId: string;
  accountId: string;
  role: string;
  traceId: string;
};

export type VisitCloseoutResult = {
  visit_id: string;
  job_id: string | null;
  job_status: string | null;
  closeout_kind: "done" | "return";
  next_visit_id: string | null;
  invoice_id: string | null;
  first_up_task_id: string | null;
};

export class CloseoutError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number = 422,
  ) {
    super(message);
    this.name = "CloseoutError";
  }
}

async function completeVisitRow(
  client: PoolClient,
  session: CloseoutSession,
  visitId: string,
  techNotes: string,
  closeoutKind: "done" | "return",
): Promise<{
  id: string;
  job_id: string | null;
  work_order_id: string | null;
  assigned_user_id: string | null;
  visit_type: string | null;
  status: string;
}> {
  const existing = await client.query<{
    id: string;
    status: VisitStatus;
    job_id: string | null;
    work_order_id: string | null;
    assigned_user_id: string | null;
    visit_type: string | null;
    generated_from_plan_id: string | null;
    membership_visit_phase: string | null;
    membership_snapshot_sent_at: string | null;
    has_estimate: boolean;
  }>(
    `SELECT v.id, v.status, v.job_id, v.work_order_id, v.assigned_user_id, v.visit_type,
            v.generated_from_plan_id, v.membership_visit_phase, v.membership_snapshot_sent_at,
            EXISTS(
              SELECT 1 FROM estimates e
              WHERE e.job_id = v.job_id AND e.account_id = v.account_id
            ) AS has_estimate
     FROM visits v
     WHERE v.id = $1 AND v.account_id = $2
     FOR UPDATE`,
    [visitId, session.accountId],
  );
  const visit = existing.rows[0];
  if (!visit) throw new CloseoutError("NOT_FOUND", "Visit not found", 404);
  if (
    session.role === "tech" &&
    visit.assigned_user_id &&
    visit.assigned_user_id !== session.userId
  ) {
    throw new CloseoutError("FORBIDDEN", "This visit is assigned to someone else", 403);
  }

  let current = visit.status;
  if (current === "arrived") {
    const allowed = visitTransitions.arrived;
    if (!allowed.includes("in_progress")) {
      throw new CloseoutError("INVALID_TRANSITION", `Cannot complete visit from '${current}'`);
    }
    await client.query(
      `UPDATE visits SET status = 'in_progress', updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId],
    );
    current = "in_progress";
  }

  if (!visitTransitions[current].includes("completed")) {
    throw new CloseoutError(
      "INVALID_TRANSITION",
      `Cannot complete visit from '${current}'`,
    );
  }

  if (visit.generated_from_plan_id && visit.membership_visit_phase !== "reporting") {
    throw new CloseoutError(
      "PRECONDITION_FAILED",
      "Complete the Reporting phase before marking this membership visit as done",
    );
  }
  if (visit.generated_from_plan_id && !visit.membership_snapshot_sent_at) {
    throw new CloseoutError(
      "PRECONDITION_FAILED",
      "Send or mark the visit summary as sent before completing this membership visit",
    );
  }

  const packetResult = await client.query(
    `SELECT photo_urls, signature_url, signature_waiver, photos_waived, photos_waiver_reason
     FROM completion_packets
     WHERE visit_id = $1 AND account_id = $2`,
    [visitId, session.accountId],
  );
  const exempt = isQuickJobPacketExempt({
    visit_type: visit.visit_type,
    work_order_id: visit.work_order_id,
    has_estimate: visit.has_estimate,
  });
  const guard = checkCompletionPacket(packetResult.rows[0] ?? null, {
    requirePhoto: !exempt,
    requireSignature: !exempt,
  });
  if (!guard.ok) {
    throw new CloseoutError(
      guard.error ?? "PRECONDITION_FAILED",
      guard.error === "MISSING_PHOTO"
        ? "At least one photo is required before completing this visit (or waive photos)"
        : "A signature or waiver is required before completing this visit",
    );
  }

  const { rows } = await client.query<{
    id: string;
    job_id: string | null;
    work_order_id: string | null;
    assigned_user_id: string | null;
    visit_type: string | null;
    status: string;
  }>(
    `UPDATE visits
     SET status = 'completed',
         completed_at = now(),
         tech_notes = $3,
         closeout_kind = $4,
         updated_at = now()
     WHERE id = $1 AND account_id = $2
     RETURNING id, job_id, work_order_id, assigned_user_id, visit_type, status`,
    [visitId, session.accountId, techNotes, closeoutKind],
  );
  const updated = rows[0];

  await client.query(
    `UPDATE activity_entries SET ended_at = now()
     WHERE account_id = $1 AND user_id = $2
       AND ended_at IS NULL AND voided_at IS NULL
       AND entity_type = 'visit' AND entity_id = $3`,
    [session.accountId, session.userId, visitId],
  );

  await appendAuditLog(client, {
    account_id: session.accountId,
    entity_type: "visit",
    entity_id: visitId,
    action: "update",
    actor_id: session.userId,
    trace_id: session.traceId,
    old_value: { status: visit.status },
    new_value: { status: "completed", closeout_kind: closeoutKind },
  });

  if (updated.job_id) {
    const jobRow = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [updated.job_id, session.accountId],
    );
    const job = jobRow.rows[0];
    const isExecution =
      visit.visit_type === "standard" || visit.visit_type === "punch_list";
    if (
      job &&
      isExecution &&
      (job.status === "scheduled" || job.status === "quoted")
    ) {
      await client.query(
        `UPDATE jobs SET status = 'in_progress', updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [updated.job_id, session.accountId],
      );
    }
    const jobProp = await client.query<{ property_id: string | null }>(
      `SELECT property_id FROM jobs WHERE id = $1 AND account_id = $2`,
      [updated.job_id, session.accountId],
    );
    const propertyId = jobProp.rows[0]?.property_id;
    if (propertyId) {
      await seedConditionSnapshots(client, visitId, propertyId, session.accountId);
    }
  }

  await writeWorkflowEvent(client, {
    accountId: session.accountId,
    eventType: "visit.completed",
    entityType: "visit",
    entityId: visitId,
    payload: { jobId: updated.job_id, closeoutKind },
  });

  return updated;
}

async function createFirstUpTask(
  client: PoolClient,
  opts: {
    accountId: string;
    workOrderId: string;
    label: string;
  },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO work_order_tasks
       (account_id, work_order_id, label, required, completed, status, sort_order, source, note)
     VALUES (
       $1, $2, $3, true, false, 'open',
       (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM work_order_tasks WHERE work_order_id = $2),
       'manual', 'Closeout first-up'
     )
     RETURNING id`,
    [opts.accountId, opts.workOrderId, opts.label.slice(0, 300)],
  );
  return rows[0].id;
}

async function scheduleReturnVisit(
  client: PoolClient,
  session: CloseoutSession,
  current: {
    id: string;
    job_id: string;
    work_order_id: string | null;
    assigned_user_id: string | null;
    scheduled_start: string;
    scheduled_end: string;
  },
  nextWhen: "tomorrow" | "date",
  nextDate: string | undefined,
  firstUpTaskId: string | null,
): Promise<string> {
  const prefill = buildNextScheduleDayPrefill([
    {
      scheduled_start: current.scheduled_start,
      scheduled_end: current.scheduled_end,
      assigned_user_id: current.assigned_user_id,
      work_order_id: current.work_order_id,
      visit_type: "standard",
      status: "completed",
    },
  ]);
  if (!prefill) {
    throw new CloseoutError("PRECONDITION_FAILED", "Could not schedule the next visit");
  }
  const date = nextWhen === "date" && nextDate ? nextDate : prefill.date;
  const start = easternWallToUtc(date, prefill.startTime);
  const end = new Date(start.getTime() + prefill.durationMinutes * 60_000);

  const jobRow = await client.query<{ status: string }>(
    `SELECT status FROM jobs WHERE id = $1 AND account_id = $2`,
    [current.job_id, session.accountId],
  );
  const fieldActive = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM visits
     WHERE job_id = $1 AND account_id = $2 AND status = ANY($3::text[])`,
    [current.job_id, session.accountId, [...FIELD_ACTIVE_VISIT_STATUSES]],
  );
  const overlap = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM visits
     WHERE job_id = $1 AND account_id = $2
       AND status NOT IN ('cancelled','completed')
       AND scheduled_start < $4::timestamptz
       AND scheduled_end > $3::timestamptz`,
    [current.job_id, session.accountId, start.toISOString(), end.toISOString()],
  );
  const guard = checkSchedulingPreconditions({
    jobStatus: jobRow.rows[0]?.status ?? null,
    fieldActiveVisitCount: parseInt(fieldActive.rows[0]?.count ?? "0", 10),
    overlappingVisitCount: parseInt(overlap.rows[0]?.count ?? "0", 10),
  });
  if (!guard.ok) {
    const message =
      guard.error === "VISIT_OVERLAP"
        ? "That time overlaps an existing visit on this project. Pick a different day."
        : guard.error === "ACTIVE_VISIT_EXISTS"
          ? "A visit is already in progress for this project."
          : "Could not schedule the next visit on this project.";
    throw new CloseoutError(guard.error ?? "PRECONDITION_FAILED", message);
  }

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO visits
       (account_id, job_id, work_order_id, assigned_user_id, scheduled_start, scheduled_end, visit_type, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'standard', 'scheduled')
     RETURNING id`,
    [
      session.accountId,
      current.job_id,
      current.work_order_id,
      current.assigned_user_id ?? session.userId,
      start.toISOString(),
      end.toISOString(),
    ],
  );
  const nextId = rows[0].id;
  if (firstUpTaskId && current.work_order_id) {
    await setVisitPlannedTasks(client, {
      accountId: session.accountId,
      visitId: nextId,
      jobId: current.job_id,
      workOrderId: current.work_order_id,
      taskIds: [firstUpTaskId],
    });
  }
  return nextId;
}

export async function runVisitCloseout(
  client: PoolClient,
  session: CloseoutSession,
  visitId: string,
  input: VisitCloseoutBody,
): Promise<VisitCloseoutResult> {
  const completed = await completeVisitRow(
    client,
    session,
    visitId,
    input.today_notes,
    input.kind,
  );

  let nextVisitId: string | null = null;
  let firstUpTaskId: string | null = null;
  let invoiceId: string | null = null;
  let jobStatus: string | null = null;

  if (completed.job_id) {
    const visitTimes = await client.query<{
      scheduled_start: string;
      scheduled_end: string;
      arrived_at: string | null;
      completed_at: string | null;
    }>(
      `SELECT scheduled_start::text, scheduled_end::text,
              arrived_at::text, completed_at::text
       FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId],
    );
    const vt = visitTimes.rows[0];
    const execution =
      completed.visit_type === "standard" || completed.visit_type === "punch_list";
    if (vt && execution) {
      const windowStart = new Date(vt.arrived_at ?? vt.scheduled_start);
      const windowEnd = new Date(vt.completed_at ?? vt.scheduled_end);
      try {
        await tagMileageForCompletedVisit(client, {
          accountId: session.accountId,
          jobId: completed.job_id,
          visitId,
          day: formatBusinessYmd(vt.completed_at ?? vt.scheduled_start),
          windowStart,
          windowEnd,
        });
      } catch {
        // Mileage tag is best-effort; closeout still succeeds.
      }
    }
    const jobRow = await client.query<{ status: string; title: string }>(
      `SELECT status, title FROM jobs WHERE id = $1 AND account_id = $2`,
      [completed.job_id, session.accountId],
    );
    jobStatus = jobRow.rows[0]?.status ?? null;
  }

  if (input.kind === "return") {
    if (completed.work_order_id && input.first_up) {
      firstUpTaskId = await createFirstUpTask(client, {
        accountId: session.accountId,
        workOrderId: completed.work_order_id,
        label: input.first_up,
      });
    }
    if (input.next_when && input.next_when !== "unsure" && completed.job_id) {
      const times = await client.query<{
        scheduled_start: string;
        scheduled_end: string;
      }>(
        `SELECT scheduled_start::text, scheduled_end::text
         FROM visits WHERE id = $1 AND account_id = $2`,
        [visitId, session.accountId],
      );
      const t = times.rows[0];
      nextVisitId = await scheduleReturnVisit(
        client,
        session,
        {
          id: completed.id,
          job_id: completed.job_id,
          work_order_id: completed.work_order_id,
          assigned_user_id: completed.assigned_user_id,
          scheduled_start: t.scheduled_start,
          scheduled_end: t.scheduled_end,
        },
        input.next_when,
        input.next_date,
        firstUpTaskId,
      );
    }
  }

  if (completed.work_order_id) {
    await syncWorkOrderStatus(client, completed.work_order_id, session.accountId);
  } else if (completed.job_id) {
    await syncWorkOrdersForJob(client, completed.job_id, session.accountId);
  }

  if (input.kind === "done" && completed.job_id) {
    if (jobStatus === "in_progress" || jobStatus === "scheduled") {
      const notes = await client.query<{ tech_notes: string | null }>(
        `SELECT tech_notes FROM visits
         WHERE job_id = $1 AND account_id = $2 AND status = 'completed'
           AND visit_type IS DISTINCT FROM 'site_visit'
         ORDER BY scheduled_start ASC`,
        [completed.job_id, session.accountId],
      );
      const titleRow = await client.query<{ title: string }>(
        `SELECT title FROM jobs WHERE id = $1 AND account_id = $2`,
        [completed.job_id, session.accountId],
      );
      const desc = laborDescriptionFromVisitNotes(
        notes.rows.map((r) => r.tech_notes),
        titleRow.rows[0]?.title ?? "Labor",
      );

      const completedJob = await client.query<{ complete_job_from_closeout: string | null }>(
        `SELECT complete_job_from_closeout($1) AS complete_job_from_closeout`,
        [completed.job_id],
      );
      if (completedJob.rows[0]?.complete_job_from_closeout === "completed") {
        jobStatus = "completed";
      } else {
        const again = await client.query<{ status: string }>(
          `SELECT status FROM jobs WHERE id = $1 AND account_id = $2`,
          [completed.job_id, session.accountId],
        );
        jobStatus = again.rows[0]?.status ?? jobStatus;
      }

      if (jobStatus !== "completed") {
        return {
          visit_id: completed.id,
          job_id: completed.job_id,
          job_status: jobStatus,
          closeout_kind: input.kind,
          next_visit_id: nextVisitId,
          invoice_id: invoiceId,
          first_up_task_id: firstUpTaskId,
        };
      }

      await client.query("SAVEPOINT before_final_invoice");
      try {
        const result = await createDraftFinalInvoiceForJob({
          client,
          jobId: completed.job_id,
          accountId: session.accountId,
          userId: session.userId,
          visitId,
          traceId: session.traceId,
          closeoutRollup: true,
          laborDescription: desc,
        });
        invoiceId = result?.invoiceId ?? null;
        await client.query("RELEASE SAVEPOINT before_final_invoice");
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT before_final_invoice");
        await client.query("RELEASE SAVEPOINT before_final_invoice");
      }
      if (!invoiceId) {
        const existingInv = await client.query<{ id: string }>(
          `SELECT id FROM invoices
           WHERE job_id = $1 AND account_id = $2
             AND invoice_kind IN ('final', 'standard')
             AND status NOT IN ('cancelled', 'void')
           ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, created_at DESC
           LIMIT 1`,
          [completed.job_id, session.accountId],
        );
        invoiceId = existingInv.rows[0]?.id ?? null;
      }
    }
  }

  return {
    visit_id: completed.id,
    job_id: completed.job_id,
    job_status: jobStatus,
    closeout_kind: input.kind,
    next_visit_id: nextVisitId,
    invoice_id: invoiceId,
    first_up_task_id: firstUpTaskId,
  };
}
