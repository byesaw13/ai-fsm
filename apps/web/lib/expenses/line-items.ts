import type { PoolClient } from "pg";

export type ExpenseLineItemRow = {
  id: string;
  expense_id: string;
  name: string;
  quantity: number;
  unit_cost_cents: number;
  sku: string | null;
  sort_order: number;
};

export type ExpenseLineItemInput = {
  name: string;
  quantity?: number;
  unit_cost_cents: number;
  sku?: string | null;
  sort_order?: number;
};

export async function fetchExpenseLineItems(
  client: PoolClient,
  accountId: string,
  expenseId: string,
): Promise<ExpenseLineItemRow[]> {
  const result = await client.query<ExpenseLineItemRow>(
    `SELECT id, expense_id, name, quantity::float8 AS quantity,
            unit_cost_cents, sku, sort_order
     FROM expense_line_items
     WHERE account_id = $1 AND expense_id = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [accountId, expenseId],
  );
  return result.rows;
}

export async function replaceExpenseLineItems(
  client: PoolClient,
  accountId: string,
  expenseId: string,
  items: ExpenseLineItemInput[],
): Promise<ExpenseLineItemRow[]> {
  await client.query(
    `DELETE FROM expense_line_items WHERE account_id = $1 AND expense_id = $2`,
    [accountId, expenseId],
  );
  if (items.length === 0) return [];

  const rows: ExpenseLineItemRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = item.quantity ?? 1;
    const inserted = await client.query<ExpenseLineItemRow>(
      `INSERT INTO expense_line_items
         (account_id, expense_id, name, quantity, unit_cost_cents, sku, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, expense_id, name, quantity::float8 AS quantity,
                 unit_cost_cents, sku, sort_order`,
      [
        accountId,
        expenseId,
        item.name.trim(),
        qty,
        item.unit_cost_cents,
        item.sku ?? null,
        item.sort_order ?? i,
      ],
    );
    rows.push(inserted.rows[0]);
  }
  return rows;
}