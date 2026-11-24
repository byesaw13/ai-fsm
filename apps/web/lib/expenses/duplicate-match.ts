/**
 * Duplicate rules for store trips: CSV purchase rows vs photographed receipts
 * (TASK-211; docs/working/estimating-assistant-phase3.md §3).
 *
 * Only a full transaction identity links two records automatically: same supplier
 * family, same store (when both are known), same date and same transaction ID.
 * A shared transaction ID with a different supplier, store, date or total is a
 * "conflicting transaction ID". Every other look-alike (same store and date with
 * the same, tax-adjusted or near total) is a review candidate, never a link.
 */

export type ExpenseFingerprint = {
  id?: string;
  vendor_name: string;
  expense_date: string;
  amount_cents: number;
  external_ref?: string | null;
  store_number?: string | null;
  source?: string | null;
};

export type TripStatus = "new" | "already_imported" | "auto_link" | "review";
export type ReviewReason = "possible_duplicate" | "conflicting_transaction_id" | "no_transaction_identity";

export interface TripClassification {
  status: TripStatus;
  reason?: ReviewReason;
  /** The existing expense this trip is (or may be) the same as. */
  matchId?: string;
}

export function isCsvImportSource(source?: string | null): boolean {
  return source === "home_depot_csv" || source === "lowes_csv";
}

const AMOUNT_TOLERANCE_CENTS = 3;
const SALES_TAX_RATES = [0, 0.0625];

export function normalizeTxnId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return id.length > 0 ? id : null;
}

function normalizeStore(raw: string | null | undefined): string | null {
  const s = raw?.trim().replace(/^0+(?=\d)/, "") ?? "";
  return s ? s.toLowerCase() : null;
}

export function vendorFamily(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (n.includes("home depot") || n.includes("homedepot") || /^hd \d/.test(n)) {
    return "home_depot";
  }
  if (n.includes("lowe")) return "lowes";
  return n;
}

export function amountsLikelySame(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  if (Math.abs(a - b) <= AMOUNT_TOLERANCE_CENTS) return true;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (const rate of SALES_TAX_RATES) {
    if (Math.abs(Math.round(lo * (1 + rate)) - hi) <= AMOUNT_TOLERANCE_CENTS) {
      return true;
    }
  }
  return false;
}

export function expenseDateKey(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Same store, or the store is unknown on one side. */
function storesAgree(a?: string | null, b?: string | null): boolean {
  const x = normalizeStore(a);
  const y = normalizeStore(b);
  return !x || !y || x === y;
}

/** Records that share the candidate's full transaction identity. */
function sameIdentity(candidate: ExpenseFingerprint, existing: ExpenseFingerprint[]): ExpenseFingerprint[] {
  const txn = normalizeTxnId(candidate.external_ref);
  if (!txn) return [];
  const family = vendorFamily(candidate.vendor_name);
  return existing.filter(
    (e) =>
      e.id !== candidate.id &&
      normalizeTxnId(e.external_ref) === txn &&
      vendorFamily(e.vendor_name) === family &&
      e.expense_date.slice(0, 10) === candidate.expense_date.slice(0, 10) &&
      storesAgree(e.store_number, candidate.store_number),
  );
}

/**
 * The existing expense that is certainly the same trip: one record with the same
 * full transaction identity. Look-alikes never match here.
 */
export function findMatchingExpense(
  candidate: ExpenseFingerprint,
  existing: ExpenseFingerprint[],
): ExpenseFingerprint | null {
  const hits = sameIdentity(candidate, existing);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Classify a CSV store trip against existing expenses.
 * `hasIdentity` is false when the row lacks a store number or transaction ID.
 */
export function classifyTrip(
  candidate: ExpenseFingerprint,
  existing: ExpenseFingerprint[],
  hasIdentity: boolean = !!normalizeTxnId(candidate.external_ref) && !!normalizeStore(candidate.store_number),
): TripClassification {
  const txn = normalizeTxnId(candidate.external_ref);
  const family = vendorFamily(candidate.vendor_name);

  if (txn) {
    const same = sameIdentity(candidate, existing);
    const agreeing = same.filter((e) => e.amount_cents === candidate.amount_cents || amountsLikelySame(e.amount_cents, candidate.amount_cents));
    if (agreeing.length === 1 && hasIdentity) {
      const match = agreeing[0];
      return isCsvImportSource(match.source)
        ? { status: "already_imported", matchId: match.id }
        : { status: "auto_link", matchId: match.id };
    }
    if (agreeing.length > 1) return { status: "review", reason: "possible_duplicate" };
    const conflicting = existing.find(
      (e) => e.id !== candidate.id && normalizeTxnId(e.external_ref) === txn && !agreeing.includes(e),
    );
    if (conflicting) return { status: "review", reason: "conflicting_transaction_id", matchId: conflicting.id };
    if (agreeing.length === 1) {
      // Same transaction, but this row has no store number: never linked automatically.
      return { status: "review", reason: "no_transaction_identity", matchId: agreeing[0].id };
    }
  }

  const lookAlikes = existing.filter((e) => {
    if (e.id && e.id === candidate.id) return false;
    if (vendorFamily(e.vendor_name) !== family) return false;
    if (e.expense_date.slice(0, 10) !== candidate.expense_date.slice(0, 10)) return false;
    if (!storesAgree(e.store_number, candidate.store_number)) return false;
    const otherTxn = normalizeTxnId(e.external_ref);
    if (txn && otherTxn && otherTxn !== txn) return false;
    return amountsLikelySame(candidate.amount_cents, e.amount_cents);
  });
  if (lookAlikes.length > 0) {
    return {
      status: "review",
      reason: "possible_duplicate",
      matchId: lookAlikes.length === 1 ? lookAlikes[0].id : undefined,
    };
  }
  if (!hasIdentity) return { status: "review", reason: "no_transaction_identity" };
  return { status: "new" };
}
