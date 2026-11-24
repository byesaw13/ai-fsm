/**
 * Numbered receipt parse revisions (TASK-211; docs/working/estimating-assistant-phase3.md
 * §3 "Receipts" and "Receipt reconciliation").
 *
 * Every parse or line edit of a receipt is a revision: a snapshot of its lines,
 * signed adjustments, tax and reconciliation. Receipt price observations are keyed
 * by revision, so the current revision's prices are active and earlier ones are
 * superseded; restoring an earlier revision saves it again as the newest revision,
 * which brings its lines and prices back. The expense row is locked first, so concurrent re-parses of one
 * receipt run one after the other and leave one current revision.
 */
import type { PoolClient } from "pg";
import { learnMaterialsFromLineItems } from "@/lib/materials/catalog";
import { logger } from "@/lib/logger";
import { replaceExpenseLineItems, type ExpenseLineItemInput, type ExpenseLineItemRow } from "./line-items";
import {
  reconcileReceiptParse,
  type ReceiptAdjustment,
  type ReceiptParseReconciliation,
} from "./receipt-line-items";

export type RevisionOrigin = "parse" | "edit" | "restore";

export class ReceiptRevisionError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "ALREADY_BILLED" | "NO_REVISION",
  ) {
    super(message);
  }
}

export interface RevisionActor {
  accountId: string;
  userId: string;
  traceId?: string | null;
}

export interface SavedRevision {
  revision: number;
  line_items: ExpenseLineItemRow[];
  reconciliation: ReceiptParseReconciliation;
  catalog_learned: number;
}

export interface RevisionSummary {
  revision: number;
  origin: RevisionOrigin;
  line_count: number;
  balanced: boolean | null;
  created_at: string;
}

interface LockedExpense {
  category: string;
  vendor_name: string;
  expense_date: string;
  amount_cents: number;
  parse_revision: number;
}

