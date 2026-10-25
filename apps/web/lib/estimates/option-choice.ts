import type { PoolClient } from "pg";
import { calculateDepositPolicy, estimateMaterialsDepositBasis } from "./deposit-policy";

/**
 * Record the customer's pick on a multi-option estimate before it is approved
 * (TASK-181). No approval route may guess: a multi-option estimate without a
 * valid pick throws OPTION_REQUIRED. The deposit is recalculated from the
 * chosen option with the estimate's own deposit rule (percentage of the
 * option, that option's materials, or fixed capped at the option total).
 * Standard estimates are left untouched.
 *
 * The stored subtotal/tax/total stay as they are: the estimate immutability
 * trigger forbids changing them once sent. Making totals, job and invoices
 * follow the pick is the deferred follow-up (TASK-183).
 *
 * Run inside the approval's transaction, before the status change and the
 * approval artifacts (the deposit invoice reads deposit_cents).
 */
export async function recordOptionChoice(
  client: PoolClient,
  estimateId: string,
  optionId: string | null | undefined,
): Promise<{ multiOption: boolean; selectedOptionId: string | null }> {
  const { rows } = await client.query<{
    presentation_mode: string;
    deposit_required: boolean;
    deposit_type: "none" | "materials" | "percentage" | "fixed";
    deposit_percentage: string | number | null;
    deposit_fixed_cents: number | null;
  }>(
    `SELECT presentation_mode, deposit_required, deposit_type, deposit_percentage, deposit_fixed_cents
     FROM estimates WHERE id = $1`,
    [estimateId],
  );
  const est = rows[0];
  if (!est || est.presentation_mode !== "multi_option") return { multiOption: false, selectedOptionId: null };
  if (!optionId) {
    throw Object.assign(new Error("Choose one of the options before approving"), { code: "OPTION_REQUIRED" });
  }

  const { rows: options } = await client.query<{ id: string; subtotal_cents: number; tax_cents: number; total_cents: number }>(
    `SELECT id, subtotal_cents, tax_cents, total_cents FROM estimate_options WHERE id = $1 AND estimate_id = $2`,
    [optionId, estimateId],
  );
  const option = options[0];
  if (!option) {
    throw Object.assign(new Error("That option is not part of this estimate"), { code: "OPTION_REQUIRED" });
  }

  const { rows: optionLines } = await client.query<{ total_cents: number; line_item_type: string; visible_to_customer: boolean }>(
    `SELECT total_cents, line_item_type, visible_to_customer FROM estimate_line_items WHERE option_id = $1`,
    [option.id],
  );
  const deposit = calculateDepositPolicy({
    deposit_required: est.deposit_required,
    deposit_type: est.deposit_type,
    deposit_percentage: est.deposit_percentage === null ? null : Number(est.deposit_percentage),
    deposit_fixed_cents: est.deposit_fixed_cents,
    material_total_cents: estimateMaterialsDepositBasis(optionLines),
    total_cents: option.total_cents,
  });

  await client.query(
    `UPDATE estimates
     SET selected_option_id = $1,
         deposit_cents = $2,
         balance_cents = $3,
         updated_at = now()
     WHERE id = $4`,
    [option.id, deposit.deposit_cents, deposit.balance_cents, estimateId],
  );
  return { multiOption: true, selectedOptionId: option.id };
}
