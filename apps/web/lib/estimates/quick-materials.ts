import type { MaterialsResult } from "./materials-generator";

/**
 * Formats a generated materials list as plain checkbox text a founder/tech can
 * paste into a text to the supply house or crew. Pure — no AI, no I/O.
 */
export function formatSupplyHouseOrderText(scope: string, result: MaterialsResult): string {
  return [
    `Dovetails Supply House Order`,
    `Scope: ${scope}`,
    `---------------------------------------`,
    ...result.items.map(
      (item) => `[ ] ${item.quantity} ${item.unit} - ${item.name}${item.notes ? ` (${item.notes})` : ""}`,
    ),
    `---------------------------------------`,
    `Est Total: $${(result.total_cost_cents / 100).toFixed(2)}`,
  ].join("\n");
}
