/**
 * Shared logic for creating a draft final invoice from a completed job.
 *
 * Called only when the owner explicitly transitions the project to
 * `completed` (jobs transition). Visits and work orders never create
 * final invoices — they can only make the project ready for closeout.
 *
 * Idempotency:
 *   Returns null (and skips creation) if a final or standard invoice
 *   already exists for the job. The unique index
 *   idx_invoices_one_final_per_estimate (migration 104) is the hard
 *   database guarantee; this application-layer check is a fast-fail.
 *
 * Caller responsibilities:
 *   - Must be inside an active transaction with RLS context set.
 *   - Should wrap this call in a SAVEPOINT so invoice failures never
 *     roll back the job completion that triggered it.
 */

import type { PoolClient } from "pg";
import { generateInvoiceNumber } from "@/lib/invoices/db";
import { reconcileFinalInvoice } from "@/lib/invoices/billing";
import { appendAuditLog } from "@/lib/db/audit";
import {
  createInvoiceLineItem,
  recalculateInvoiceTotals,
  roundedQuarterHoursFromMinutes,
} from "@/lib/invoices/line-items";
import { trackedLaborMinutesFromActivityEntries } from "@/lib/invoices/tracked-labor";
import {
  appendEquipmentFromJobExpenses,
  appendMaterialsFromJobExpenses,
  equipmentLineItemsFromJobExpenses,
  materialLineItemsFromJobExpenses,
} from "@/lib/invoices/job-expenses";
import {
  LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  dueDateUponCompletion,
} from "@ai-fsm/domain";
import { loadTravelSettings } from "@/lib/travel/settings";
import {
  TRAVEL_LINE_MARKER,
  ensureInvoiceTravelLinesFromSnapshot,
  getTravelSnapshot,
} from "@/lib/travel/snapshots";

interface CreateFinalInvoiceParams {
  client: PoolClient;
  jobId: string;
  accountId: string;
  userId: string;
  /** When provided, visit parts are used as a line-item fallback when no
   *  estimate items exist (e.g. time-and-materials jobs with no formal estimate). */
  visitId?: string;
  traceId?: string;
}

interface CreateFinalInvoiceResult {
  invoiceId: string;
  lineItemCount: number;
}

/**
 * Creates a draft final invoice for a job, idempotently.
 *
 * Returns the result object on success, or null if a final/standard invoice
 * already exists (so callers never need to handle the "already done" case).
 */
