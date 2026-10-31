import { parsePreparedScope } from "@ai-fsm/domain";

/** A priced option the customer can ask to add; never part of the quote total (TASK-224). */
interface CustomerAddOn {
  id: string;
  label: string;
  note: string | null;
  price_cents: number | null;
}

/** Options from a prepared scope, for the portal, PDF and print views. */
export function customerAddOns(rawScope: unknown): CustomerAddOn[] {
  const scope = parsePreparedScope(rawScope);
  if (!scope) return [];
  return scope.alternatives.map((a) => ({ id: a.id, label: a.label, note: a.note, price_cents: a.price_cents ?? null }));
}

/** Customers see labor as an amount, not hours times a rate (owner 2026-10-31). */
export function showsQuantityAndRate(lineItemType: string | null | undefined): boolean {
  return lineItemType !== "labor";
}
