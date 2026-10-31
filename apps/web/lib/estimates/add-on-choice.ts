import type { PoolClient } from "pg";
import { parsePreparedScope } from "@ai-fsm/domain";
import { calculateDepositPolicy, estimateMaterialsDepositBasis } from "./deposit-policy";
import { totalWithAddOns } from "./approved-lines";

/** An add-on the customer ticked when approving (TASK-225). */
export interface ApprovedAddOn {
  id: string;
  label: string;
  price_cents: number;
}

/**
 * The ticked add-ons, in the quote's order, each once. Only priced options on
 * the prepared scope can be chosen; anything else throws ADD_ON_INVALID.
 */
export function chosenAddOns(rawScope: unknown, ids: string[]): ApprovedAddOn[] {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const priced = (parsePreparedScope(rawScope)?.alternatives ?? []).filter(
    (a): a is typeof a & { price_cents: number } => typeof a.price_cents === "number",
  );
  for (const id of wanted) {
    if (!priced.some((a) => a.id === id)) {
      throw Object.assign(new Error("That add-on is not part of this quote"), { code: "ADD_ON_INVALID" });
    }
  }
  return priced.filter((a) => wanted.has(a.id)).map((a) => ({ id: a.id, label: a.label, price_cents: a.price_cents }));
}

/**
 * Record the customer's add-ons inside the approval transaction, before the
 * deposit invoice is drafted. The stored total stays the base price: the
 * immutability trigger forbids changing a sent quote's totals. The deposit
 * follows the base plus the add-ons, and the final bill adds a line for each.
 */
export async function recordAddOnChoice(client: PoolClient, estimateId: string, ids: string[]): Promise<ApprovedAddOn[]> {
  if (ids.length === 0) return [];
  const { rows } = await client.query<{
    prepared_scope: unknown;
    presentation_mode: string;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    deposit_required: boolean;
    deposit_type: "none" | "materials" | "percentage" | "fixed";
    deposit_percentage: string | number | null;
    deposit_fixed_cents: number | null;
  }>(
    `SELECT prepared_scope, presentation_mode, subtotal_cents, tax_cents, total_cents, deposit_required, deposit_type, deposit_percentage, deposit_fixed_cents
     FROM estimates WHERE id = $1`,
    [estimateId],
  );
  const est = rows[0];
  if (!est || est.presentation_mode === "multi_option") {
    throw Object.assign(new Error("That add-on is not part of this quote"), { code: "ADD_ON_INVALID" });
  }
  const addOns = chosenAddOns(est.prepared_scope, ids);
  const { rows: lines } = await client.query<{ total_cents: number; line_item_type: string; visible_to_customer: boolean }>(
    `SELECT total_cents, line_item_type, visible_to_customer FROM estimate_line_items WHERE estimate_id = $1 AND option_id IS NULL`,
    [estimateId],
  );
  const deposit = calculateDepositPolicy({
    deposit_required: est.deposit_required,
    deposit_type: est.deposit_type,
    deposit_percentage: est.deposit_percentage === null ? null : Number(est.deposit_percentage),
    deposit_fixed_cents: est.deposit_fixed_cents,
    material_total_cents: estimateMaterialsDepositBasis(lines),
    // The amount the customer approved: add-ons taxed like the bill taxes them.
    total_cents: totalWithAddOns(
      { subtotal_cents: Number(est.subtotal_cents), tax_cents: Number(est.tax_cents), total_cents: Number(est.total_cents) },
      addOns.reduce((s, a) => s + a.price_cents, 0),
    ),
  });
  await client.query(
    `UPDATE estimates SET approved_add_ons = $1, deposit_cents = $2, balance_cents = $3, updated_at = now() WHERE id = $4`,
    [JSON.stringify(addOns), deposit.deposit_cents, deposit.balance_cents, estimateId],
  );
  return addOns;
}
