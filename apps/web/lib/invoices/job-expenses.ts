import type { PoolClient } from "pg";
import type { InvoiceLineItemRow } from "./line-items";
import {
  fetchExpenseLineItems,
  type ExpenseLineItemRow,
} from "@/lib/expenses/line-items";
import {
  materialExpenseDescription,
  materialHandlingCents,
  materialHandlingLineDescription,
  materialHandlingRateFromSettings,
  materialInvoiceTotalCents,
  type LinkableMaterialExpense,
  type ExpenseLineItemPreview,
} from "./material-handling";
import { parseLineQuantity } from "./quantity";

export type JobMaterialExpenseRow = {
  id: string;
  vendor_name: string;
  amount_cents: number;
  notes: string | null;
};

export type LinkableMaterialExpenseRow = LinkableMaterialExpense;

export {
  materialExpenseDescription,
  materialHandlingCents,
  materialInvoiceTotalCents,
} from "./material-handling";

const UNLINKED_LOOKBACK_DAYS = 90;

type MaterialLineDraft = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_item_type: "materials";
  source_expense_id: string;
  source_expense_line_item_id: string | null;
};

function lineTotalCents(quantity: number, unitCents: number): number {
  return Math.round(quantity * unitCents);
}

async function buildMaterialLineDraftsForExpense(
  client: PoolClient,
  accountId: string,
  expense: JobMaterialExpenseRow,
): Promise<MaterialLineDraft[]> {
  const skuLines = await fetchExpenseLineItems(client, accountId, expense.id);
  if (skuLines.length > 0) {
    return skuLines.map((line) => ({
      description: line.name,
      quantity: parseLineQuantity(line.quantity),
      unit_price_cents: line.unit_cost_cents,
      line_item_type: "materials" as const,
      source_expense_id: expense.id,
      source_expense_line_item_id: line.id,
    }));
  }

  return [
    {
      description: materialExpenseDescription(expense),
      quantity: 1,
      unit_price_cents: expense.amount_cents,
      line_item_type: "materials",
      source_expense_id: expense.id,
      source_expense_line_item_id: null,
    },
  ];
}

async function insertMaterialLine(
  client: PoolClient,
  invoiceId: string,
  draft: MaterialLineDraft,
  sortOrder: number,
): Promise<InvoiceLineItemRow> {
  const total = lineTotalCents(draft.quantity, draft.unit_price_cents);
  const row = await client.query<InvoiceLineItemRow>(
    `INSERT INTO invoice_line_items
       (invoice_id, description, quantity, unit_price_cents, total_cents,
        line_item_type, sort_order, source_expense_id, source_expense_line_item_id)
     VALUES ($1, $2, $3, $4, $5, 'materials', $6, $7, $8)
     RETURNING id, invoice_id, description, quantity::float8 AS quantity,
               unit_price_cents, total_cents, line_item_type, sort_order, created_at`,
    [
      invoiceId,
      draft.description,
      draft.quantity,
      draft.unit_price_cents,
      total,
      sortOrder,
      draft.source_expense_id,
      draft.source_expense_line_item_id,
    ],
  );
  return row.rows[0];
}

