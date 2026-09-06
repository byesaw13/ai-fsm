/**
 * Service-minimum floor on an invoice (TASK-119 slice 2).
 *
 * Ensures an invoice's total reaches the account's configured
 * `minimum_service_fee_cents` by maintaining a single "Service minimum"
 * adjustment line for the shortfall — reusing that one configured minimum
 * rather than inventing a second. Applied at finalization (draft→sent).
 *
 * The decision is a pure function (`planServiceMinimum`, unit-tested); the DB
 * wrapper (`applyServiceMinimum`) just executes it.
 */
import type { PoolClient } from "pg";
import { serviceMinimumAdjustmentCents } from "./tracked-labor";
import {
  createInvoiceLineItem,
  updateInvoiceLineItem,
  type InvoiceTotals,
} from "./line-items";

/** Description that marks the single auto-managed minimum-adjustment line. */
export const SERVICE_MINIMUM_LABEL = "Service minimum";

/**
 * Which invoices the service-minimum floor may touch. Excludes:
 *  - deposit invoices (a partial payment with a precomputed total and no line
 *    items — flooring would rewrite the deposit amount),
 *  - invoices whose linked estimate carries an approved below-minimum override
 *    (`minimum_service_override_reason`) — the customer agreed to that price.
 * Standard / final invoices with no override are eligible.
 */
export function isServiceMinimumEligible(input: {
  invoiceKind: string;
  minimumServiceOverrideReason: string | null;
}): boolean {
  if (input.invoiceKind === "deposit") return false;
  if (input.minimumServiceOverrideReason) return false;
  return true;
}

interface MinLine {
  total_cents: number;
  is_service_minimum: boolean;
}

export type ServiceMinimumPlan =
  | { action: "none" }
  | { action: "create"; amountCents: number }
  | { action: "update"; amountCents: number }
  | { action: "remove" };

/**
 * Decide what to do with the minimum-adjustment line. Base = every line EXCEPT
 * the existing minimum line (so recomputing never compounds). If the base is
 * short, create/update the top-up; if it now meets the minimum, remove a stale
 * top-up. Pure.
 */
export function planServiceMinimum(lines: MinLine[], minimumCents: number): ServiceMinimumPlan {
  const baseCents = lines
    .filter((l) => !l.is_service_minimum)
    .reduce((sum, l) => sum + l.total_cents, 0);
  const shortfall = serviceMinimumAdjustmentCents(baseCents, minimumCents);
  const hasExisting = lines.some((l) => l.is_service_minimum);

  if (shortfall > 0) {
    return { action: hasExisting ? "update" : "create", amountCents: shortfall };
  }
  return hasExisting ? { action: "remove" } : { action: "none" };
}

/**
 * Apply the service minimum to a draft invoice: maintain the single
 * "Service minimum" adjustment line and recalculate totals. Idempotent.
 * Caller must have the invoice's RLS/session context set (finalize path).
 */
export async function applyServiceMinimum(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
): Promise<InvoiceTotals> {
  // Lock the invoice row for the whole plan+apply so two overlapping sends can't
  // both plan `create` and double-insert the line. Also carries current totals
  // (incl. tax) so we preserve tax rather than zeroing it.
  const invRes = await client.query<InvoiceTotals>(
    `SELECT subtotal_cents, tax_cents, total_cents, paid_cents, balance_cents
       FROM invoices WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [invoiceId, accountId],
  );
  const current = invRes.rows[0];
  if (!current) throw new Error("applyServiceMinimum: invoice not found");

  const { loadPricingSettings } = await import("@/lib/pricing/settings");
  const minimumCents = (await loadPricingSettings(client, accountId)).minimum_service_fee_cents;

  const { rows } = await client.query<{ id: string; total_cents: number; line_item_type: string; description: string }>(
    `SELECT id, total_cents, line_item_type, description
       FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId],
  );
  const isMin = (r: { line_item_type: string; description: string }) =>
    r.line_item_type === "adjustment" && r.description === SERVICE_MINIMUM_LABEL;

  const plan = planServiceMinimum(
    rows.map((r) => ({ total_cents: Number(r.total_cents), is_service_minimum: isMin(r) })),
    minimumCents,
  );

  // Nothing to change → don't touch the invoice (avoids needlessly rewriting
  // totals / clobbering tax on an already-fine invoice).
  if (plan.action === "none") return current;

  const existing = rows.find(isMin);
  if (plan.action === "create") {
    await createInvoiceLineItem(client, invoiceId, {
      description: SERVICE_MINIMUM_LABEL,
      quantity: 1,
      unit_price_cents: plan.amountCents,
      line_item_type: "adjustment",
    });
  } else if (plan.action === "update" && existing) {
    await updateInvoiceLineItem(client, invoiceId, existing.id, {
      description: SERVICE_MINIMUM_LABEL,
      quantity: 1,
      unit_price_cents: plan.amountCents,
      line_item_type: "adjustment",
    });
  } else if (plan.action === "remove" && existing) {
    await client.query(`DELETE FROM invoice_line_items WHERE id = $1 AND invoice_id = $2`, [
      existing.id,
      invoiceId,
    ]);
  }

  // Recompute subtotal from the lines and PRESERVE existing tax (unlike
  // recalculateInvoiceTotals, which hardcodes tax to 0).
  const sums = await client.query<{ subtotal_cents: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::bigint AS subtotal_cents
       FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId],
  );
  const subtotalCents = Math.max(0, Number(sums.rows[0]?.subtotal_cents ?? 0));
  const totalCents = subtotalCents + current.tax_cents;
  const updated = await client.query<InvoiceTotals>(
    `UPDATE invoices
        SET subtotal_cents = $1, total_cents = $2, updated_at = now()
      WHERE id = $3 AND account_id = $4
      RETURNING subtotal_cents, tax_cents, total_cents, paid_cents, balance_cents`,
    [subtotalCents, totalCents, invoiceId, accountId],
  );
  return updated.rows[0];
}
