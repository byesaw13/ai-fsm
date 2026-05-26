import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";
import { jobTransitions, jobStatusSchema } from "@ai-fsm/domain";
import type { JobStatus } from "@ai-fsm/domain";
import { reviewJobIntakeGate } from "../../../../../../lib/jobs/intake-guard";
import { generateInvoiceNumber } from "../../../../../../lib/invoices/db";
import { createActionItem } from "../../../../../../lib/action-items";

export const dynamic = "force-dynamic";

const transitionBody = z.object({
  status: jobStatusSchema,
});

export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    // Extract [id] from URL — HOF wrappers don't forward route params
    const id = request.url.match(/\/jobs\/([^/]+)\/transition/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
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

    const targetStatus = parsed.data.status as JobStatus;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const job = existing.rows[0];
      const currentStatus = job.status as JobStatus;
      const allowed = jobTransitions[currentStatus];

      if (!allowed.includes(targetStatus)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "INVALID_TRANSITION",
              message: `Cannot transition job from '${currentStatus}' to '${targetStatus}'`,
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Intake gate: fires only on draft → quoted
      let intakeWarning: string | null = null;
      if (currentStatus === "draft" && targetStatus === "quoted") {
        const gate = reviewJobIntakeGate(job);
        if (gate.status === "blocked") {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: {
                code: "INTAKE_GATE_BLOCKED",
                message: gate.blocker,
                traceId: session.traceId,
              },
            },
            { status: 409 }
          );
        }
        intakeWarning = gate.warning;
      }

      const { rows } = await client.query(
        `UPDATE jobs SET status = $1, updated_at = now() WHERE id = $2 AND account_id = $3 RETURNING *`,
        [targetStatus, id, session.accountId]
      );

      const updated = rows[0];

      // Prompt to invoice when job is completed
      if (targetStatus === "completed") {
        await createActionItem(client, {
          accountId: session.accountId,
          entityType: "job",
          entityId: id,
          actionType: "create_invoice",
          title: `Invoice for: ${updated.title}`,
        });
      }

      // Auto-create balance invoice when job is completed
      let balance_invoice_id: string | null = null;
      if (targetStatus === "completed") {
        const approvedEstimate = await client.query<{
          id: string;
          client_id: string;
          property_id: string | null;
          balance_cents: number;
          notes: string | null;
        }>(
          `SELECT id, client_id, property_id, balance_cents, notes
           FROM estimates
           WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
           ORDER BY created_at DESC
           LIMIT 1`,
          [id, session.accountId]
        );

        if (approvedEstimate.rowCount !== null && approvedEstimate.rowCount > 0) {
          const est = approvedEstimate.rows[0];

          if (est.balance_cents > 0) {
            const existingBalance = await client.query<{ id: string }>(
              `SELECT id FROM invoices
               WHERE estimate_id = $1 AND account_id = $2 AND notes LIKE 'Balance: %'
               LIMIT 1`,
              [est.id, session.accountId]
            );

            if (existingBalance.rowCount === 0) {
              const invoiceNumber = await generateInvoiceNumber(client, session.accountId);

              const balanceResult = await client.query<{ id: string }>(
                `INSERT INTO invoices
                   (account_id, client_id, job_id, estimate_id, property_id,
                    status, invoice_number,
                    subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
                    notes, created_by)
                 VALUES ($1, $2, $3, $4, $5,
                         'sent', $6,
                         $7, 0, $7, 0, 0,
                         $8, $9)
                 RETURNING id`,
                [
                  session.accountId,
                  est.client_id,
                  id,
                  est.id,
                  est.property_id,
                  invoiceNumber,
                  est.balance_cents,
                  `Balance: ${est.notes ?? "Job completed"}`,
                  session.userId,
                ]
              );
              balance_invoice_id = balanceResult.rows[0].id;
            }
          }
        }
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: { status: targetStatus, balance_invoice_id },
      });

      await client.query("COMMIT");

      const response: Record<string, unknown> = { data: updated };
      if (balance_invoice_id) {
        response.balance_invoice_id = balance_invoice_id;
      }
      if (intakeWarning) {
        response.warning = intakeWarning;
      }
      return NextResponse.json(response);
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[jobs transition POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to transition job",
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
