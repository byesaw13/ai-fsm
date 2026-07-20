import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext } from "@/lib/estimates/db";
import { logger } from "@/lib/logger";
import { estimateStatusSchema, estimateTransitions } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";
import { createApprovalArtifacts } from "@/lib/estimates/approve";
import { createJobFromEstimate } from "@/lib/estimates/create-job-db";
import { advanceBookingRequestForEstimate } from "@/lib/booking-requests/advance-stage";

export const dynamic = "force-dynamic";

const transitionSchema = z.object({
  status: estimateStatusSchema,
});

/**
 * POST /api/v1/estimates/[id]/transition
 *
 * Transitions an estimate to a new status.
 * - App-layer check against estimateTransitions map (fast fail before DB)
 * - DB triggers (trg_estimates_transition + trg_estimates_immutability) also enforce
 * - Only owner/admin may trigger transitions
 * - Audit logged on success
 *
 * Source evidence:
 *   Dovelite: workflow transition pattern (status button → POST transition endpoint)
 *   AI-FSM: domain/estimateTransitions, db/migrations/004_workflow_invariants.sql
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const parseResult = transitionSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { status: targetStatus } = parseResult.data;

  // `sent` may never be reached through the manual transition endpoint. The
  // only path to `sent` is the Send action, which actually delivers the
  // estimate to the client and flips the status atomically. This prevents an
  // estimate being marked "sent" without ever being delivered.
  if (targetStatus === "sent") {
    return NextResponse.json(
      {
        error: {
          code: "USE_SEND_ACTION",
          message:
            "An estimate becomes 'sent' only by delivering it. Use the Send to Client action.",
          traceId: session.traceId,
        },
      },
      { status: 409 }
    );
  }

  let createdDepositInvoiceId: string | null = null;
  let createdJobId: string | null = null;
  let createdWorkOrderId: string | null = null;
  let jobSpawnWarning: { code: string; message: string; recentWork?: unknown } | null = null;

  try {
    await withEstimateContext(session, async (client) => {
      // Fetch current estimate
      const existing = await client.query<{
        id: string;
        status: EstimateStatus;
        total_cents: number;
        trip_count: "one_trip" | "multi_trip";
        requires_drying_or_curing: boolean;
        difficult_access: boolean;
        old_house_risk: boolean;
        coordination_required: boolean;
        finish_expectation: "basic" | "clean" | "premium";
        travel_surcharge_cents: number;
        risk_adjustment_cents: number;
        minimum_service_override_reason: "bundled" | "membership_included" | "promo" | "owner_approved" | null;
        line_item_count: number;
      }>(
        `SELECT id, status, total_cents, trip_count, requires_drying_or_curing,
                difficult_access, old_house_risk, coordination_required,
                finish_expectation, travel_surcharge_cents, risk_adjustment_cents,
                minimum_service_override_reason,
                (SELECT COUNT(*)::int FROM estimate_line_items eli
                 WHERE eli.estimate_id = estimates.id AND eli.visible_to_customer = true) AS line_item_count
         FROM estimates WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Estimate not found"), {
          code: "NOT_FOUND",
        });
      }

      const currentStatus = existing.rows[0].status;

      // App-layer transition guard (fast fail, mirrors DB trigger)
      const allowed = estimateTransitions[currentStatus];
      if (!allowed.includes(targetStatus)) {
        throw Object.assign(
          new Error(
            `Invalid estimate transition: ${currentStatus} → ${targetStatus} (allowed: ${allowed.join(", ") || "none"})`
          ),
          { code: "INVALID_TRANSITION" }
        );
      }

      // Note: the `sent` target is rejected before the transaction (see the
      // USE_SEND_ACTION guard above). The Send action performs its own pricing
      // review and the draft→sent flip, so no sent handling is needed here.

      // Execute the transition; DB triggers enforce at storage layer too
      await client.query(
        `UPDATE estimates SET status = $1, updated_at = now() WHERE id = $2`,
        [targetStatus, id]
      );

      // On approval: create deposit invoice, then auto-link a job.
      // createJobFromEstimate is idempotent (returns existing job if already linked).
      if (targetStatus === "approved") {
        const { depositInvoiceId } = await createApprovalArtifacts(client, {
          estimateId: id,
          accountId: session.accountId,
          userId: session.userId,
        });
        createdDepositInvoiceId = depositInvoiceId;

        // Auto-create (or link) the job so it's visible on the board.
        // Wrapped in a savepoint so a job-creation failure never rolls back
        // the estimate approval itself. CLIENT_RECENT_WORK is intentional:
        // approve still succeeds; we refuse to silently spawn a second project.
        await client.query("SAVEPOINT before_auto_job");
        try {
          const { jobId, workOrderId } = await createJobFromEstimate({
            client,
            estimateId: id,
            accountId: session.accountId,
            createdBy: session.userId,
          });
          createdJobId = jobId;
          createdWorkOrderId = workOrderId ?? null;
          await client.query("RELEASE SAVEPOINT before_auto_job");
        } catch (jobErr) {
          await client.query("ROLLBACK TO SAVEPOINT before_auto_job");
          await client.query("RELEASE SAVEPOINT before_auto_job");
          const je = jobErr as Error & { code?: string; recentWork?: unknown };
          if (je.code === "CLIENT_RECENT_WORK") {
            jobSpawnWarning = {
              code: "CLIENT_RECENT_WORK",
              message: je.message,
              recentWork: je.recentWork,
            };
            logger.info("estimate transition: skipped job spawn — client recent work", {
              traceId: session.traceId,
              estimateId: id,
              recentWork: je.recentWork,
            });
          } else {
            logger.error("estimate transition: auto-create job failed (non-fatal)", jobErr, {
              traceId: session.traceId,
            });
          }
        }

        // Won the lead: mark linked booking request converted
        await advanceBookingRequestForEstimate(client, {
          accountId: session.accountId,
          estimateId: id,
          target: "converted",
          actorId: session.userId,
          note: "Estimate approved",
        }).catch((err) =>
          logger.error("estimate transition: booking request convert failed (non-fatal)", err, {
            traceId: session.traceId,
            estimateId: id,
          })
        );
      }

      if (targetStatus === "declined") {
        await advanceBookingRequestForEstimate(client, {
          accountId: session.accountId,
          estimateId: id,
          target: "lost",
          actorId: session.userId,
          closedReason: "estimate_declined",
          note: "Estimate declined",
        }).catch((err) =>
          logger.error("estimate transition: booking request lost failed (non-fatal)", err, {
            traceId: session.traceId,
            estimateId: id,
          })
        );
      }

      // Audit log
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: {
          status: targetStatus,
          deposit_invoice_id: createdDepositInvoiceId,
          job_id: createdJobId,
          work_order_id: createdWorkOrderId,
        },
      });
    });

    const response: Record<string, unknown> = { status: targetStatus };
    if (createdDepositInvoiceId) {
      response.deposit_invoice_id = createdDepositInvoiceId;
    }
    if (createdJobId) {
      response.job_id = createdJobId;
    }
    if (createdWorkOrderId) {
      response.work_order_id = createdWorkOrderId;
    }
    if (jobSpawnWarning) {
      response.job_spawn_warning = jobSpawnWarning;
    }
    return NextResponse.json(response);
  } catch (error) {
    const err = error as Error & { code?: string };

    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Estimate not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }

    if (err.code === "INVALID_TRANSITION") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }

    if (err.code === "PRICING_REVIEW_BLOCKED") {
      return NextResponse.json(
        {
          error: {
            code: "PRICING_REVIEW_BLOCKED",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }

    // Handle DB trigger errors (P0001 errcode from PostgreSQL)
    const pgErr = error as { code?: string; message?: string };
    if (pgErr.code === "P0001") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: pgErr.message ?? "Transition rejected by database",
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }

    logger.error("POST /api/v1/estimates/[id]/transition error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to transition estimate",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
