/**
 * Price evidence (estimating assistant Phase 3; docs/working/estimating-assistant-phase3.md).
 *
 * TASK-210 defines the ledger types. Price selection and confidence come in TASK-213.
 */

/** Kinds writable in Phase 3. `supplier_feed` and `market` are reserved for Phase 4. */
export const OBSERVATION_KINDS = [
  "receipt",
  "supplier_csv",
  "supplier_quote",
  "manual_check",
  "catalog_summary",
  "ai_allowance",
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export const STORE_FAMILIES = ["home_depot", "lowes", "other"] as const;
export type StoreFamily = (typeof STORE_FAMILIES)[number];

export const OBSERVATION_STATUSES = ["active", "pending", "superseded", "dismissed"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export interface PriceObservation {
  id: string;
  variantId: string;
  kind: ObservationKind;
  /** YYYY-MM-DD */
  observedOn: string;
  unitPriceCents: number;
  storeFamily: StoreFamily;
  storeNumber: string | null;
  location: string | null;
  isSale: boolean;
  reconciled: boolean;
  expiresOn: string | null;
  quoteQuantity: number | null;
  status: ObservationStatus;
  sourceRef: string;
}

/** Real purchases: the only kinds counted in averages and purchase counts. */
export const PURCHASE_KINDS: readonly ObservationKind[] = ["receipt", "supplier_csv"];

/** "The Home Depot", "Home Depot #3407" and "HD 3407" are one family. Unknown stores are "other". */
export function storeFamilyOf(supplier: string | null | undefined): StoreFamily {
  const n = (supplier ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (n.includes("home depot") || n.includes("homedepot") || /^hd \d/.test(n)) return "home_depot";
  if (n.includes("lowe")) return "lowes";
  return "other";
}
