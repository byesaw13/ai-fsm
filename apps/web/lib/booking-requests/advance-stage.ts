/**
 * Booking request sales funnel advances.
 *
 * Called (pending) → assessment_booked → estimated → converted
 * Terminal: converted | lost | cancelled | duplicate
 *
 * Never regresses funnel rank. Terminal requests are no-ops.
 */
import type { PoolClient } from "pg";
import type { BookingRequestClosedReason, BookingRequestStatus } from "@ai-fsm/domain";
import {
  BOOKING_REQUEST_TERMINAL_STATUSES,
} from "@ai-fsm/domain";
import { recordStatusChange } from "@/lib/status-history";

const FUNNEL_RANK: Record<string, number> = {
  pending: 0,
  needs_info: 0,
  reviewed: 1,
  assessment_booked: 2,
  estimated: 3,
  converted: 4,
  duplicate: 99,
  lost: 99,
  cancelled: 99,
};

const TERMINAL = new Set<string>(BOOKING_REQUEST_TERMINAL_STATUSES);

export type AdvanceStageResult = {
  advanced: boolean;
  from: string | null;
  to: string;
  requestId: string;
};

export type AdvanceStageOpts = {
  accountId: string;
  requestId: string;
  target: BookingRequestStatus;
  actorId?: string | null;
  note?: string | null;
  closedReason?: BookingRequestClosedReason | null;
  /** Optional linkage updates applied when advancing (or when linking visit). */
  visitId?: string | null;
  jobId?: string | null;
  /** When true, always write visit_id/job_id even if status does not advance. */
  forceLink?: boolean;
};

function shouldAdvance(current: string, target: BookingRequestStatus): boolean {
  if (TERMINAL.has(current)) return false;

  // Terminal side exits from open funnel
  if (target === "lost" || target === "cancelled" || target === "duplicate") {
    return true;
  }

  const curRank = FUNNEL_RANK[current] ?? 0;
  const nextRank = FUNNEL_RANK[target] ?? 0;
  return nextRank > curRank;
}

/**
 * Advance a booking request to a funnel stage or terminal status.
 * Idempotent: no-ops when already terminal or target is not a forward step.
 */
export async function advanceBookingRequestStage(
  client: PoolClient,
  opts: AdvanceStageOpts
): Promise<AdvanceStageResult> {
  const {
    accountId,
    requestId,
    target,
    actorId = null,
    note = null,
    closedReason = null,
    visitId,
    jobId,
    forceLink = false,
  } = opts;

  const { rows } = await client.query<{
    id: string;
    status: string;
  }>(
    `SELECT id, status FROM booking_requests
     WHERE id = $1 AND account_id = $2
     FOR UPDATE`,
    [requestId, accountId]
  );

  if (rows.length === 0) {
    return { advanced: false, from: null, to: target, requestId };
  }

  const current = rows[0].status;
  const advance = shouldAdvance(current, target);

  if (!advance && !forceLink && visitId == null && jobId == null) {
    return { advanced: false, from: current, to: current, requestId };
  }

  const setClauses: string[] = ["updated_at = now()"];
  const params: unknown[] = [requestId, accountId];
  let idx = 3;

  if (advance) {
    setClauses.push(`status = $${idx++}`);
    params.push(target);

    if (target === "lost" || target === "cancelled") {
      setClauses.push(`closed_at = now()`);
      if (closedReason) {
        setClauses.push(`closed_reason = $${idx++}`);
        params.push(closedReason);
      }
    }

    // Mark reviewed when leaving pure intake
    if (target !== "pending" && target !== "needs_info") {
      setClauses.push(`reviewed_by = COALESCE(reviewed_by, $${idx})`);
      params.push(actorId);
      idx++;
      setClauses.push(`reviewed_at = COALESCE(reviewed_at, now())`);
    }
  }

  if (visitId !== undefined && visitId !== null) {
    setClauses.push(`visit_id = COALESCE(visit_id, $${idx++})`);
    params.push(visitId);
  }
  if (jobId !== undefined && jobId !== null) {
    setClauses.push(`job_id = COALESCE(job_id, $${idx++})`);
    params.push(jobId);
  }

  if (setClauses.length === 1 && !advance) {
    // only updated_at — skip
    return { advanced: false, from: current, to: current, requestId };
  }

  await client.query(
    `UPDATE booking_requests SET ${setClauses.join(", ")}
     WHERE id = $1 AND account_id = $2`,
    params
  );

  if (advance) {
    await recordStatusChange(client, {
      accountId,
      entityType: "booking_request",
      entityId: requestId,
      fromStatus: current,
      toStatus: target,
      changedBy: actorId,
      note: note ?? (closedReason ? `closed_reason=${closedReason}` : null),
    });
  }

  return {
    advanced: advance,
    from: current,
    to: advance ? target : current,
    requestId,
  };
}

/**
 * Resolve booking_request_id from an estimate (direct or via job) and advance.
 */
export async function advanceBookingRequestForEstimate(
  client: PoolClient,
  opts: {
    accountId: string;
    estimateId: string;
    target: BookingRequestStatus;
    actorId?: string | null;
    closedReason?: BookingRequestClosedReason | null;
    note?: string | null;
  }
): Promise<AdvanceStageResult | null> {
  const { rows } = await client.query<{
    booking_request_id: string | null;
    job_booking_request_id: string | null;
  }>(
    `SELECT e.booking_request_id,
            j.booking_request_id AS job_booking_request_id
     FROM estimates e
     LEFT JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
     WHERE e.id = $1 AND e.account_id = $2`,
    [opts.estimateId, opts.accountId]
  );

  if (rows.length === 0) return null;
  const requestId =
    rows[0].booking_request_id ?? rows[0].job_booking_request_id ?? null;
  if (!requestId) return null;

  return advanceBookingRequestStage(client, {
    accountId: opts.accountId,
    requestId,
    target: opts.target,
    actorId: opts.actorId,
    closedReason: opts.closedReason,
    note: opts.note,
  });
}
