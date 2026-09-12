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
  }
  return lines;
}
