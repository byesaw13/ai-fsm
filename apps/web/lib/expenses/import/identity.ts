/**
 * Transaction identity and observation keys for store purchase imports
 * (TASK-211; docs/working/estimating-assistant-phase3.md §3, eng E10).
 *
 * A trip's identity is supplier family + store number + transaction ID. Rows are
 * keyed by that identity plus SKU (or name), quantity, net unit price and an
 * occurrence number, so identical lines in one trip both count and importing the
 * same trip again (in either mode) adds nothing.
 */
import { storeFamilyOf } from "@ai-fsm/domain";
import { observationFingerprints } from "@/lib/materials/ledger";
import { normalizeTxnId } from "../duplicate-match";

export function transactionIdentity(t: {
  vendor: string;
  store_number: string | null;
  external_ref: string | null;
}): string | null {
  const store = t.store_number?.trim().replace(/^0+(?=\d)/, "").toLowerCase();
  const txn = normalizeTxnId(t.external_ref);
  if (!store || !txn) return null;
  return `${storeFamilyOf(t.vendor)}:${store}:${txn}`;
}

/** One key per line, in line order. `scope` is the identity (or a review id). */
export function tripObservationKeys(
  scope: string,
  lines: { sku: string | null; name: string; unit_cost_cents: number; quantity: number }[],
): string[] {
  return observationFingerprints(
    lines.map((l) => ({ sku: l.sku, name: l.name, unitPriceCents: l.unit_cost_cents, quantity: l.quantity })),
  ).map((fp) => `txn:${scope}:${fp}`);
}