/** Remove auto-managed material handling fee lines. */
export async function removeAutoMaterialHandlingLine(
  client: PoolClient,
  invoiceId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM invoice_line_items
     WHERE invoice_id = $1
       AND line_item_type = 'handling_fee'
       AND description LIKE 'Material handling (%'`,
    [invoiceId],
  );
}

/** Recompute material handling from all material lines when enabled on the invoice. */
export async function upsertMaterialHandlingFeeLine(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
): Promise<InvoiceLineItemRow | null> {
  const inv = await client.query<{ apply_material_handling: boolean }>(
    `SELECT apply_material_handling FROM invoices WHERE id = $1`,
    [invoiceId],
  );
  if (!inv.rows[0]?.apply_material_handling) {
    await removeAutoMaterialHandlingLine(client, invoiceId);
    return null;
  }

  const account = await client.query<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM accounts WHERE id = $1`,
    [accountId],
  );
  const rate = materialHandlingRateFromSettings(account.rows[0]?.settings);
  const description = materialHandlingLineDescription(rate);

  const sum = await client.query<{ material_cost_cents: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::bigint AS material_cost_cents
     FROM invoice_line_items
     WHERE invoice_id = $1
       AND line_item_type = 'materials'`,
    [invoiceId],
  );
  const materialCost = parseInt(sum.rows[0]?.material_cost_cents ?? "0", 10);
  const handling = materialHandlingCents(materialCost, rate);
  if (handling <= 0) {
    await removeAutoMaterialHandlingLine(client, invoiceId);
    return null;
  }

  const existing = await client.query<{ id: string; sort_order: number }>(
    `SELECT id, sort_order
     FROM invoice_line_items
     WHERE invoice_id = $1
       AND line_item_type = 'handling_fee'
       AND description LIKE 'Material handling (%'
     ORDER BY sort_order ASC, created_at ASC
     LIMIT 1`,
    [invoiceId],
  );

  if (existing.rows[0]) {
    const row = await client.query<InvoiceLineItemRow>(
      `UPDATE invoice_line_items
       SET description = $1,
           unit_price_cents = $2,
           total_cents = $2,
           quantity = 1
       WHERE id = $3
       RETURNING id, invoice_id, description, quantity::float8 AS quantity,
                 unit_price_cents, total_cents, line_item_type, sort_order, created_at`,
      [description, handling, existing.rows[0].id],
    );
    return row.rows[0];
  }

  const sortOrder = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
     FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId],
  );

  const row = await client.query<InvoiceLineItemRow>(
    `INSERT INTO invoice_line_items
       (invoice_id, description, quantity, unit_price_cents, total_cents,
        line_item_type, sort_order)
     VALUES ($1, $2, 1, $3, $3, 'handling_fee', $4)
     RETURNING id, invoice_id, description, quantity::float8 AS quantity,
               unit_price_cents, total_cents, line_item_type, sort_order, created_at`,
    [invoiceId, description, handling, sortOrder.rows[0]?.next ?? 0],
  );
  return row.rows[0];
}

async function appendExpenseMaterialLines(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
  expense: JobMaterialExpenseRow,
  startOrder: number,
): Promise<{ lineItems: InvoiceLineItemRow[]; nextOrder: number }> {
  const billed = await client.query(
    `SELECT 1 FROM invoice_line_items WHERE invoice_id = $1 AND source_expense_id = $2 LIMIT 1`,
    [invoiceId, expense.id],
  );
  if ((billed.rowCount ?? 0) > 0) {
    return { lineItems: [], nextOrder: startOrder };
  }

  const drafts = await buildMaterialLineDraftsForExpense(client, accountId, expense);
  const lineItems: InvoiceLineItemRow[] = [];
  let order = startOrder;
  for (const draft of drafts) {
    if (draft.source_expense_line_item_id) {
      const dup = await client.query(
        `SELECT 1 FROM invoice_line_items
         WHERE invoice_id = $1 AND source_expense_line_item_id = $2`,
        [invoiceId, draft.source_expense_line_item_id],
      );
      if ((dup.rowCount ?? 0) > 0) continue;
    }
    lineItems.push(await insertMaterialLine(client, invoiceId, draft, order));
    order += 1;
  }
  return { lineItems, nextOrder: order };
}

/** Job material expenses not yet billed on any invoice. */
export async function fetchUninvoicedJobMaterialExpenses(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<JobMaterialExpenseRow[]> {
  const result = await client.query<JobMaterialExpenseRow>(
    `SELECT e.id, e.vendor_name, e.amount_cents, e.notes
     FROM expenses e
     WHERE e.account_id = $1
       AND e.job_id = $2
       AND e.category = 'materials'
       AND NOT EXISTS (
         SELECT 1 FROM invoice_line_items ili
         WHERE ili.source_expense_id = e.id
       )
     ORDER BY e.expense_date ASC, e.created_at ASC`,
    [accountId, jobId],
  );
  return result.rows;
}

function toLineItemPreview(line: ExpenseLineItemRow): ExpenseLineItemPreview {
  const quantity = parseLineQuantity(line.quantity);
  return {
    id: line.id,
    name: line.name,
    quantity,
    unit_cost_cents: line.unit_cost_cents,
    line_total_cents: lineTotalCents(quantity, line.unit_cost_cents),
  };
}

/** Material expenses billable on this invoice: on the job or unlinked but matching client. */
export async function fetchLinkableMaterialExpenses(
  client: PoolClient,
  accountId: string,
  jobId: string,
  jobClientId: string,
): Promise<LinkableMaterialExpenseRow[]> {
  const result = await client.query<LinkableMaterialExpenseRow>(
    `SELECT e.id, e.vendor_name, e.amount_cents, e.notes,
            e.expense_date::text AS expense_date,
            e.job_id, e.client_id,
            (e.job_id = $2) AS already_on_job
     FROM expenses e
     WHERE e.account_id = $1
       AND e.category = 'materials'
       AND NOT EXISTS (
         SELECT 1 FROM invoice_line_items ili
         WHERE ili.source_expense_id = e.id
       )
       AND (
         e.job_id = $2
         OR (
           e.job_id IS NULL
           AND (
             e.client_id = $3
             OR (
               e.client_id IS NULL
               AND e.expense_date >= (CURRENT_DATE - interval '${UNLINKED_LOOKBACK_DAYS} days')
             )
           )
         )
       )
     ORDER BY e.expense_date DESC, e.created_at DESC
     LIMIT 50`,
    [accountId, jobId, jobClientId],
  );

  const enriched: LinkableMaterialExpenseRow[] = [];
  for (const expense of result.rows) {
    const skuLines = await fetchExpenseLineItems(client, accountId, expense.id);
    enriched.push({
      ...expense,
      line_items: skuLines.map(toLineItemPreview),
    });
  }
  return enriched;
}

export type JobLinkContext = {
  id: string;
  client_id: string;
  property_id: string | null;
};

export async function loadJobLinkContext(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<JobLinkContext> {
  const result = await client.query<JobLinkContext>(
    `SELECT id, client_id, property_id FROM jobs WHERE id = $1 AND account_id = $2`,
    [jobId, accountId],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
  }
  return result.rows[0];
}

export async function linkMaterialExpensesToJob(
  client: PoolClient,
  accountId: string,
  job: JobLinkContext,
  expenseIds: string[],
): Promise<{ linked: string[] }> {
  if (expenseIds.length === 0) {
    return { linked: [] };
  }

  const candidates = await client.query<{
    id: string;
    job_id: string | null;
    client_id: string | null;
    category: string;
  }>(
    `SELECT id, job_id, client_id, category
     FROM expenses
     WHERE account_id = $1 AND id = ANY($2::uuid[])`,
    [accountId, expenseIds],
  );

  if (candidates.rows.length !== expenseIds.length) {
    throw Object.assign(new Error("One or more expenses were not found"), {
      code: "INVALID_EXPENSE",
    });
  }

  for (const row of candidates.rows) {
    if (row.category !== "materials") {
      throw Object.assign(new Error("Only material expenses can be linked to a job invoice"), {
        code: "INVALID_EXPENSE",
      });
    }
    if (row.job_id && row.job_id !== job.id) {
      throw Object.assign(new Error("Expense is already linked to a different job"), {
        code: "EXPENSE_ON_OTHER_JOB",
      });
    }
    if (row.client_id && row.client_id !== job.client_id) {
      throw Object.assign(new Error("Expense belongs to a different client"), {
        code: "EXPENSE_ON_OTHER_CLIENT",
      });
    }
    const billed = await client.query(
      `SELECT 1 FROM invoice_line_items WHERE source_expense_id = $1 LIMIT 1`,
      [row.id],
    );
    if ((billed.rowCount ?? 0) > 0) {
      throw Object.assign(new Error("Expense is already on an invoice"), {
        code: "EXPENSE_ALREADY_BILLED",
      });
    }
  }

  const linked: string[] = [];
  for (const id of expenseIds) {
    await client.query(
      `UPDATE expenses
       SET job_id = $1, client_id = $2, property_id = $3
       WHERE id = $4 AND account_id = $5`,
      [job.id, job.client_id, job.property_id, id, accountId],
    );
    linked.push(id);
  }
  return { linked };
}

export async function linkAndAppendMaterialsToInvoice(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
  jobId: string,
  expenseIds: string[],
): Promise<{ linked: string[]; lineItems: InvoiceLineItemRow[] }> {
  const job = await loadJobLinkContext(client, accountId, jobId);
  const { linked } = await linkMaterialExpensesToJob(client, accountId, job, expenseIds);
  if (linked.length === 0) {
    return { linked: [], lineItems: [] };
  }

  const expenses = await client.query<JobMaterialExpenseRow>(
    `SELECT id, vendor_name, amount_cents, notes
     FROM expenses
     WHERE account_id = $1 AND id = ANY($2::uuid[])
     ORDER BY expense_date ASC, created_at ASC`,
    [accountId, linked],
  );

  const sortOrder = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
     FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId],
  );
  let order = sortOrder.rows[0]?.next ?? 0;

  const lineItems: InvoiceLineItemRow[] = [];
  for (const expense of expenses.rows) {
    const added = await appendExpenseMaterialLines(client, invoiceId, accountId, expense, order);
    lineItems.push(...added.lineItems);
    order = added.nextOrder;
  }

  const handling = await upsertMaterialHandlingFeeLine(client, invoiceId, accountId);
  if (handling) lineItems.push(handling);

  return { linked, lineItems };
}

export async function appendMaterialsFromJobExpenses(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
  jobId: string,
): Promise<{ lineItems: InvoiceLineItemRow[]; skipped: number }> {
  const expenses = await fetchUninvoicedJobMaterialExpenses(client, accountId, jobId);
  const lineItems: InvoiceLineItemRow[] = [];
  let sortOrder = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
     FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId],
  );
  let order = sortOrder.rows[0]?.next ?? 0;

  for (const expense of expenses) {
    const added = await appendExpenseMaterialLines(client, invoiceId, accountId, expense, order);
    lineItems.push(...added.lineItems);
    order = added.nextOrder;
  }

  const handling = await upsertMaterialHandlingFeeLine(client, invoiceId, accountId);
  if (handling) lineItems.push(handling);

  return { lineItems, skipped: 0 };
}

/** Replace all job-sourced material + handling lines on a draft invoice. */
export async function refreshJobMaterialsOnInvoice(
  client: PoolClient,
  invoiceId: string,
  accountId: string,
  jobId: string,
): Promise<{ lineItems: InvoiceLineItemRow[] }> {
  await client.query(
    `DELETE FROM invoice_line_items
     WHERE invoice_id = $1
       AND (
         source_expense_id IS NOT NULL
         OR (
           line_item_type = 'handling_fee'
           AND description LIKE 'Material handling (%'
         )
       )`,
    [invoiceId],
  );

  const expenses = await fetchUninvoicedJobMaterialExpenses(client, accountId, jobId);

  const lineItems: InvoiceLineItemRow[] = [];
  let sortOrder = await client.query<{ next: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
     FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId],
  );
  let order = sortOrder.rows[0]?.next ?? 0;

  for (const expense of expenses) {
    const added = await appendExpenseMaterialLines(client, invoiceId, accountId, expense, order);
    lineItems.push(...added.lineItems);
    order = added.nextOrder;
  }

  const handling = await upsertMaterialHandlingFeeLine(client, invoiceId, accountId);
  if (handling) lineItems.push(handling);

  return { lineItems };
}

export async function materialLineItemsFromJobExpenses(
  client: PoolClient,
  accountId: string,
  jobId: string,
  sortStart: number,
): Promise<
  Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    line_item_type: "materials" | "handling_fee";
    sort_order: number;
    source_expense_id?: string;
    source_expense_line_item_id?: string | null;
  }>
> {
  const result = await client.query<JobMaterialExpenseRow>(
    `SELECT id, vendor_name, amount_cents, notes
     FROM expenses
     WHERE account_id = $1 AND job_id = $2 AND category = 'materials'
     ORDER BY expense_date ASC, created_at ASC`,
    [accountId, jobId],
  );

  const lines: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
    line_item_type: "materials" | "handling_fee";
    sort_order: number;
    source_expense_id?: string;
    source_expense_line_item_id?: string | null;
  }> = [];

  let order = sortStart;
  let materialCost = 0;

  for (const expense of result.rows) {
    const drafts = await buildMaterialLineDraftsForExpense(client, accountId, expense);
    for (const draft of drafts) {
      lines.push({
        description: draft.description,
        quantity: draft.quantity,
        unit_price_cents: draft.unit_price_cents,
        line_item_type: "materials",
        sort_order: order,
        source_expense_id: draft.source_expense_id,
        source_expense_line_item_id: draft.source_expense_line_item_id,
      });
      materialCost += lineTotalCents(draft.quantity, draft.unit_price_cents);
      order += 1;
    }
  }

  const account = await client.query<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM accounts WHERE id = $1`,
    [accountId],
  );
  const rate = materialHandlingRateFromSettings(account.rows[0]?.settings);
  const handling = materialHandlingCents(materialCost, rate);
  if (handling > 0) {
    lines.push({
      description: materialHandlingLineDescription(rate),
      quantity: 1,
      unit_price_cents: handling,
      line_item_type: "handling_fee",
      sort_order: order,
    });
  }

  return lines;
}