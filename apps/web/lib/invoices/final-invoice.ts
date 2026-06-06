/**
 * Shared logic for creating a draft final invoice from a completed job.
 *
 * Called from two places:
 *   - Visit transition (visit.completed) — with visitId for parts fallback
 *   - Job transition  (job.completed)   — without visitId
 *
 * Extracted to eliminate the copy-pasted INSERT blocks in each route and
 * to ensure both paths use the same reconcileFinalInvoice deposit-credit
 * logic (the visit transition previously hardcoded deposit_cents instead).
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
 *     roll back the visit/job completion that triggered it.
 */

import type { PoolClient } from "pg";
import { generateInvoiceNumber } from "@/lib/invoices/db";
import { reconcileFinalInvoice } from "@/lib/invoices/billing";
import { appendAuditLog } from "@/lib/db/audit";

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
    subtotal_cents: number | null;
    tax_cents: number | null;
    total_cents: number | null;
    estimate_notes: string | null;
    deposit_cents: number | null;
  }>(
    `SELECT j.client_id, j.property_id,
            e.id           AS estimate_id,
            e.presentation_mode,
            e.subtotal_cents,
            e.tax_cents,
            e.total_cents,
            e.notes        AS estimate_notes,
            e.deposit_cents
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT id, presentation_mode, subtotal_cents, tax_cents, total_cents,
              notes, deposit_cents
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

  // ── Collect line items ──────────────────────────────────────────────────
  const lineItems: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    sort_order: number;
  }> = [];

  if (job.estimate_id && job.presentation_mode !== "multi_option") {
    // Standard estimate: pull customer-visible items at the root level
    // (option_id IS NULL excludes items that belong to competing options).
    const estItems = await client.query<{
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
    for (const row of estItems.rows) {
      lineItems.push({
        description: row.description,
        quantity: parseFloat(row.quantity),
        unit_price_cents: row.unit_price_cents,
        sort_order: row.sort_order,
      });
    }
  }

  // Fallback: billable visit parts (only when no estimate items available)
  if (lineItems.length === 0 && visitId) {
    const parts = await client.query<{
      name: string;
      quantity: string;
      customer_price_cents: number;
    }>(
      `SELECT name, quantity, customer_price_cents
       FROM visit_parts
       WHERE visit_id = $1 AND account_id = $2 AND customer_price_cents > 0
       ORDER BY created_at`,
      [visitId, accountId]
    );
    for (let i = 0; i < parts.rows.length; i++) {
      const p = parts.rows[i];
      lineItems.push({
        description: p.name,
        quantity: parseFloat(p.quantity),
        unit_price_cents: p.customer_price_cents,
        sort_order: i,
      });
    }
  }

  // Nothing to invoice yet (no estimate items, no billable parts)
  if (lineItems.length === 0) return null;

  // ── Totals ───────────────────────────────────────────────────────────────
  // Prefer estimate subtotal/tax when available (more accurate for painting
  // and complex jobs). Fall back to summing line items.
  const subtotal =
    job.subtotal_cents ??
    lineItems.reduce((s, li) => s + Math.round(li.quantity * li.unit_price_cents), 0);
  const taxCents = job.tax_cents ?? 0;
  const totalCents = job.total_cents ?? subtotal + taxCents;

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
  const invoiceNumber = await generateInvoiceNumber(client, accountId);

  const invoiceRes = await client.query<{ id: string }>(
    `INSERT INTO invoices
       (account_id, client_id, job_id, estimate_id, property_id,
        status, invoice_kind, invoice_number,
        subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
        notes, created_by)
     VALUES ($1, $2, $3, $4, $5,
             'draft', 'final', $6,
             $7, $8, $9, 0, $10,
             $11, $12)
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
      userId,
    ]
  );
  const invoiceId = invoiceRes.rows[0].id;

  // ── Line items ───────────────────────────────────────────────────────────
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
      total_cents: totalCents,
      deposit_credit_cents: depositCreditCents,
      line_item_count: lineItems.length,
    },
  });

  return { invoiceId, lineItemCount: lineItems.length };
}
