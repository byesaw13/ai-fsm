import type { PoolClient } from "pg";
import { isDumpExpense } from "@ai-fsm/domain";
import type { InvoiceLineItemRow } from "./line-items";
import { createInvoiceLineItem } from "./line-items";

export type CloseoutExpenseRow = {
  id: string;
  vendor_name: string;
  amount_cents: number;
  notes: string | null;
  category: string | null;
};

export type CloseoutRollupPreview = {
  materialsCents: number;
  dumpCents: number;
  materialExpenseIds: string[];
  dumpExpenseIds: string[];
};

export async function loadJobExpensesForCloseout(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<CloseoutExpenseRow[]> {
  const result = await client.query<CloseoutExpenseRow>(
    `SELECT e.id, e.vendor_name, e.amount_cents, e.notes, e.category
     FROM expenses e
     WHERE e.account_id = $1
       AND e.job_id = $2
       AND e.billable IS DISTINCT FROM false
       AND NOT EXISTS (
         SELECT 1 FROM invoice_line_items ili
         WHERE ili.source_expense_id = e.id
       )
     ORDER BY e.expense_date ASC, e.created_at ASC`,
    [accountId, jobId],
  );
  return result.rows;
}

export function closeoutRollupFromExpenses(
  expenses: CloseoutExpenseRow[],
): CloseoutRollupPreview {
  let materialsCents = 0;
  let dumpCents = 0;
  const materialExpenseIds: string[] = [];
  const dumpExpenseIds: string[] = [];
  for (const e of expenses) {
    if (isDumpExpense(e)) {
      dumpCents += e.amount_cents;
      dumpExpenseIds.push(e.id);
      continue;
    }
    if (e.category === "materials") {
      materialsCents += e.amount_cents;
      materialExpenseIds.push(e.id);
    }
  }
  return { materialsCents, dumpCents, materialExpenseIds, dumpExpenseIds };
}

export async function appendCloseoutExpenseRollup(
  client: PoolClient,
  invoiceId: string,
  preview: CloseoutRollupPreview,
  sortStart: number,
): Promise<InvoiceLineItemRow[]> {
  const lines: InvoiceLineItemRow[] = [];
  let order = sortStart;
  if (preview.materialsCents > 0) {
    const line = await createInvoiceLineItem(client, invoiceId, {
      description: "Materials",
      quantity: 1,
      unit_price_cents: preview.materialsCents,
      line_item_type: "materials",
      sort_order: order++,
    });
    if (preview.materialExpenseIds[0]) {
      await client.query(
        `UPDATE invoice_line_items SET source_expense_id = $1 WHERE id = $2`,
        [preview.materialExpenseIds[0], line.id],
      );
    }
    lines.push(line);
    await attachHiddenExpenseLinks(
      client,
      invoiceId,
      preview.materialExpenseIds.slice(1),
      order,
    );
    order += Math.max(0, preview.materialExpenseIds.length - 1);
  }
  if (preview.dumpCents > 0) {
    const line = await createInvoiceLineItem(client, invoiceId, {
      description: "Dumping fees",
      quantity: 1,
      unit_price_cents: preview.dumpCents,
      line_item_type: "materials",
      sort_order: order++,
    });
    if (preview.dumpExpenseIds[0]) {
      await client.query(
        `UPDATE invoice_line_items SET source_expense_id = $1 WHERE id = $2`,
        [preview.dumpExpenseIds[0], line.id],
      );
    }
    lines.push(line);
    await attachHiddenExpenseLinks(
      client,
      invoiceId,
      preview.dumpExpenseIds.slice(1),
      order,
    );
  }
  return lines;
}

/** $0 customer-hidden lines so remaining rollup receipts count as billed. */
async function attachHiddenExpenseLinks(
  client: PoolClient,
  invoiceId: string,
  expenseIds: string[],
  sortStart: number,
): Promise<void> {
  let order = sortStart;
  for (const expenseId of expenseIds) {
    await client.query(
      `INSERT INTO invoice_line_items
         (invoice_id, description, quantity, unit_price_cents, total_cents,
          line_item_type, sort_order, source_expense_id, visible_to_customer)
       VALUES ($1, 'Materials (billed in rollup)', 1, 0, 0, 'materials', $2, $3, false)`,
      [invoiceId, order++, expenseId],
    );
  }
}
