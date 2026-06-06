import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";
import { checkCompletionPacket } from "../../../../../../lib/completion-guard";
import { visitTransitions, visitStatusSchema } from "@ai-fsm/domain";
import type { VisitStatus } from "@ai-fsm/domain";
import { generateInvoiceNumber } from "../../../../../../lib/invoices/db";

interface VisitRow {
  id: string;
  account_id: string;
  job_id: string | null;
  assigned_user_id: string | null;
  status: VisitStatus;
  arrived_at: string | null;
  completed_at: string | null;
  tech_notes: string | null;
  updated_at: string;
}
import { seedConditionSnapshots } from "../../../../../../lib/visits/condition-seeding";
import { writeWorkflowEvent } from "../../../../../../lib/workflow-events";

export const dynamic = "force-dynamic";

const transitionBody = z.object({
  status: visitStatusSchema,
  tech_notes: z.string().optional(),
});

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/visits\/([^/]+)\/transition/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
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

    const targetStatus = parsed.data.status as VisitStatus;
    const techNotes = parsed.data.tech_notes;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const visit = existing.rows[0];
      const currentStatus = visit.status as VisitStatus;
      const allowed = visitTransitions[currentStatus];

      if (!allowed.includes(targetStatus)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "INVALID_TRANSITION",
              message: `Cannot transition visit from '${currentStatus}' to '${targetStatus}'`,
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Precondition: a visit must have an assigned technician before it can be started.
      if (targetStatus === "arrived" && !visit.assigned_user_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "Visit must have an assigned technician before it can be started",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Precondition: membership visits must reach the Reporting phase before completion.
      if (
        targetStatus === "completed" &&
        visit.generated_from_plan_id &&
        visit.membership_visit_phase !== "reporting"
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "Complete the Reporting phase before marking this membership visit as done",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Precondition: membership visits must have the client summary/snapshot sent
      // or explicitly marked sent before the visit can be closed.
      if (
        targetStatus === "completed" &&
        visit.generated_from_plan_id &&
        !visit.membership_snapshot_sent_at
      ) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "Send or mark the visit summary as sent before completing this membership visit",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      if (targetStatus === "completed") {
        const packetResult = await client.query(
          `SELECT photo_urls, signature_url, signature_waiver
           FROM completion_packets
           WHERE visit_id = $1 AND account_id = $2`,
          [id, session.accountId]
        );
        const guard = checkCompletionPacket(packetResult.rows[0] ?? null);

        if (!guard.ok) {
          await client.query("ROLLBACK");
          const message = guard.error === "MISSING_PHOTO"
            ? "At least one photo is required before completing this visit"
            : "A signature or waiver is required before completing this visit";
          return NextResponse.json(
            { error: { code: guard.error, message, traceId: session.traceId } },
            { status: 422 }
          );
        }
      }

      // -----------------------------------------------------------------------
      // "Start Job" — when tech taps arrived, we step through two valid DB
      // transitions in one transaction to satisfy the trigger:
      //   1. scheduled → arrived  (records arrived_at)
      //   2. arrived   → in_progress
      // The visit is never visible in 'arrived' state outside this tx.
      // -----------------------------------------------------------------------
      let updated: VisitRow;
      let effectiveStatus: VisitStatus;

      if (targetStatus === "arrived") {
        // Step 1: scheduled → arrived (DB trigger allows this)
        await client.query(
          `UPDATE visits SET status = 'arrived', arrived_at = now(), updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [id, session.accountId]
        );
        // Step 2: arrived → in_progress (DB trigger allows this)
        const noteClause2 = techNotes !== undefined ? `, tech_notes = $3` : "";
        const params2: unknown[] = [id, session.accountId];
        if (techNotes !== undefined) params2.push(techNotes);
        const { rows: rows2 } = await client.query<VisitRow>(
          `UPDATE visits SET status = 'in_progress', updated_at = now()${noteClause2}
           WHERE id = $1 AND account_id = $2
           RETURNING *`,
          params2
        );
        updated = rows2[0];
        effectiveStatus = "in_progress";
      } else {
        const completedClause = targetStatus === "completed" ? ", completed_at = now()" : "";
        const noteClause = techNotes !== undefined ? `, tech_notes = $4` : "";
        const params: unknown[] = [targetStatus, id, session.accountId];
        if (techNotes !== undefined) params.push(techNotes);
        const { rows } = await client.query<VisitRow>(
          `UPDATE visits
           SET status = $1, updated_at = now()${completedClause}${noteClause}
           WHERE id = $2 AND account_id = $3
           RETURNING *`,
          params
        );
        updated = rows[0];
        effectiveStatus = targetStatus;
      }

      if (effectiveStatus === "in_progress" && currentStatus !== "in_progress") {
        await client.query(
          `INSERT INTO visit_time_logs (account_id, visit_id, job_id, user_id, started_at)
           SELECT $1, $2, $3, $4, now()
           WHERE NOT EXISTS (
             SELECT 1 FROM visit_time_logs
             WHERE account_id = $1 AND visit_id = $2 AND ended_at IS NULL
           )`,
          [session.accountId, id, updated.job_id ?? null, updated.assigned_user_id ?? session.userId]
        );
      }

      if (effectiveStatus === "completed" || effectiveStatus === "cancelled") {
        await client.query(
          `UPDATE visit_time_logs
           SET ended_at = now(),
               notes = COALESCE($3, notes),
               updated_at = now()
           WHERE account_id = $1
             AND visit_id = $2
             AND ended_at IS NULL`,
          [session.accountId, id, techNotes ?? null]
        );
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: { status: effectiveStatus },
      });

      // -----------------------------------------------------------------------
      // Job auto-advancement:
      //
      // • When a visit starts (arrived → in_progress), advance the parent job
      //   from 'scheduled' to 'in_progress' so the job reflects active work.
      //
      // • When a visit completes, auto-advance the parent job to 'completed'
      //   if every sibling visit is now completed or cancelled. This puts the
      //   job in the "ready to invoice" queue for the admin.
      // -----------------------------------------------------------------------
      if (updated.job_id) {
        const jobRow = await client.query(
          `SELECT id, status FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
          [updated.job_id, session.accountId]
        );
        const job = jobRow.rows[0];

        if (job) {
          if (effectiveStatus === "in_progress" && job.status === "scheduled") {
            // Visit started — advance job from scheduled → in_progress
            await client.query(
              `UPDATE jobs SET status = 'in_progress', updated_at = now()
               WHERE id = $1 AND account_id = $2`,
              [updated.job_id, session.accountId]
            );
            await appendAuditLog(client, {
              account_id: session.accountId,
              entity_type: "job",
              entity_id: updated.job_id,
              action: "update",
              actor_id: session.userId,
              trace_id: session.traceId,
              old_value: { status: "scheduled" },
              new_value: { status: "in_progress" },
            });
          } else if (
            (effectiveStatus === "completed" || effectiveStatus === "cancelled") &&
            (job.status === "in_progress" || job.status === "scheduled")
          ) {
            // Visit completed or cancelled — check sibling visits
            const siblingCounts = await client.query<{
              pending: string;
              completed: string;
            }>(
              `SELECT
                 COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) AS pending,
                 COUNT(*) FILTER (WHERE status = 'completed') AS completed
               FROM visits
               WHERE job_id = $1 AND account_id = $2`,
              [updated.job_id, session.accountId]
            );
            const { pending, completed: completedCount } = siblingCounts.rows[0];

            if (parseInt(pending) === 0) {
              // No active visits remain
              const newJobStatus = parseInt(completedCount) > 0 ? "completed" : "scheduled";
              if (job.status !== newJobStatus) {
                await client.query(
                  `UPDATE jobs SET status = $1, updated_at = now()
                   WHERE id = $2 AND account_id = $3`,
                  [newJobStatus, updated.job_id, session.accountId]
                );
                await appendAuditLog(client, {
                  account_id: session.accountId,
                  entity_type: "job",
                  entity_id: updated.job_id,
                  action: "update",
                  actor_id: session.userId,
                  trace_id: session.traceId,
                  old_value: { status: job.status },
                  new_value: { status: newJobStatus },
                });
              }
            } else if (effectiveStatus === "cancelled" && job.status === "in_progress") {
              // Cancelled visit but other visits still active — check if any
              // are still in_progress; if not, revert job to scheduled
              const stillActive = await client.query(
                `SELECT 1 FROM visits
                 WHERE job_id = $1 AND account_id = $2
                   AND status IN ('in_progress','arrived')
                 LIMIT 1`,
                [updated.job_id, session.accountId]
              );
              if (stillActive.rowCount === 0) {
                await client.query(
                  `UPDATE jobs SET status = 'scheduled', updated_at = now()
                   WHERE id = $1 AND account_id = $2`,
                  [updated.job_id, session.accountId]
                );
                await appendAuditLog(client, {
                  account_id: session.accountId,
                  entity_type: "job",
                  entity_id: updated.job_id,
                  action: "update",
                  actor_id: session.userId,
                  trace_id: session.traceId,
                  old_value: { status: "in_progress" },
                  new_value: { status: "scheduled" },
                });
              }
            }
          }
        }
      }

      // Seed condition snapshots from checklist dispositions on visit completion
      if (effectiveStatus === "completed" && updated.job_id) {
        const jobProp = await client.query<{ property_id: string | null }>(
          `SELECT property_id FROM jobs WHERE id = $1 AND account_id = $2`,
          [updated.job_id, session.accountId]
        );
        const propertyId = jobProp.rows[0]?.property_id;
        if (propertyId) {
          await seedConditionSnapshots(client, id, propertyId, session.accountId);
        }
      }

      // Auto-create a draft final invoice on visit completion so Nick can review
      // and send without starting from scratch.
      //
      // Guarded by:
      //   - No existing final/standard invoice for the job (deposit invoices don't block)
      //   - Standard-mode estimate only — multi_option estimates can't auto-invoice
      //     because we don't know which option the customer chose
      //   - At least one line item must exist (estimate items or visit parts)
      //
      // Uses a savepoint so a PG error inside this block cannot abort the outer
      // visit-completion transaction.
      if (effectiveStatus === "completed" && updated.job_id) {
        await client.query("SAVEPOINT before_auto_invoice");
        try {
          // Only block on final/standard invoices — deposit invoices are separate billing events.
          const existingFinal = await client.query<{ id: string }>(
            `SELECT id FROM invoices
             WHERE job_id = $1 AND account_id = $2
               AND invoice_kind IN ('final', 'standard')
               AND status NOT IN ('cancelled')
             LIMIT 1`,
            [updated.job_id, session.accountId]
          );

          if (existingFinal.rowCount === 0) {
            // Fetch job + approved estimate (prefer the one directly linked to this job)
            const jobRow = await client.query<{
              client_id: string;
              property_id: string | null;
              estimate_id: string | null;
              presentation_mode: string | null;
              deposit_cents: number | null;
            }>(
              `SELECT j.client_id, j.property_id,
                      e.id AS estimate_id,
                      e.presentation_mode,
                      e.deposit_cents
               FROM jobs j
               LEFT JOIN estimates e ON e.job_id = j.id
                 AND e.account_id = j.account_id
                 AND e.status = 'approved'
               WHERE j.id = $1 AND j.account_id = $2
               ORDER BY e.created_at DESC
               LIMIT 1`,
              [updated.job_id, session.accountId]
            );
            const job = jobRow.rows[0];

            if (job) {
              const lineItems: Array<{ description: string; quantity: number; unit_price_cents: number; sort_order: number }> = [];

              // Pull estimate line items only for standard-mode estimates.
              // Multi-option estimates have items split across competing options;
              // we can't know which was accepted, so fall through to visit_parts.
              if (job.estimate_id && job.presentation_mode !== "multi_option") {
                const estimateItems = await client.query<{
                  description: string;
                  quantity: string;
                  unit_price_cents: number;
                  sort_order: number;
                }>(
                  `SELECT description, quantity, unit_price_cents, sort_order
                   FROM estimate_line_items
                   WHERE estimate_id = $1
                     AND option_id IS NULL
                     AND visible_to_customer = true
                   ORDER BY sort_order`,
                  [job.estimate_id]
                );
                for (const item of estimateItems.rows) {
                  lineItems.push({
                    description: item.description,
                    quantity: parseFloat(item.quantity),
                    unit_price_cents: item.unit_price_cents,
                    sort_order: item.sort_order,
                  });
                }
              }

              // Fall back to billable visit parts when no estimate items are available.
              if (lineItems.length === 0) {
                const visitParts = await client.query<{
                  name: string;
                  quantity: string;
                  customer_price_cents: number;
                }>(
                  `SELECT name, quantity, customer_price_cents
                   FROM visit_parts
                   WHERE visit_id = $1 AND account_id = $2 AND customer_price_cents > 0
                   ORDER BY created_at`,
                  [id, session.accountId]
                );
                for (let i = 0; i < visitParts.rows.length; i++) {
                  const p = visitParts.rows[i];
                  lineItems.push({
                    description: p.name,
                    quantity: parseFloat(p.quantity),
                    unit_price_cents: p.customer_price_cents,
                    sort_order: i,
                  });
                }
              }

              if (lineItems.length > 0) {
                const subtotal = lineItems.reduce((s, li) => s + Math.round(li.quantity * li.unit_price_cents), 0);
                // Carry forward the deposit amount so the final invoice correctly
                // shows the balance owed rather than the full project total.
                const depositCents = job.deposit_cents ?? 0;
                const invoiceNumber = await generateInvoiceNumber(client, session.accountId);

                const invoiceRes = await client.query<{ id: string }>(
                  `INSERT INTO invoices
                     (account_id, client_id, job_id, property_id, estimate_id,
                      status, invoice_kind, invoice_number,
                      subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
                      created_by)
                   VALUES ($1, $2, $3, $4, $5, 'draft', 'final', $6, $7, 0, $7, 0, $8, $9)
                   RETURNING id`,
                  [
                    session.accountId,
                    job.client_id,
                    updated.job_id,
                    job.property_id,
                    job.estimate_id ?? null,
                    invoiceNumber,
                    subtotal,
                    depositCents,
                    session.userId,
                  ]
                );
                const invoiceId = invoiceRes.rows[0].id;

                for (let i = 0; i < lineItems.length; i++) {
                  const li = lineItems[i];
                  await client.query(
                    `INSERT INTO invoice_line_items
                       (invoice_id, description, quantity, unit_price_cents, total_cents, sort_order)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                      invoiceId,
                      li.description,
                      li.quantity,
                      li.unit_price_cents,
                      Math.round(li.quantity * li.unit_price_cents),
                      i,
                    ]
                  );
                }

                await appendAuditLog(client, {
                  account_id: session.accountId,
                  entity_type: "invoice",
                  entity_id: invoiceId,
                  action: "insert",
                  actor_id: session.userId,
                  trace_id: session.traceId,
                  new_value: {
                    source: "visit_completion",
                    visit_id: id,
                    job_id: updated.job_id,
                    estimate_id: job.estimate_id,
                    total_cents: subtotal,
                    deposit_cents: depositCents,
                  },
                });
              }
            }
          }
          await client.query("RELEASE SAVEPOINT before_auto_invoice");
        } catch (invoiceErr) {
          // Roll back only the invoice work; visit completion is preserved.
          await client.query("ROLLBACK TO SAVEPOINT before_auto_invoice");
          await client.query("RELEASE SAVEPOINT before_auto_invoice");
          logger.error("visit completion: auto-create invoice draft failed (non-fatal)", invoiceErr, { traceId: session.traceId });
        }
      }

      // Emit workflow events for automation cancellation and downstream processing
      if (effectiveStatus === "completed" || effectiveStatus === "cancelled") {
        await writeWorkflowEvent(client, {
          accountId: session.accountId,
          eventType: effectiveStatus === "completed" ? "visit.completed" : "visit.cancelled",
          entityType: "visit",
          entityId: id,
          payload: { jobId: updated.job_id },
        });
      }

      await client.query("COMMIT");
      return NextResponse.json({ data: updated });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits transition POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to transition visit",
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