export async function createDraftFinalInvoiceForJob(
  params: CreateFinalInvoiceParams
): Promise<CreateFinalInvoiceResult | null> {
  const { client, jobId, accountId, userId, visitId, traceId } = params;

  // ── Guard: skip if a final invoice already exists for this job ──────────
  // We gate on job_id (not estimate_id) so the check catches invoices created
  // by any path (visit completion, job completion, manual convert).
  const existingCheck = await client.query<{ id: string }>(
    `SELECT id FROM invoices
     WHERE job_id = $1 AND account_id = $2
       AND invoice_kind IN ('final', 'standard')
       AND status NOT IN ('cancelled')
     LIMIT 1`,
    [jobId, accountId]
  );
  if ((existingCheck.rowCount ?? 0) > 0) {
    return null;
  }

  // ── Fetch the job and its approved estimate ─────────────────────────────
  const jobRow = await client.query<{
    client_id: string;
    property_id: string | null;
    estimate_id: string | null;
    presentation_mode: string | null;
    pricing_mode: string | null;
    booking_pricing_mode: string | null;
    subtotal_cents: number | null;
    tax_cents: number | null;
    total_cents: number | null;
    estimate_notes: string | null;
    deposit_cents: number | null;
    travel_snapshot_id: string | null;
  }>(
    `SELECT j.client_id, j.property_id,
            e.id           AS estimate_id,
            e.presentation_mode,
            e.pricing_mode,
            e.subtotal_cents,
            e.tax_cents,
            e.total_cents,
            e.notes        AS estimate_notes,
            e.deposit_cents,
            e.travel_snapshot_id,
            (
              SELECT br.pricing_mode
              FROM booking_requests br
              WHERE br.job_id = j.id AND br.account_id = j.account_id
              ORDER BY br.created_at DESC
              LIMIT 1
            ) AS booking_pricing_mode
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT id, presentation_mode, pricing_mode, subtotal_cents, tax_cents, total_cents,
              notes, deposit_cents, travel_snapshot_id
       FROM estimates
       WHERE job_id = j.id AND account_id = j.account_id AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT 1
     ) e ON true
     WHERE j.id = $1 AND j.account_id = $2`,
    [jobId, accountId]
  );

  if ((jobRow.rowCount ?? 0) === 0) return null;
  const job = jobRow.rows[0];

  // T&M (hourly_internal): estimate lines are budget/allowance only.
  // Final invoice must bill actual tracked labor + materials, not the estimate.
  const pricingMode = job.pricing_mode ?? job.booking_pricing_mode ?? null;
  const isTm = pricingMode === "hourly_internal";

  // ── Collect line items ──────────────────────────────────────────────────
  const lineItems: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    line_item_type: "labor" | "materials" | "handling_fee" | "adjustment";
    sort_order: number;
  }> = [];
  let shouldUseEstimateTotals = false;
  /** When true, materials are appended after insert (source_expense_id tracking). */
  let appendTmMaterialsAfterCreate = false;
  /** When true, lift/equipment expenses are appended after insert. */
  let appendTmEquipmentAfterCreate = false;
  /** Material + handling + equipment preview used only for totals before insert. */
  let materialPreviewSubtotal = 0;

  if (
    !isTm &&
    job.estimate_id &&
    job.presentation_mode !== "multi_option"
  ) {
    // Flat-rate / fixed estimate: pull customer-visible items at the root level
    // (option_id IS NULL excludes items that belong to competing options).
    const estItems = await client.query<{
      description: string;
      quantity: string;
      unit_price_cents: number;
      line_item_type: "labor" | "materials" | "handling_fee" | "adjustment";
      sort_order: number;
      adjustment_type: string | null;
    }>(
      `SELECT description, quantity, unit_price_cents, line_item_type, sort_order,
              adjustment_type
       FROM estimate_line_items
       WHERE estimate_id = $1
         AND option_id IS NULL
         AND visible_to_customer = true
       ORDER BY sort_order`,
      [job.estimate_id]
    );
    for (const row of estItems.rows) {
      // Skip estimate travel lines — re-materialize as itemized invoice lines
      // from the travel snapshot so mileage + travel time both appear.
      if (
        row.adjustment_type === "travel_surcharge" ||
        row.description.includes(TRAVEL_LINE_MARKER) ||
        row.description.toLowerCase().includes("travel and service-area")
      ) {
        continue;
      }
      lineItems.push({
        description: row.description,
        quantity: parseFloat(row.quantity),
        unit_price_cents: row.unit_price_cents,
        line_item_type: row.line_item_type,
        sort_order: row.sort_order,
      });
    }
    shouldUseEstimateTotals = lineItems.length > 0;
  }

  // Actuals path: T&M jobs always, or flat jobs with no estimate line items.
  // Labor is sourced from the time truth (activity_entries job_work).
  // Materials come from job expenses (receipts logged in the app).
  if (isTm || lineItems.length === 0) {
    if (isTm) {
      lineItems.length = 0;
      shouldUseEstimateTotals = false;
    }

    const trackedMinutes = await trackedLaborMinutesFromActivityEntries(
      client,
      accountId,
      jobId
    );
    const billableHours = roundedQuarterHoursFromMinutes(trackedMinutes);
    if (billableHours > 0) {
      let billRate = LABOR_CUSTOMER_RATE_CENTS_PER_HOUR;
      // Prefer the customer labor rate from the approved estimate (T&M budget line).
      if (job.estimate_id) {
        const rateRow = await client.query<{ unit_price_cents: number }>(
          `SELECT unit_price_cents
           FROM estimate_line_items
           WHERE estimate_id = $1
             AND option_id IS NULL
             AND unit_price_cents > 0
             AND (
               line_item_type = 'labor'
               OR lower(description) LIKE '%labor%'
             )
           ORDER BY sort_order ASC
           LIMIT 1`,
          [job.estimate_id]
        );
        if (rateRow.rows[0]?.unit_price_cents) {
          billRate = rateRow.rows[0].unit_price_cents;
        } else {
          try {
            const { loadPricingSettings } = await import("@/lib/pricing/settings");
            const settings = await loadPricingSettings(client, accountId);
            billRate = settings.labor_billing_cents_per_hour;
          } catch {
            /* pre-migration fallback */
          }
        }
      } else {
        try {
          const { loadPricingSettings } = await import("@/lib/pricing/settings");
          const settings = await loadPricingSettings(client, accountId);
          billRate = settings.labor_billing_cents_per_hour;
        } catch {
          /* pre-migration fallback */
        }
      }
      lineItems.push({
        description: "Labor",
        quantity: billableHours,
        unit_price_cents: billRate,
        line_item_type: "labor",
        sort_order: 0,
      });
    }

    // Job materials receipts → invoice lines (with handling fee when configured).
    // Preview for totals; insert happens after invoice create so source_expense_id is set.
    const materialPreview = await materialLineItemsFromJobExpenses(
      client,
      accountId,
      jobId,
      lineItems.length
    );
    if (materialPreview.length > 0) {
      appendTmMaterialsAfterCreate = true;
      materialPreviewSubtotal += materialPreview.reduce(
        (s, m) => s + Math.round(m.quantity * m.unit_price_cents),
        0
      );
    }

    // Lift / equipment (tag or lift heuristic) — billed at cost, no handling fee.
    const equipmentPreview = await equipmentLineItemsFromJobExpenses(
      client,
      accountId,
      jobId,
      lineItems.length + materialPreview.length
    );
    if (equipmentPreview.length > 0) {
      appendTmEquipmentAfterCreate = true;
      materialPreviewSubtotal += equipmentPreview.reduce(
        (s, m) => s + Math.round(m.quantity * m.unit_price_cents),
        0
      );
    }
  }

  // Fallback: billable visit parts when still no materials/equipment from expenses.
  // Scope: single visit when provided, else all visits on the job (T&M multi-day).
  if (
    !appendTmMaterialsAfterCreate &&
    !appendTmEquipmentAfterCreate &&
    (isTm || job.estimate_id == null || !shouldUseEstimateTotals)
  ) {
    const parts = visitId
      ? await client.query<{
          name: string;
          quantity: string;
          customer_price_cents: number;
        }>(
          `SELECT name, quantity, customer_price_cents
           FROM visit_parts
           WHERE visit_id = $1 AND account_id = $2 AND customer_price_cents > 0
           ORDER BY created_at`,
          [visitId, accountId]
        )
      : await client.query<{
          name: string;
          quantity: string;
          customer_price_cents: number;
        }>(
          `SELECT vp.name, vp.quantity, vp.customer_price_cents
           FROM visit_parts vp
           JOIN visits v ON v.id = vp.visit_id AND v.account_id = vp.account_id
           WHERE v.job_id = $1 AND vp.account_id = $2 AND vp.customer_price_cents > 0
           ORDER BY vp.created_at`,
          [jobId, accountId]
        );
    const partSortStart = lineItems.length;
    for (let i = 0; i < parts.rows.length; i++) {
      const p = parts.rows[i];
      lineItems.push({
        description: p.name,
        quantity: parseFloat(p.quantity),
        unit_price_cents: p.customer_price_cents,
        line_item_type: "materials",
        sort_order: partSortStart + i,
      });
    }
  }

  // Nothing to invoice yet (no estimate items, no actuals, no billable parts)
  if (lineItems.length === 0 && materialPreviewSubtotal === 0) return null;

  // ── Totals ───────────────────────────────────────────────────────────────
  // Flat-rate: prefer estimate subtotal/tax when available.
  // T&M: always sum actual line items (estimate is budget only).
  const calculatedSubtotal =
    lineItems.reduce(
      (s, li) => s + Math.round(li.quantity * li.unit_price_cents),
      0
    ) + materialPreviewSubtotal;
  const subtotal = shouldUseEstimateTotals && job.subtotal_cents != null
    ? job.subtotal_cents
    : calculatedSubtotal;
  const taxCents = shouldUseEstimateTotals ? job.tax_cents ?? 0 : 0;
  const totalCents = shouldUseEstimateTotals && job.total_cents != null
    ? job.total_cents
    : subtotal + taxCents;

  // ── Deposit reconciliation ───────────────────────────────────────────────
  // Use reconcileFinalInvoice so voided deposit invoices are excluded and the
  // reconciliation note names the deposit invoice number(s).
  let depositCreditCents = 0;
  let reconciliationNote: string | null = null;

  if (job.estimate_id) {
    const depositRows = await client.query<{
      invoice_number: string;
      total_cents: number;
      status: string;
    }>(
      `SELECT invoice_number, total_cents, status
       FROM invoices
       WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind = 'deposit'`,
      [job.estimate_id, accountId]
    );
    const rec = reconcileFinalInvoice({
      invoiceTotalCents: totalCents,
      depositInvoices: depositRows.rows,
    });
    depositCreditCents = rec.depositCreditCents;
    reconciliationNote = rec.reconciliationNote;
  }

  const finalNotes = reconciliationNote
    ? `${job.estimate_notes ? `${job.estimate_notes}\n\n` : ""}${reconciliationNote}`
    : job.estimate_notes ?? null;

  // ── Create invoice ───────────────────────────────────────────────────────
  // Payment terms: due upon completion. Prefer visit completed_at when known.
  let completionAt: Date | string = new Date();
  if (visitId) {
    const visitRow = await client.query<{ completed_at: string | null }>(
      `SELECT completed_at::text FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, accountId]
    );
    if (visitRow.rows[0]?.completed_at) {
      completionAt = visitRow.rows[0].completed_at;
    }
  }
  const dueDate = dueDateUponCompletion(completionAt);

  const invoiceNumber = await generateInvoiceNumber(client, accountId);

  const invoiceRes = await client.query<{ id: string }>(
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
      accountId,
      job.client_id,
      jobId,
      job.estimate_id ?? null,
      job.property_id,
      invoiceNumber,
      subtotal,
      taxCents,
      totalCents,
      depositCreditCents,
      finalNotes,
      dueDate,
      userId,
      job.travel_snapshot_id,
      job.travel_snapshot_id ? "estimated" : null,
    ]
  );
  const invoiceId = invoiceRes.rows[0].id;

  // ── Line items ───────────────────────────────────────────────────────────
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    await createInvoiceLineItem(client, invoiceId, {
      description: li.description,
      quantity: li.quantity,
      unit_price_cents: li.unit_price_cents,
      line_item_type: li.line_item_type,
      sort_order: i,
    });
  }

  // T&M materials + equipment: link expenses with source_expense_id, then
  // re-sum totals so the draft matches what the job ledger showed as actuals.
  let materialLineCount = 0;
  if (appendTmMaterialsAfterCreate || appendTmEquipmentAfterCreate) {
    if (appendTmMaterialsAfterCreate) {
      const { lineItems: materialLines } = await appendMaterialsFromJobExpenses(
        client,
        invoiceId,
        accountId,
        jobId
      );
      materialLineCount += materialLines.length;
    }
    if (appendTmEquipmentAfterCreate) {
      const { lineItems: equipmentLines } = await appendEquipmentFromJobExpenses(
        client,
        invoiceId,
        accountId,
        jobId
      );
      materialLineCount += equipmentLines.length;
    }
    const totals = await recalculateInvoiceTotals(client, invoiceId, accountId);
    // Re-apply deposit credit against the post-actuals total.
    if (job.estimate_id && depositCreditCents > 0) {
      const rec = reconcileFinalInvoice({
        invoiceTotalCents: totals.total_cents,
        depositInvoices: (
          await client.query<{
            invoice_number: string;
            total_cents: number;
            status: string;
          }>(
            `SELECT invoice_number, total_cents, status
             FROM invoices
             WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind = 'deposit'`,
            [job.estimate_id, accountId]
          )
        ).rows,
      });
      await client.query(
        `UPDATE invoices
         SET deposit_cents = $1,
             notes = $2,
             updated_at = now()
         WHERE id = $3 AND account_id = $4`,
        [
          rec.depositCreditCents,
          rec.reconciliationNote
            ? `${job.estimate_notes ? `${job.estimate_notes}\n\n` : ""}${rec.reconciliationNote}`
            : job.estimate_notes ?? null,
          invoiceId,
          accountId,
        ]
      );
      depositCreditCents = rec.depositCreditCents;
    }
  }

  // Itemized travel (mileage + travel time) so customer-facing invoices list them
  let travelLineCount = 0;
  if (job.travel_snapshot_id) {
    const snap = await getTravelSnapshot(client, job.travel_snapshot_id);
    if (snap && snap.total_travel_charge_cents > 0 && snap.charge_mode !== "waive") {
      const travelSettings = await loadTravelSettings(client, accountId);
      travelLineCount = await ensureInvoiceTravelLinesFromSnapshot(client, {
        invoiceId,
        snapshot: snap,
        settingsLineTitle: travelSettings.customer_facing_line_title,
        settingsLineDescription: travelSettings.customer_facing_description,
        replaceExisting: true,
      });
      await client.query(
        `UPDATE travel_calculation_snapshots
         SET invoice_id = $1, updated_at = now()
         WHERE id = $2 AND account_id = $3 AND invoice_id IS NULL`,
        [invoiceId, job.travel_snapshot_id, accountId]
      );
      // Travel lines change the total — re-sum after attach.
      await recalculateInvoiceTotals(client, invoiceId, accountId);
    }
  }

  const lineItemCount = lineItems.length + materialLineCount + travelLineCount;

  // ── Audit log ────────────────────────────────────────────────────────────
  await appendAuditLog(client, {
    account_id: accountId,
    entity_type: "invoice",
    entity_id: invoiceId,
    action: "insert",
    actor_id: userId,
    trace_id: traceId,
    new_value: {
      source: visitId ? "visit_completion" : "job_completion",
      job_id: jobId,
      visit_id: visitId ?? null,
      estimate_id: job.estimate_id,
      pricing_mode: pricingMode,
      billed_from_actuals: isTm,
      total_cents: totalCents,
      deposit_credit_cents: depositCreditCents,
      line_item_count: lineItemCount,
      travel_line_count: travelLineCount,
      material_line_count: materialLineCount,
    },
  });

  return { invoiceId, lineItemCount };
}
