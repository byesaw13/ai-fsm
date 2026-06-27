import type { PoolClient } from "pg";
import { LABOR_CUSTOMER_RATE_CENTS_PER_HOUR } from "@ai-fsm/domain";

export const INVOICE_LINE_ITEM_TYPES = ["labor", "materials", "handling_fee", "adjustment"] as const;
export type InvoiceLineItemType = (typeof INVOICE_LINE_ITEM_TYPES)[number];

export interface InvoiceTotals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
}

export interface InvoiceLineItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type: InvoiceLineItemType;
  sort_order: number;
  created_at?: string;
}

export function roundedQuarterHoursFromMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * 4) / 4;
}

export async function assertDraftInvoice(
  client: PoolClient,
  invoiceId: string,
  accountId: string
): Promise<{ id: string; status: string; job_id: string | null; paid_cents: number; deposit_cents: number }> {
  const result = await client.query<{
    id: string;
    status: string;
    job_id: string | null;
    paid_cents: number;
    deposit_cents: number;
  }>(
    `SELECT id, status, job_id, paid_cents, deposit_cents
     FROM invoices
     WHERE id = $1 AND account_id = $2`,
    [invoiceId, accountId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw Object.assign(new Error("Invoice not found"), { code: "NOT_FOUND" });
  }

  const invoice = result.rows[0];
  if (invoice.status !== "draft") {
    throw Object.assign(new Error("Only draft invoices may be edited"), {
      code: "IMMUTABLE_ENTITY",
    });
  }

  return invoice;
}

export async function recalculateInvoiceTotals(
  client: PoolClient,
  invoiceId: string,
  accountId: string
): Promise<InvoiceTotals> {
  const totals = await client.query<{ subtotal_cents: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::bigint AS subtotal_cents
     FROM invoice_line_items
     WHERE invoice_id = $1`,
    [invoiceId]
  );
  // Line items can include negative 'adjustment' (discount) lines, but the
  // invoice rollup can't go below $0 (the invoices subtotal/total checks are
  // >= 0, and you can't owe a negative amount). Clamp the discounted rollup at 0.
  const subtotalCents = Math.max(0, Number(totals.rows[0]?.subtotal_cents ?? 0));
  const taxCents = 0;
  const totalCents = subtotalCents + taxCents;

  const updated = await client.query<InvoiceTotals>(
    `UPDATE invoices
     SET subtotal_cents = $1,
         tax_cents = $2,
         total_cents = $3,
         updated_at = now()
     WHERE id = $4 AND account_id = $5
     RETURNING subtotal_cents, tax_cents, total_cents, paid_cents, balance_cents`,
    [subtotalCents, taxCents, totalCents, invoiceId, accountId]
  );

  return updated.rows[0];
}

export async function createInvoiceLineItem(
  client: PoolClient,
  invoiceId: string,
  input: {
    description: string;
    quantity: number;
    unit_price_cents: number;
    line_item_type: InvoiceLineItemType;
    sort_order?: number;
  }
): Promise<InvoiceLineItemRow> {
  const totalCents = Math.round(input.quantity * input.unit_price_cents);
  const result = await client.query<InvoiceLineItemRow>(
    `INSERT INTO invoice_line_items
       (invoice_id, description, quantity, unit_price_cents, total_cents, line_item_type, sort_order)
     VALUES (
       $1, $2, $3, $4, $5, $6,
       COALESCE($7, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM invoice_line_items WHERE invoice_id = $1))
     )
     RETURNING id, invoice_id, description, quantity::float8 AS quantity,
               unit_price_cents, total_cents, line_item_type, sort_order, created_at`,
    [
      invoiceId,
      input.description,
      input.quantity,
      input.unit_price_cents,
      totalCents,
      input.line_item_type,
      input.sort_order ?? null,
    ]
  );

  return result.rows[0];
}

export async function updateInvoiceLineItem(
  client: PoolClient,
  invoiceId: string,
  lineItemId: string,
  input: {
    description: string;
    quantity: number;
    unit_price_cents: number;
    line_item_type: InvoiceLineItemType;
  }
): Promise<InvoiceLineItemRow> {
  const totalCents = Math.round(input.quantity * input.unit_price_cents);
  const result = await client.query<InvoiceLineItemRow>(
    `UPDATE invoice_line_items
     SET description = $1,
         quantity = $2,
         unit_price_cents = $3,
         total_cents = $4,
         line_item_type = $5
     WHERE id = $6 AND invoice_id = $7
     RETURNING id, invoice_id, description, quantity::float8 AS quantity,
               unit_price_cents, total_cents, line_item_type, sort_order, created_at`,
    [
      input.description,
      input.quantity,
      input.unit_price_cents,
      totalCents,
      input.line_item_type,
      lineItemId,
      invoiceId,
    ]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw Object.assign(new Error("Line item not found"), { code: "NOT_FOUND" });
  }

  return result.rows[0];
}

export async function upsertLaborLineFromTrackedTime(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
  jobId: string
): Promise<{ lineItem: InvoiceLineItemRow; tracked_minutes: number; billable_hours: number }> {
  const timeResult = await client.query<{ tracked_minutes: string }>(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0)::numeric AS tracked_minutes
     FROM visit_time_logs
     WHERE account_id = $1
       AND job_id = $2
       AND started_at IS NOT NULL
       AND ended_at IS NOT NULL`,
    [accountId, jobId]
  );

  const trackedMinutes = Number(timeResult.rows[0]?.tracked_minutes ?? 0);
  const billableHours = roundedQuarterHoursFromMinutes(trackedMinutes);
  if (billableHours <= 0) {
    throw Object.assign(new Error("No completed visit time is available for this job"), {
      code: "NO_TRACKED_TIME",
    });
  }

  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM invoice_line_items
     WHERE invoice_id = $1 AND line_item_type = 'labor'
     ORDER BY sort_order ASC, created_at ASC
     LIMIT 1`,
    [invoiceId]
  );

  const input = {
    description: "Labor",
    quantity: billableHours,
    unit_price_cents: LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
    line_item_type: "labor" as const,
  };

  const lineItem =
    (existing.rowCount ?? 0) > 0
      ? await updateInvoiceLineItem(client, invoiceId, existing.rows[0].id, input)
      : await createInvoiceLineItem(client, invoiceId, input);

  return { lineItem, tracked_minutes: Math.round(trackedMinutes), billable_hours: billableHours };
}
