import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import { invoiceStatusSchema, invoiceTransitions } from "@ai-fsm/domain";
import type { InvoiceStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const transitionSchema = z.object({
  status: invoiceStatusSchema,
});

/**
 * POST /api/v1/invoices/[id]/transition
 *
 * Transitions an invoice to a new status.
 * - App-layer check against invoiceTransitions map (fast fail before DB)
 * - DB trigger (trg_invoices_transition) also enforces at storage layer
 * - Only owner/admin may trigger transitions
 * - Audit logged on success
 *
 * Note: paid/partial transitions happen automatically via payment recording
 * (trg_payment_sync_invoice). Manual void is allowed here per contract.
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
    await withInvoiceContext(session, async (client) => {
      const existing = await client.query<{
        id: string;
        status: InvoiceStatus;
      }>(
        `SELECT id, status FROM invoices WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Invoice not found"), {
          code: "NOT_FOUND",
        });
      }

      const currentStatus = existing.rows[0].status;

      // App-layer guard
      const allowed = invoiceTransitions[currentStatus];
      if (!allowed.includes(targetStatus)) {
        throw Object.assign(
          new Error(
            `Invalid invoice transition: ${currentStatus} → ${targetStatus} (allowed: ${allowed.join(", ") || "none"})`
          ),
          { code: "INVALID_TRANSITION" }
        );
      }

      await client.query(
        `UPDATE invoices SET status = $1, updated_at = now() WHERE id = $2`,
        [targetStatus, id]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
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
            message: "Invoice not found",
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

    console.error("POST /api/v1/invoices/[id]/transition error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to transition invoice",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
