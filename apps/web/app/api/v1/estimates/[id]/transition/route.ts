import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext } from "@/lib/estimates/db";
import { estimateStatusSchema, estimateTransitions } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";

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
  const id = request.nextUrl.pathname.split("/").at(-3)!;

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

  try {
    await withEstimateContext(session, async (client) => {
      // Fetch current estimate
      const existing = await client.query<{ id: string; status: EstimateStatus }>(
        `SELECT id, status FROM estimates WHERE id = $1 AND account_id = $2`,
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

      // Execute the transition; DB triggers enforce at storage layer too
      await client.query(
        `UPDATE estimates SET status = $1, updated_at = now() WHERE id = $2`,
        [targetStatus, id]
      );

      // Audit log
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: { status: targetStatus },
      });
    });

    return NextResponse.json({ status: targetStatus });
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

    console.error("POST /api/v1/estimates/[id]/transition error:", error);
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
