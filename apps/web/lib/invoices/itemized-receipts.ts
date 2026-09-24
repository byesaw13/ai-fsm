/**
 * Itemized receipts behind an invoice's materials (TASK-157): the job's billable
 * receipts and their billable items. Used by the public receipts page and the
 * owner's reconcile panel, so both always agree.
 *
 * A receipt's billable amount is the sum of its billable items when it is
 * itemized (matching `buildMaterialLineDraftsForExpense`), else its total.
 * ponytail: item sums ignore receipt-level tax/rounding; fine while NH receipts
 * carry no sales tax. Allocate tax across items if that changes.
 */

import type { Pool, PoolClient } from "pg";

export type ItemizedReceiptItem = {
  name: string;
  quantity: number;
  unit_cost_cents: number;
  total_cents: number;
};

export type ItemizedReceipt = {
  id: string;
  expense_date: string;
  vendor_name: string;
  itemized: boolean;
  items: ItemizedReceiptItem[];
  total_cents: number;
};

export type ReceiptRow = {
  id: string;
  expense_date: string;
  vendor_name: string;
  amount_cents: number;
};

export type ReceiptItemRow = {
  expense_id: string;
  name: string;
  quantity: number;
  unit_cost_cents: number;
  billable: boolean;
};

export function buildItemizedReceipts(
  receipts: ReceiptRow[],
  items: ReceiptItemRow[],
): { receipts: ItemizedReceipt[]; total_cents: number } {
  const out: ItemizedReceipt[] = [];
  for (const r of receipts) {
    const all = items.filter((i) => i.expense_id === r.id);
    if (all.length === 0) {
      out.push({
        id: r.id,
        expense_date: r.expense_date,
        vendor_name: r.vendor_name,
        itemized: false,
        items: [],
        total_cents: r.amount_cents,
      });
      continue;
    }
    const billable = all
      .filter((i) => i.billable)
      .map((i) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unit_cost_cents: i.unit_cost_cents,
        total_cents: Math.round(Number(i.quantity) * i.unit_cost_cents),
      }));
    // Every item excluded → the receipt bills nothing; leave it off the page.
    if (billable.length === 0) continue;
    out.push({
      id: r.id,
      expense_date: r.expense_date,
      vendor_name: r.vendor_name,
      itemized: true,
      items: billable,
      total_cents: billable.reduce((s, i) => s + i.total_cents, 0),
    });
  }
  return { receipts: out, total_cents: out.reduce((s, r) => s + r.total_cents, 0) };
}

export async function loadItemizedReceipts(
  db: Pool | PoolClient,
  accountId: string,
  jobId: string,
): Promise<{ receipts: ItemizedReceipt[]; total_cents: number }> {
  const receipts = await db.query<ReceiptRow>(
    `SELECT id, expense_date::text AS expense_date, vendor_name, amount_cents
     FROM expenses
     WHERE account_id = $1 AND job_id = $2
       AND billable IS DISTINCT FROM false
       AND category NOT IN ('fuel', 'vehicle', 'vehicle_fuel', 'meals')
     ORDER BY expense_date ASC, created_at ASC`,
    [accountId, jobId],
  );
  const ids = receipts.rows.map((r) => r.id);
  const items = ids.length
    ? await db.query<ReceiptItemRow>(
        `SELECT expense_id, name, quantity::float8 AS quantity, unit_cost_cents, billable
         FROM expense_line_items
         WHERE account_id = $1 AND expense_id = ANY($2::uuid[])
         ORDER BY sort_order ASC, created_at ASC`,
        [accountId, ids],
      )
    : { rows: [] as ReceiptItemRow[] };
  return buildItemizedReceipts(receipts.rows, items.rows);
}
