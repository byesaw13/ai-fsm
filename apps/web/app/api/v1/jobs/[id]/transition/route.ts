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
import { createDraftFinalInvoiceForJob } from "../../../../../../lib/invoices/final-invoice";

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

      // Auto-create a draft final invoice when job is completed using the shared
      // createDraftFinalInvoiceForJob helper (same logic as visit completion).
      let final_invoice_id: string | null = null;
      if (targetStatus === "completed") {
        const result = await createDraftFinalInvoiceForJob({
          client,
          jobId: id,
          accountId: session.accountId,
          userId: session.userId,
          traceId: session.traceId,
        });
        final_invoice_id = result?.invoiceId ?? null;
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: { status: targetStatus, final_invoice_id },
      });

      await client.query("COMMIT");

      const response: Record<string, unknown> = { data: updated };
      if (final_invoice_id) {
        response.final_invoice_id = final_invoice_id;
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
