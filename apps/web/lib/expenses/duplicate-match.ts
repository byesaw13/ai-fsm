/**
 * Hybrid duplicate matcher: CSV store trips vs photographed receipts.
 *
 * 1. Same normalized transaction id → same trip.
 * 2. Else same store family + calendar date + amount (exact or MA-tax).
 * Differing transaction ids never match. Two equally good hits → no match.
 */

export type ExpenseFingerprint = {
  id?: string;
  vendor_name: string;
  expense_date: string;
  amount_cents: number;
  external_ref?: string | null;
  source?: string | null;
};

function isCsvImportSource(source?: string | null): boolean {
  return source === "home_depot_csv" || source === "lowes_csv";
}

const AMOUNT_TOLERANCE_CENTS = 3;
const SALES_TAX_RATES = [0, 0.0625];

export function normalizeTxnId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const id = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return id.length > 0 ? id : null;
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

export function findMatchingExpense(
  candidate: ExpenseFingerprint,
  existing: ExpenseFingerprint[],
): ExpenseFingerprint | null {
  const candTxn = normalizeTxnId(candidate.external_ref);
  const family = vendorFamily(candidate.vendor_name);
  if (candTxn) {
    const byRef = existing.filter(
      (e) =>
        normalizeTxnId(e.external_ref) === candTxn &&
        vendorFamily(e.vendor_name) === family,
    );
    if (byRef.length === 1) return byRef[0];
    if (byRef.length > 1) return null;
  }

  const hits = existing.filter((e) => {
    if (e.id && candidate.id && e.id === candidate.id) return false;
    if (vendorFamily(e.vendor_name) !== family) return false;
    if (e.expense_date.slice(0, 10) !== candidate.expense_date.slice(0, 10)) return false;
    const existingTxn = normalizeTxnId(e.external_ref);
    if (candTxn && existingTxn && candTxn !== existingTxn) return false;
    return amountsLikelySame(candidate.amount_cents, e.amount_cents);
  });
  return hits.length === 1 ? hits[0] : null;
}

export function csvImportStatus(
  candidate: ExpenseFingerprint,
  existing: ExpenseFingerprint[],
): "new" | "already_imported" | "matched_receipt" {
  const match = findMatchingExpense(candidate, existing);
  if (!match) return "new";
  const sameRef =
    normalizeTxnId(match.external_ref) === normalizeTxnId(candidate.external_ref);
  if (sameRef && isCsvImportSource(match.source)) return "already_imported";
  return "matched_receipt";
}
