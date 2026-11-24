/**
 * Home Depot "Purchase Tracking" CSV importer (pure parsing — no I/O).
 *
 * The export has a metadata preamble (Company Name, Phone, Date Range, …), a
 * blank line, then the real column header (`Date,Store Number,Transaction ID,…`)
 * followed by one row per purchased SKU. We group rows by Transaction ID into
 * one expense per store trip, and surface each SKU as a material price.
 *
 * Descriptions contain commas and quotes, so we use a real RFC-4180-ish parser.
 */

export type ExpenseCategory =
  | "materials" | "tools" | "fuel" | "vehicle" | "subcontractors"
  | "office" | "insurance" | "utilities" | "marketing" | "meals" | "travel" | "other";

export type MaterialCategory =
  | "paint" | "lumber" | "hardware" | "concrete" | "fasteners"
  | "sheet_goods" | "trim" | "flooring" | "other";

export interface ImportLineItem {
  sku: string | null;
  name: string;
  category: MaterialCategory;
  unit_cost_cents: number; // net unit price (what was paid); may be negative for returns
  quantity: number;
  discounted: boolean;     // a program/other discount applied → don't let this overwrite an item's regular estimate price
}

export interface ImportTransaction {
  external_ref: string | null;   // Transaction ID (null when the export has none)
  store_number: string | null;   // Store Number (null when the export has none)
  trip_key: string;              // how rows were grouped into this trip (unique in one file)
  date: string;                  // YYYY-MM-DD
  vendor: string;                // "The Home Depot"
  job_name: string | null;       // raw HD "Job Name" tag, trimmed
  amount_cents: number;          // sum of net line totals
  expense_category: ExpenseCategory;
  line_items: ImportLineItem[];
  is_return: boolean;            // true when the trip nets <= $0 (credit) — not importable as an expense
}

export type SkipReason = "bad_date" | "bad_price" | "return" | "zero_line";

/** A row that did not become a price (listed in the import report). */
export interface SkippedRow {
  line: number;
  reason: SkipReason;
  text: string;
}

export interface ParseResult {
  transactions: ImportTransaction[];
  totalRows: number;
  skipped: SkippedRow[];
}

/** A return may show a negative price, a negative quantity or both; it always reduces the trip. */
export function signedLineCents(lineCents: number, unitCents: number, quantity: number): number {
  return unitCents < 0 || quantity < 0 ? -Math.abs(lineCents) : lineCents;
}

/** The rule shared by both parsers for one priced row. */
export function rowSkipReason(rawPrice: string | undefined, unitCents: number, quantity: number): SkipReason | null {
  if (rawPrice !== undefined && rawPrice.trim() && !/\d/.test(rawPrice)) return "bad_price";
  if (unitCents < 0 || quantity < 0) return "return";
  if (unitCents === 0) return "zero_line";
  return null;
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: quoted fields, escaped quotes, CRLF tolerant)
// ---------------------------------------------------------------------------

export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip BOM
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; }
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* swallow; \n handles line end */ }
    else { field += c; }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Money / number helpers
// ---------------------------------------------------------------------------

/** "$31.98" → 3198, "-$13.50" → -1350, "($5.00)" → -500, "" → 0 */
export function parseMoneyCents(raw: string | undefined): number {
  if (!raw) return 0;
  let t = raw.trim();
  if (!t) return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
  if (t.includes("-")) sign = -1;
  const n = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return 0;
  return Math.round(n * 100) * sign;
}

export function parseQuantity(raw: string | undefined): number {
  if (!raw) return 1;
  const n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) || n === 0 ? 1 : n;
}

// ---------------------------------------------------------------------------
// Category mapping (HD Department/Class → our enums)
// ---------------------------------------------------------------------------

const MATERIAL_BY_DEPT: Array<[RegExp, MaterialCategory]> = [
  [/paint/i, "paint"],
  [/lumber/i, "lumber"],
  [/millwork|trim|molding|moulding|door|window/i, "trim"],
  [/hardware|fasten|electrical|plumb/i, "hardware"],
  [/concrete|masonry|bldg|building/i, "concrete"],
  [/floor|tile/i, "flooring"],
  [/drywall|panel|sheet/i, "sheet_goods"],
];

export function materialCategoryFor(dept: string, desc: string): MaterialCategory {
  const hay = `${dept} ${desc}`;
  if (/\bscrew|\bnail|\banchor|\bbolt|\bfasten/i.test(hay)) return "fasteners";
  for (const [re, cat] of MATERIAL_BY_DEPT) if (re.test(hay)) return cat;
  return "other";
}

