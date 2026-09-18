import type { PoolClient } from "pg";
import {
  STOP_REASONS,
  stopCreatesJob,
  stopIsBillable,
  stopReasonOptions,
  stopRequiresNotes,
  type Role,
  type StopReason,
  type VisitCloseoutKind,
} from "@ai-fsm/domain";
import { appendAuditLog } from "@/lib/db/audit";
import { canManageExpenses } from "@/lib/auth/permissions";
import { RECEIPT_LINKABLE_JOB_STATUS_SQL } from "@/lib/expenses/open-jobs";
import { ensureFieldDayVisit } from "@/lib/field/confirm-visit";
import { createDefaultWorkOrderForJob } from "@/lib/work-orders/create-default";
import { runVisitCloseout, CloseoutError } from "@/lib/visits/closeout";

export class StopInterviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number = 422,
  ) {
    super(message);
    this.name = "StopInterviewError";
  }
}

export type StopInterviewInput = {
  segmentId: string;
  reason: StopReason;
  notes?: string | null;
  jobTitle?: string | null;
  closeoutKind?: VisitCloseoutKind | null;
  nextWhen?: "tomorrow" | "date" | "unsure" | null;
  nextDate?: string | null;
  firstUp?: string | null;
  expenseIds?: string[];
  expenseJobId?: string | null;
};

type SegmentRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
  activity_entry_id: string | null;
  candidate_id: string | null;
  property_id: string | null;
  client_id: string | null;
  visit_id: string | null;
  job_id: string | null;
  work_order_id: string | null;
  candidate_status: string | null;
};

function isOwnerOrAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function applyStopInterview(
  client: PoolClient,
  session: { accountId: string; userId: string; role: Role; traceId: string },
  input: StopInterviewInput,
): Promise<{ jobId: string | null; visitId: string | null }> {
  if (!(STOP_REASONS as readonly string[]).includes(input.reason)) {
    throw new StopInterviewError("VALIDATION_ERROR", "Unknown stop reason");
  }

  const { rows } = await client.query<SegmentRow>(
    `SELECT s.id, s.started_at::text, s.ended_at::text, s.place_label,
            s.activity_entry_id,
            vc.id AS candidate_id, vc.property_id, vc.matched_client_id AS client_id,
            vc.visit_id, vc.job_id, vc.work_order_id, vc.status AS candidate_status
     FROM location_segments s
     LEFT JOIN visit_candidates vc
       ON vc.location_segment_id = s.id AND vc.account_id = s.account_id
     WHERE s.id = $1 AND s.account_id = $2`,
    [input.segmentId, session.accountId],
  );
  const seg = rows[0];
  if (!seg) throw new StopInterviewError("NOT_FOUND", "Stop not found", 404);
  const endedAt = seg.ended_at ?? new Date().toISOString();

  const open = await openJobAtProperty(client, session.accountId, seg.property_id);
  const options = stopReasonOptions({
    hasOpenJob: Boolean(open),
    hasProperty: Boolean(seg.property_id),
  });
  if (!options.includes(input.reason)) {
    throw new StopInterviewError(
      "VALIDATION_ERROR",
      "That reason is not available for this stop",
    );
  }

  const notes = (input.notes ?? "").trim();
  if (stopRequiresNotes(input.reason) && !notes) {
    throw new StopInterviewError("VALIDATION_ERROR", "What did you do today is required");
  }
  if (stopIsBillable(input.reason) && !input.closeoutKind) {
    throw new StopInterviewError(
      "VALIDATION_ERROR",
      "Done or coming back is required for work stops",
    );
  }
  if (
    stopIsBillable(input.reason) &&
    input.closeoutKind === "return" &&
    (!input.nextWhen || !input.firstUp?.trim())
  ) {
    throw new StopInterviewError(
      "VALIDATION_ERROR",
      "Coming back needs when and what’s first",
    );
  }

  if (stopCreatesJob(input.reason) && !isOwnerOrAdmin(session.role)) {
    throw new StopInterviewError("FORBIDDEN", "Only owner or admin can start new work", 403);
  }
  if (
    input.reason === "store" &&
    ((input.expenseIds?.length ?? 0) > 0 || input.expenseJobId) &&
    !canManageExpenses(session.role)
  ) {
    throw new StopInterviewError("FORBIDDEN", "Only owner or admin can file receipts", 403);
  }

  let jobId = open?.id ?? null;
  let visitId = seg.visit_id;

  if (stopCreatesJob(input.reason)) {
    if (!seg.property_id || !seg.client_id) {
      throw new StopInterviewError("VALIDATION_ERROR", "New work needs a known house");
    }
    const title = (input.jobTitle ?? notes).trim().slice(0, 255) || "New work";
    jobId = await createJobOnProperty(client, session, {
      propertyId: seg.property_id,
      clientId: seg.client_id,
      title,
      notes,
    });
    // Candidate may still point at the invoiced/closed job's visit.
    visitId = null;
  }

  await client.query(
    `UPDATE location_segments
     SET stop_reason = $1, stop_notes = $2, status = 'confirmed', updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [input.reason, notes || null, seg.id, session.accountId],
  );

  if (input.reason === "not_work" || input.reason === "pickup") {
    await detachRejectedStop(client, session.accountId, seg, input.reason);
    return { jobId: null, visitId: null };
  }

  if (input.reason === "store") {
    const filedJobId = await fileReceipts(
      client,
      session,
      input.expenseIds ?? [],
      input.expenseJobId ?? jobId,
    );
    return { jobId: filedJobId, visitId: null };
  }

  if (stopIsBillable(input.reason) && jobId) {
    const ensured = await ensureFieldDayVisit(client, {
      accountId: session.accountId,
      userId: session.userId,
      jobId,
      visitId,
      classification: "job_work",
      arrivalTime: seg.started_at,
      departureTime: endedAt,
      workOrderId: input.reason === "new_work" ? null : seg.work_order_id,
      techNotes: notes,
      complete: false,
    });
    visitId = ensured.visitId;
    if (seg.candidate_id) {
      await client.query(
        `UPDATE visit_candidates
         SET job_id = $1,
             visit_id = $2,
             classification = 'job_work',
             status = 'confirmed',
             confirmed_at = COALESCE(confirmed_at, now()),
             wo_resolution = 'resolved',
             updated_at = now()
         WHERE id = $3 AND account_id = $4`,
        [jobId, visitId, seg.candidate_id, session.accountId],
      );
    }
    if (visitId && notes) {
      await client.query(
        `UPDATE visits SET tech_notes = $1, updated_at = now()
         WHERE id = $2 AND account_id = $3`,
        [notes, visitId, session.accountId],
      );
    }
    if (visitId && input.closeoutKind) {
      try {
        await runVisitCloseout(client, session, visitId, {
          kind: input.closeoutKind,
          today_notes: notes,
          next_when: input.nextWhen ?? undefined,
          next_date: input.nextDate ?? undefined,
          first_up: input.firstUp ?? undefined,
        });
      } catch (err) {
        if (!(err instanceof CloseoutError)) throw err;
        // Already closed during the day via Complete — notes already saved.
        if (err.code !== "INVALID_TRANSITION") throw err;
      }
    }
  }

  return { jobId, visitId };
}

async function detachRejectedStop(
  client: PoolClient,
  accountId: string,
  seg: SegmentRow,
  reason: StopReason,
): Promise<void> {
  if (seg.activity_entry_id) {
    await client.query(
      `UPDATE activity_entries
       SET voided_at = now()
       WHERE id = $1 AND account_id = $2 AND voided_at IS NULL`,
      [seg.activity_entry_id, accountId],
    );
    await client.query(
      `UPDATE location_segments
       SET activity_entry_id = NULL, updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [seg.id, accountId],
    );
  }
  await client.query(
    `UPDATE visit_candidates
     SET status = 'ignored',
         classification = $1,
         job_id = NULL,
         visit_id = NULL,
         work_order_id = NULL,
         updated_at = now()
     WHERE location_segment_id = $2
       AND account_id = $3
       AND status IN ('pending', 'confirmed')`,
    [reason, seg.id, accountId],
  );
}

