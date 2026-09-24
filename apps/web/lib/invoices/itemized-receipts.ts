/**
 * Itemized receipts behind an invoice's materials (TASK-157): the job's billable
 * receipts and their billable items. Used by the public receipts page and the
 * owner's reconcile panel, so both always agree.
 *
 * A receipt bills what was actually paid: its total minus any items marked
 * not-billable. Scanned items often don't add up to the receipt (missed lines,
 * discounts, tax), so the difference is shown as its own "receipt balance" row
 * and the page always reconciles to real receipt totals.
 * ponytail: the balance row isn't split across excluded vs billable items; an
 * excluded item's share of tax/discount stays billed. Fine at NH's 0% tax.
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
  /** Receipt total minus the sum of all scanned items (missed lines, discounts, tax). */
  balance_cents: number;
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
        balance_cents: 0,
        total_cents: r.amount_cents,
      });
      continue;
    }
    const priced = all.map((i) => ({
      billable: i.billable,
      item: {
        name: i.name,
        quantity: Number(i.quantity),
        unit_cost_cents: i.unit_cost_cents,
        total_cents: Math.round(Number(i.quantity) * i.unit_cost_cents),
      },
    }));
    const billable = priced.filter((p) => p.billable).map((p) => p.item);
    // Every item excluded → the receipt bills nothing; leave it off the page.
    if (billable.length === 0) continue;
    const balance = r.amount_cents - priced.reduce((s, p) => s + p.item.total_cents, 0);
    out.push({
      id: r.id,
      expense_date: r.expense_date,
      vendor_name: r.vendor_name,
      itemized: true,
      items: billable,
      balance_cents: balance,
      total_cents: billable.reduce((s, i) => s + i.total_cents, 0) + balance,
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
