import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext, generateInvoiceNumber, loadCreditedInvoicesForEstimate } from "@/lib/invoices/db";
import { reconcileFinalInvoice } from "@/lib/invoices/billing";
import { logger } from "@/lib/logger";
import { loadTravelSettings } from "@/lib/travel/settings";
import {
  ensureInvoiceTravelLinesFromSnapshot,
  getTravelSnapshot,
} from "@/lib/travel/snapshots";
import { resolveIssueDueDate } from "@ai-fsm/domain";
import { addOnLines, approvedLines, invoiceLinesFor, invoiceMoneyFor, type ConvertSourceLine } from "@/lib/estimates/approved-lines";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/[id]/convert
 *
 * Convert an approved estimate into a draft invoice (immutable snapshot).
 *
 * Business rules:
 * - Estimate must be in `approved` status
 * - Only owner/admin may convert
 * - Idempotent: repeated calls return the existing invoice (no duplicates)
 * - Line items copied with estimate_line_item_id FK for traceability
 * - Shared lines plus the chosen option only; hidden lines fold into Included work
 * - Multi-option with no chosen option is refused (422)
 * - Totals snapshotted in cents at conversion time. A standard estimate keeps
 *   its stored total. A multi-option invoice is priced from the chosen lines.
 * - Audit record written on first conversion
 *
 * Source evidence:
 *   Dovelite: estimate-to-invoice conversion UX pattern (button on approved estimate detail)
 *   Myprogram: invariant discipline — immutable snapshot, no mutation after creation
 *   AI-FSM: db/migrations/001_core_schema.sql (invoices.estimate_id FK, line_items.estimate_line_item_id FK)
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      // 1. Fetch estimate with line items
      const estimateResult = await client.query(
        `SELECT e.id, e.status, e.client_id, e.job_id, e.property_id,
                e.subtotal_cents, e.tax_cents, e.total_cents, e.deposit_cents,
                e.notes, e.created_by, e.travel_snapshot_id,
                e.presentation_mode, e.selected_option_id,
                e.risk_adjustment_cents, e.travel_surcharge_cents, e.approved_add_ons
         FROM estimates e
         WHERE e.id = $1 AND e.account_id = $2`,
        [id, session.accountId]
      );

      if (estimateResult.rowCount === 0) {
        throw Object.assign(new Error("Estimate not found"), {
          code: "NOT_FOUND",
        });
      }

      const estimate = estimateResult.rows[0] as {
        id: string;
        status: string;
        client_id: string;
        job_id: string | null;
        property_id: string | null;
        subtotal_cents: number;
        tax_cents: number;
        total_cents: number;
        deposit_cents: number;
        notes: string | null;
        created_by: string;
        travel_snapshot_id: string | null;
        presentation_mode: string;
        selected_option_id: string | null;
        risk_adjustment_cents: number;
        travel_surcharge_cents: number;
        approved_add_ons: { label: string; price_cents: number }[] | null;
      };

      // 2. Enforce prerequisite: only approved estimates can be converted
      if (estimate.status !== "approved") {
        throw Object.assign(
          new Error(
            `Only approved estimates can be converted to invoices (current status: ${estimate.status})`
          ),
          { code: "INVALID_TRANSITION" }
        );
      }

      // 3. Idempotency guard: only a prior FINAL invoice counts as "already
      //    converted". A deposit invoice (created on approval) must NOT short
      //    circuit this — otherwise Convert would return the deposit invoice
      //    and the real final invoice would never be created.
      const existingFinal = await client.query<{
        id: string;
        status: string;
      }>(
        `SELECT id, status FROM invoices
         WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind = 'final'
         LIMIT 1`,
        [id, session.accountId]
      );

      if (existingFinal.rowCount !== null && existingFinal.rowCount > 0) {
        // Already converted — return existing final invoice (idempotent)
        return {
          invoice_id: existingFinal.rows[0].id,
          invoice_status: existingFinal.rows[0].status,
          created: false,
        };
      }

      // A Good/Better/Best estimate has no single approved price until the
      // customer picks. Checked after the idempotency return so a second
      // convert still finds the invoice.
      if (estimate.presentation_mode === "multi_option" && !estimate.selected_option_id) {
        throw Object.assign(new Error("Choose the customer's option first"), { code: "OPTION_REQUIRED" });
      }

      // 4. Approved lines only: shared lines plus the chosen option. Hidden
      //    lines fold into one Included work line. Risk and a non-snapshot
      //    travel surcharge become their own lines so the lines add up.
      const lineItemsResult = await client.query(
        `SELECT id, option_id, description, quantity, unit_price_cents, unit_cost_cents, total_cents, sort_order,
                adjustment_type, visible_to_customer, line_item_type
         FROM estimate_line_items
         WHERE estimate_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [id]
      );
      const sourceLines: ConvertSourceLine[] = (lineItemsResult.rows as Array<{
        id: string;
        option_id: string | null;
        description: string;
        quantity: string | number;
        unit_price_cents: string | number;
        unit_cost_cents: string | number | null;
        total_cents: string | number;
        sort_order: string | number;
        adjustment_type: string | null;
        visible_to_customer: boolean;
        line_item_type: ConvertSourceLine["line_item_type"];
      }>).map((item) => ({
        id: item.id,
        option_id: item.option_id,
        description: item.description,
        quantity: Number(item.quantity),
        unit_price_cents: Number(item.unit_price_cents),
        unit_cost_cents: item.unit_cost_cents == null ? null : Number(item.unit_cost_cents),
        total_cents: Number(item.total_cents),
        sort_order: Number(item.sort_order),
        adjustment_type: item.adjustment_type,
        visible_to_customer: item.visible_to_customer,
        line_item_type: item.line_item_type,
      }));
      const chosen = approvedLines(sourceLines, estimate.selected_option_id);
      const quoteLines = invoiceLinesFor(
        {
          risk_adjustment_cents: Number(estimate.risk_adjustment_cents),
          travel_surcharge_cents: Number(estimate.travel_surcharge_cents),
          travel_snapshot_id: estimate.travel_snapshot_id,
        },
        chosen,
      );
      // TASK-225: add-ons the customer ticked when approving become their own lines.
      const addOns = estimate.approved_add_ons ?? [];
      const lineItems = [...quoteLines, ...addOnLines(addOns, quoteLines)];

      let optionMoney: { subtotal_cents: number; tax_cents: number } | null = null;
      if (estimate.presentation_mode === "multi_option" && estimate.selected_option_id) {
        const optionResult = await client.query<{ subtotal_cents: number; tax_cents: number }>(
          `SELECT subtotal_cents, tax_cents FROM estimate_options
           WHERE id = $1 AND estimate_id = $2`,
          [estimate.selected_option_id, id],
        );
        if (optionResult.rowCount === 0) {
          throw Object.assign(new Error("That option is not part of this estimate"), { code: "OPTION_REQUIRED" });
        }
        optionMoney = {
          subtotal_cents: Number(optionResult.rows[0].subtotal_cents),
          tax_cents: Number(optionResult.rows[0].tax_cents),
        };
      }

      // Snapshot travel is re-added below. Its charge is already inside a
      // standard estimate's stored total. A multi-option parent total is not
      // the chosen option, so the charge has to be added to the drafted sum.
      let snapshotTravelCents = 0;
      const snap = estimate.travel_snapshot_id
        ? await getTravelSnapshot(client, estimate.travel_snapshot_id)
        : null;
      if (snap && snap.total_travel_charge_cents > 0 && snap.charge_mode !== "waive") {
        snapshotTravelCents = snap.total_travel_charge_cents;
      }
      const money = invoiceMoneyFor({
        presentation_mode: estimate.presentation_mode,
        subtotal_cents: Number(estimate.subtotal_cents),
        tax_cents: Number(estimate.tax_cents),
        total_cents: Number(estimate.total_cents),
        option: optionMoney,
        drafted_lines: lineItems,
        snapshot_travel_cents: snapshotTravelCents,
        add_on_cents: addOns.reduce((sum, a) => sum + a.price_cents, 0),
      });

      // 3b. Reconcile against any deposit/progress invoices already billed so the
      //     final invoice credits them and the stages never double-bill.
      const reconciliation = reconcileFinalInvoice({
        invoiceTotalCents: money.total_cents,
        depositInvoices: await loadCreditedInvoicesForEstimate(client, id, session.accountId),
      });

      // 5. Generate unique invoice number (inside transaction to avoid race)
      const invoiceNumber = await generateInvoiceNumber(
        client,
        session.accountId
      );

      // 6. Create the FINAL invoice as an immutable snapshot of the approved
      //    estimate. It carries the full project total; deposit_cents holds the
      //    deposit already billed so the generated balance_cents excludes it.
      const finalNotes = reconciliation.reconciliationNote
        ? `${estimate.notes ? `${estimate.notes}\n\n` : ""}${reconciliation.reconciliationNote}`
        : estimate.notes;

      // TASK-078: due upon completion — a final invoice tied to an open job has no
      // due date yet (filled when the job is marked complete).
      const jobStatus = estimate.job_id
        ? (
            await client.query<{ status: string }>(
              `SELECT status FROM jobs WHERE id = $1 AND account_id = $2`,
              [estimate.job_id, session.accountId],
            )
          ).rows[0]?.status ?? null
        : null;
      const finalDueDate = resolveIssueDueDate({ invoiceKind: "final", jobStatus });

      const invoiceResult = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, estimate_id, property_id,
            status, invoice_kind, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
            notes, due_date, created_by, travel_snapshot_id, travel_billing_mode)
         VALUES ($1, $2, $3, $4, $5,
                 'draft', 'final', $6,
                 $7, $8, $9, 0, $10,
                 $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          session.accountId,
          estimate.client_id,
          estimate.job_id,
          id, // estimate_id FK
          estimate.property_id,
          invoiceNumber,
          money.subtotal_cents,
          money.tax_cents,
          money.total_cents,
          reconciliation.depositCreditCents,
          finalNotes,
          finalDueDate, // TASK-078: null until job completes
          session.userId,
          estimate.travel_snapshot_id,
          estimate.travel_snapshot_id ? "estimated" : null,
        ]
      );
      const invoiceId = invoiceResult.rows[0].id;

      // Carry travel snapshot forward (do not recalculate — rate/charge frozen at estimate time)
      if (estimate.travel_snapshot_id) {
        await client.query(
          `UPDATE travel_calculation_snapshots
           SET invoice_id = $1, updated_at = now()
           WHERE id = $2 AND account_id = $3 AND invoice_id IS NULL`,
          [invoiceId, estimate.travel_snapshot_id, session.accountId]
        );
      }

      // 7. Copy line items with traceability FK (estimate_line_item_id)
      for (const item of lineItems) {
        await client.query(
          `INSERT INTO invoice_line_items
             (invoice_id, estimate_line_item_id, description, quantity, unit_price_cents, total_cents, sort_order,
              unit_cost_cents, line_item_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            invoiceId,
            item.estimate_line_item_id,
            item.description,
            item.quantity,
            item.unit_price_cents,
            item.total_cents,
            item.sort_order,
            item.unit_cost_cents,
            item.line_item_type,
          ]
        );
      }

      // 7b. Materialize itemized travel lines (mileage + travel time) from the
      //     carried snapshot so the invoice itemization always shows travel —
      //     even when the estimate used include_in_labor (surcharge field only).
      if (snap && snap.total_travel_charge_cents > 0 && snap.charge_mode !== "waive") {
        const travelSettings = await loadTravelSettings(client, session.accountId);
        await ensureInvoiceTravelLinesFromSnapshot(client, {
          invoiceId,
          snapshot: snap,
          settingsLineTitle: travelSettings.customer_facing_line_title,
          settingsLineDescription: travelSettings.customer_facing_description,
          replaceExisting: true,
        });
      }

      // 8. Audit log the conversion event
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          source: "estimate_conversion",
          estimate_id: id,
          invoice_number: invoiceNumber,
          invoice_kind: "final",
          total_cents: money.total_cents,
          deposit_credit_cents: reconciliation.depositCreditCents,
          balance_due_cents: reconciliation.balanceDueCents,
          line_item_count: lineItems.length,
        },
      });

      return {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        invoice_status: "draft",
        deposit_credit_cents: reconciliation.depositCreditCents,
        balance_due_cents: reconciliation.balanceDueCents,
        created: true,
      };
    });

    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
    });
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

    if (err.code === "OPTION_REQUIRED") {
      return NextResponse.json(
        {
          error: {
            code: "OPTION_REQUIRED",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 422 }
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

    logger.error("POST /api/v1/estimates/[id]/convert error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to convert estimate to invoice",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
