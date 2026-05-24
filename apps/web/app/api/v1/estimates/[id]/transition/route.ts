import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext } from "@/lib/estimates/db";
import { logger } from "@/lib/logger";
import { estimateStatusSchema, estimateTransitions } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";
import { reviewEstimateGuardrails } from "@/lib/estimates/guardrails";
import { generateInvoiceNumber } from "@/lib/invoices/db";

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
  let createdDepositInvoiceId: string | null = null;

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

      if (targetStatus === "sent") {
        const pricingReview = reviewEstimateGuardrails({
          ...existing.rows[0],
          margin_pct: null,
          has_ma_regulated_items: false,
          line_item_count: existing.rows[0].line_item_count,
        });
        await client.query(
          `UPDATE estimates
           SET pricing_review_status = $1,
               pricing_reviewed_at = now(),
               pricing_reviewed_by = $2,
               updated_at = now()
           WHERE id = $3`,
          [pricingReview.status, session.userId, id]
        );
        if (pricingReview.blockers.length > 0) {
          throw Object.assign(
            new Error(pricingReview.blockers.map((b) => b.message).join(" ")),
            { code: "PRICING_REVIEW_BLOCKED" }
          );
        }
      }

      // Execute the transition; DB triggers enforce at storage layer too
      await client.query(
        `UPDATE estimates SET status = $1, updated_at = now() WHERE id = $2`,
        [targetStatus, id]
      );

      // Auto-create deposit invoice when estimate is approved
      if (targetStatus === "approved") {
        const estData = await client.query<{
          client_id: string;
          job_id: string | null;
          property_id: string | null;
          deposit_cents: number;
          notes: string | null;
        }>(
          `SELECT client_id, job_id, property_id, deposit_cents, notes
           FROM estimates WHERE id = $1`,
          [id]
        );
        const est = estData.rows[0];

        if (est && est.deposit_cents > 0) {
          const existingDeposit = await client.query<{ id: string }>(
            `SELECT id FROM invoices
             WHERE estimate_id = $1 AND account_id = $2 AND notes LIKE 'Deposit: %'
             LIMIT 1`,
            [id, session.accountId]
          );

          if (existingDeposit.rowCount === 0) {
            const invoiceNumber = await generateInvoiceNumber(client, session.accountId);
            const depositResult = await client.query<{ id: string }>(
              `INSERT INTO invoices
                 (account_id, client_id, job_id, estimate_id, property_id,
                  status, invoice_number,
                  subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
                  notes, created_by)
               VALUES ($1, $2, $3, $4, $5,
                       'sent', $6,
                       $7, 0, $7, 0, $7,
                       $8, $9)
               RETURNING id`,
              [
                session.accountId,
                est.client_id,
                est.job_id,
                id,
                est.property_id,
                invoiceNumber,
                est.deposit_cents,
                `Deposit: ${est.notes ?? "Estimate approved"}`,
                session.userId,
              ]
            );
            createdDepositInvoiceId = depositResult.rows[0].id;
          }
        }
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
        new_value: { status: targetStatus, deposit_invoice_id: createdDepositInvoiceId },
      });
    });

    const response: Record<string, unknown> = { status: targetStatus };
    if (createdDepositInvoiceId) {
      response.deposit_invoice_id = createdDepositInvoiceId;
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
