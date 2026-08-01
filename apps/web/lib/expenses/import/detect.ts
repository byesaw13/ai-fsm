/**
 * Auto-detect store purchase CSV vendor and parse into ImportTransaction[].
 */

import { parseDelimited, parseHomeDepotCsv, type ParseResult } from "./homedepot";
import { looksLikeLowesCsv, parseLowesCsv } from "./lowes";

export type PurchaseImportSource = "home_depot_csv" | "lowes_csv";

export type DetectedPurchaseImport = ParseResult & {
  source: PurchaseImportSource;
  vendor_label: string;
};

function headerLooksLikeHomeDepot(header: string[]): boolean {
  const cells = header.map((c) => c.trim());
  return (
    cells.includes("Date") &&
    cells.includes("Transaction ID") &&
    cells.includes("SKU Description") &&
    cells.includes("Net Unit Price")
  );
}

/**
 * Try Home Depot (exact columns), then Lowe's (flexible aliases).
 */
export function parsePurchaseCsv(text: string): DetectedPurchaseImport {
  const rows = parseDelimited(text);
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (headerLooksLikeHomeDepot(rows[i]) || looksLikeLowesCsv(rows[i])) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx >= 0 && headerLooksLikeHomeDepot(rows[headerIdx])) {
    const parsed = parseHomeDepotCsv(text);
    return { ...parsed, source: "home_depot_csv", vendor_label: "Home Depot" };
  }

  if (headerIdx >= 0 && looksLikeLowesCsv(rows[headerIdx])) {
    const parsed = parseLowesCsv(text);
    return { ...parsed, source: "lowes_csv", vendor_label: "Lowe's" };
  }

  // Fallbacks: try each parser for better error messages
  try {
    const parsed = parseHomeDepotCsv(text);
    return { ...parsed, source: "home_depot_csv", vendor_label: "Home Depot" };
  } catch {
    /* continue */
  }
  try {
    const parsed = parseLowesCsv(text);
    return { ...parsed, source: "lowes_csv", vendor_label: "Lowe's" };
  } catch (err) {
    throw new Error(
      (err as Error).message ||
        "Unrecognized purchase CSV. Upload a Home Depot Pro Xtra export or a Lowe's purchase-history export.",
    );
  }
}