async function lockExpense(client: PoolClient, accountId: string, expenseId: string): Promise<LockedExpense> {
  const { rows } = await client.query<LockedExpense>(
    `SELECT category, vendor_name, expense_date::text AS expense_date, amount_cents, parse_revision
     FROM expenses WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [expenseId, accountId],
  );
  if (!rows[0]) throw new ReceiptRevisionError("Expense not found", "NOT_FOUND");
  const billed = await client.query(`SELECT 1 FROM invoice_line_items WHERE source_expense_id = $1 LIMIT 1`, [expenseId]);
  if ((billed.rowCount ?? 0) > 0) {
    throw new ReceiptRevisionError("This receipt is already on an invoice — edit the invoice instead", "ALREADY_BILLED");
  }
  return rows[0];
}

/** Receipt prices for one revision. Non-fatal: a catalog failure never loses the receipt. */
async function learnRevision(
  client: PoolClient,
  actor: RevisionActor,
  expenseId: string,
  expense: LockedExpense,
  revision: number,
  lines: ExpenseLineItemRow[],
  reconciled: boolean,
): Promise<number> {
  if (expense.category !== "materials") return 0;
  await client.query("SAVEPOINT receipt_revision_learn");
  try {
    const { learned } = await learnMaterialsFromLineItems(
      client,
      {
        accountId: actor.accountId,
        supplier: expense.vendor_name,
        purchasedAt: expense.expense_date.slice(0, 10),
        source: { kind: "receipt", expenseId, revision },
        reconciled,
        enteredBy: actor.userId,
      },
      lines.map((li) => ({ name: li.name, unit_cost_cents: li.unit_cost_cents, sku: li.sku, quantity: li.quantity })),
    );
    await client.query("RELEASE SAVEPOINT receipt_revision_learn");
    return learned;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT receipt_revision_learn");
    await client.query("RELEASE SAVEPOINT receipt_revision_learn");
    logger.warn("materials catalog learn failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      expenseId,
      traceId: actor.traceId ?? undefined,
    });
    return 0;
  }
}

/**
 * Save a receipt's lines as a new revision. Tax and adjustments not given carry
 * forward from the current revision (a hand edit keeps what the parse read).
 */
export async function saveReceiptRevision(
  client: PoolClient,
  actor: RevisionActor,
  expenseId: string,
  input: {
    origin: RevisionOrigin;
    lineItems: ExpenseLineItemInput[];
    taxCents?: number | null;
    adjustments?: ReceiptAdjustment[];
  },
): Promise<SavedRevision> {
  const expense = await lockExpense(client, actor.accountId, expenseId);
  const current = await client.query<{ tax_cents: number | null; adjustments: ReceiptAdjustment[]; next: number }>(
    `SELECT (SELECT tax_cents FROM expense_parse_revisions WHERE expense_id = $1 AND revision = $2) AS tax_cents,
            COALESCE((SELECT adjustments FROM expense_parse_revisions WHERE expense_id = $1 AND revision = $2), '[]'::jsonb) AS adjustments,
            COALESCE((SELECT max(revision) FROM expense_parse_revisions WHERE expense_id = $1), 0) + 1 AS next`,
    [expenseId, expense.parse_revision],
  );
  const taxCents = input.taxCents !== undefined ? input.taxCents : current.rows[0].tax_cents;
  const adjustments = input.adjustments ?? current.rows[0].adjustments;
  const revision = current.rows[0].next;

  const saved = await replaceExpenseLineItems(client, actor.accountId, expenseId, input.lineItems);
  const reconciliation = reconcileReceiptParse(saved, expense.amount_cents, taxCents, adjustments);

  await client.query(
    `INSERT INTO expense_parse_revisions
       (account_id, expense_id, revision, origin, line_items, adjustments, tax_cents, reconciliation, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9)`,
    [
      actor.accountId, expenseId, revision, input.origin,
      JSON.stringify(saved.map(({ name, quantity, unit_cost_cents, sku, billable }) => ({ name, quantity, unit_cost_cents, sku, billable }))),
      JSON.stringify(adjustments), taxCents ?? null, JSON.stringify(reconciliation), actor.userId,
    ],
  );
  await client.query(`UPDATE expenses SET parse_revision = $3, updated_at = now() WHERE id = $1 AND account_id = $2`, [
    expenseId, actor.accountId, revision,
  ]);
  const catalog_learned = await learnRevision(client, actor, expenseId, expense, revision, saved, reconciliation.balanced === true);
  return { revision, line_items: saved, reconciliation, catalog_learned };
}

/**
 * Bring an earlier revision back: its lines, tax and adjustments are saved again as
 * a new "restore" revision, reconciled against the expense total as it is now, so
 * its prices come back with a current reconciled flag (the ledger stays append-only).
 */
export async function restoreReceiptRevision(
  client: PoolClient,
  actor: RevisionActor,
  expenseId: string,
  revision: number,
): Promise<SavedRevision> {
  await lockExpense(client, actor.accountId, expenseId);
  const { rows } = await client.query<{ line_items: ExpenseLineItemInput[]; tax_cents: number | null; adjustments: ReceiptAdjustment[] }>(
    `SELECT line_items, tax_cents, adjustments FROM expense_parse_revisions
     WHERE account_id = $1 AND expense_id = $2 AND revision = $3`,
    [actor.accountId, expenseId, revision],
  );
  if (!rows[0]) throw new ReceiptRevisionError("That version of the receipt was not found", "NO_REVISION");
  return saveReceiptRevision(client, actor, expenseId, {
    origin: "restore",
    lineItems: rows[0].line_items.map((li, i) => ({ ...li, sort_order: i })),
    taxCents: rows[0].tax_cents,
    adjustments: rows[0].adjustments,
  });
}

export async function listReceiptRevisions(
  client: PoolClient,
  accountId: string,
  expenseId: string,
): Promise<{ current: number; revisions: RevisionSummary[] }> {
  const { rows } = await client.query<RevisionSummary & { current: number }>(
    `SELECT r.revision, r.origin, jsonb_array_length(r.line_items) AS line_count,
            (r.reconciliation->>'balanced')::boolean AS balanced, r.created_at::text AS created_at,
            e.parse_revision AS current
     FROM expense_parse_revisions r
     JOIN expenses e ON e.id = r.expense_id AND e.account_id = r.account_id
     WHERE r.account_id = $1 AND r.expense_id = $2
     ORDER BY r.revision DESC`,
    [accountId, expenseId],
  );
  return {
    current: rows[0]?.current ?? 0,
    revisions: rows.map(({ current: _current, ...r }) => r),
  };
}