async function openJobAtProperty(
  client: PoolClient,
  accountId: string,
  propertyId: string | null,
): Promise<{ id: string } | null> {
  if (!propertyId) return null;
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM jobs
     WHERE account_id = $1 AND property_id = $2
       AND status IN ('draft', 'quoted', 'scheduled', 'in_progress')
     ORDER BY updated_at DESC LIMIT 1`,
    [accountId, propertyId],
  );
  return rows[0] ?? null;
}

async function createJobOnProperty(
  client: PoolClient,
  session: { accountId: string; userId: string; traceId: string },
  opts: { propertyId: string; clientId: string; title: string; notes: string },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO jobs (account_id, client_id, property_id, title, description, job_type, created_by)
     VALUES ($1, $2, $3, $4, $5, 'repair', $6)
     RETURNING id`,
    [
      session.accountId,
      opts.clientId,
      opts.propertyId,
      opts.title,
      opts.notes || null,
      session.userId,
    ],
  );
  const jobId = rows[0].id;
  await client.query(
    `UPDATE jobs SET status = 'scheduled', updated_at = now()
     WHERE id = $1 AND account_id = $2 AND status = 'draft'`,
    [jobId, session.accountId],
  );
  await client.query(
    `UPDATE jobs SET status = 'in_progress', updated_at = now()
     WHERE id = $1 AND account_id = $2 AND status = 'scheduled'`,
    [jobId, session.accountId],
  );
  const workOrderId = await createDefaultWorkOrderForJob({
    client,
    accountId: session.accountId,
    clientId: opts.clientId,
    jobId,
    title: opts.title,
    scope: opts.notes || null,
    createdBy: session.userId,
  });
  await appendAuditLog(client, {
    account_id: session.accountId,
    entity_type: "job",
    entity_id: jobId,
    action: "insert",
    actor_id: session.userId,
    trace_id: session.traceId,
    new_value: { title: opts.title, property_id: opts.propertyId, work_order_id: workOrderId },
  });
  return jobId;
}

async function fileReceipts(
  client: PoolClient,
  session: { accountId: string },
  expenseIds: string[],
  jobId: string | null,
): Promise<string | null> {
  if (expenseIds.length === 0) return jobId;
  let targetJobId: string | null = null;
  if (jobId) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM jobs
       WHERE id = $1 AND account_id = $2
         AND status IN (${RECEIPT_LINKABLE_JOB_STATUS_SQL})`,
      [jobId, session.accountId],
    );
    if (!rows[0]) {
      throw new StopInterviewError(
        "VALIDATION_ERROR",
        "Receipt job is not an open job on this account",
      );
    }
    targetJobId = rows[0].id;
    await client.query(
      `UPDATE expenses
       SET job_id = $1, allocation = 'job', billable = true,
           reviewed_at = now(), updated_at = now()
       WHERE account_id = $2
         AND id = ANY($3::uuid[])
         AND job_id IS NULL AND reviewed_at IS NULL`,
      [targetJobId, session.accountId, expenseIds],
    );
  } else {
    await client.query(
      `UPDATE expenses
       SET allocation = 'stock', billable = false,
           reviewed_at = now(), updated_at = now()
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
         AND job_id IS NULL AND reviewed_at IS NULL`,
      [session.accountId, expenseIds],
    );
  }
  return targetJobId;
}
