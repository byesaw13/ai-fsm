import type { ExpenseCategory } from "@ai-fsm/domain";

export const RECEIPT_DESTINATIONS = ["job", "truck", "stock", "tools", "overhead"] as const;
export type ReceiptDestination = (typeof RECEIPT_DESTINATIONS)[number];

export const RECEIPT_DESTINATION_LABELS: Record<ReceiptDestination, string> = {
  job: "This job",
  truck: "Truck",
  stock: "Stock",
  tools: "Tools",
  overhead: "Overhead",
};

/** Category + allocation written when the receipt is not a client job. */
export function patchForNonJobDestination(destination: Exclude<ReceiptDestination, "job">): {
  allocation: Exclude<ReceiptDestination, "job">;
  category: ExpenseCategory;
} {
  if (destination === "truck") return { allocation: "truck", category: "vehicle" };
  if (destination === "tools") return { allocation: "tools", category: "tools" };
  if (destination === "stock") return { allocation: "stock", category: "materials" };
  return { allocation: "overhead", category: "other" };
}