const TOOL_RE = /\b(tool|saw|drill|driver|blade|bit|sander|grinder|wrench|pliers|hammer|chisel|clamp|level|tape measure|vacuum|vac|ladder)\b/i;

export function expenseCategoryFor(transactionDesc: string): ExpenseCategory {
  // A trip is "tools" only if it's clearly tool-dominated; otherwise materials.
  return TOOL_RE.test(transactionDesc) && !/paint|lumber|drywall|screw|nail/i.test(transactionDesc)
    ? "tools"
    : "materials";
}

// ---------------------------------------------------------------------------
// Header detection + column mapping
// ---------------------------------------------------------------------------

// Store Number and Transaction ID are optional: rows without them become review records.
const REQUIRED_HEADERS = ["Date", "SKU Description", "Net Unit Price"];

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim());
    if (REQUIRED_HEADERS.every((h) => cells.includes(h))) return i;
  }
  return -1;
}

function colIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.trim() === name);
}

// ---------------------------------------------------------------------------
// Main parse
// ---------------------------------------------------------------------------

export function parseHomeDepotCsv(text: string): ParseResult {
  const rows = parseDelimited(text);
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    throw new Error("Not a Home Depot purchase export (missing the Date, SKU Description or Net Unit Price column).");
  }
  const header = rows[headerIdx];
  const ix = {
    date: colIndex(header, "Date"),
    txn: colIndex(header, "Transaction ID"),
    store: colIndex(header, "Store Number"),
    job: colIndex(header, "Job Name"),
    sku: colIndex(header, "SKU Number"),
    desc: colIndex(header, "SKU Description"),
    qty: colIndex(header, "Quantity"),
    net: colIndex(header, "Net Unit Price"),
    dept: colIndex(header, "Department Name"),
    progDisc: colIndex(header, "Program Discount Amount"),
    otherDisc: colIndex(header, "Other Discount Amount"),
  };

  const byTxn = new Map<string, ImportTransaction>();
  const skipped: SkippedRow[] = [];
  let totalRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const cell = (k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
    const desc = cell(ix.desc);
    const rawDate = cell(ix.date);
    if (!desc && !/^\d{4}-\d{2}-\d{2}/.test(rawDate)) continue; // blanks and footers
    totalRows++;
    const line = i + 1;
    const date = rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push({ line, reason: "bad_date", text: desc });
      continue;
    }

    const txnId = cell(ix.txn);
    const store = cell(ix.store);
    const dept = cell(ix.dept);
    const qty = parseQuantity(r[ix.qty]);
    const netUnit = parseMoneyCents(r[ix.net]);
    const jobName = cell(ix.job);
    const tripKey = txnId ? `${store}:${txnId}` : `nt:${date}:${store}`;

    let txn = byTxn.get(tripKey);
    if (!txn) {
      txn = {
        external_ref: txnId || null,
        store_number: store || null,
        trip_key: tripKey,
        date,
        vendor: "The Home Depot",
        job_name: jobName || null,
        amount_cents: 0,
        expense_category: "materials",
        line_items: [],
        is_return: false,
      };
      byTxn.set(tripKey, txn);
    }
    // earliest job name on the trip wins if not yet set
    if (!txn.job_name && jobName) txn.job_name = jobName;

    const reason = rowSkipReason(r[ix.net], netUnit, qty);
    if (reason !== "bad_price") txn.amount_cents += signedLineCents(Math.round(netUnit * qty), netUnit, qty);
    if (reason) {
      skipped.push({ line, reason, text: desc });
      continue;
    }
    if (desc) {
      const discounted =
        (ix.progDisc >= 0 && parseMoneyCents(r[ix.progDisc]) > 0) ||
        (ix.otherDisc >= 0 && parseMoneyCents(r[ix.otherDisc]) > 0);
      txn.line_items.push({
        sku: cell(ix.sku) || null,
        name: desc,
        category: materialCategoryFor(dept, desc),
        unit_cost_cents: netUnit,
        quantity: qty,
        discounted,
      });
    }
  }

  const transactions = Array.from(byTxn.values()).map((t) => {
    const allDesc = t.line_items.map((li) => li.name).join(" ") + " " + (t.job_name ?? "");
    t.expense_category = expenseCategoryFor(allDesc);
    t.is_return = t.amount_cents <= 0;
    return t;
  });
  // newest first
  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { transactions, totalRows, skipped };
}
