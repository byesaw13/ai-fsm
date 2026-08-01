/**
 * Lowe's purchase-history CSV importer (pure parsing — no I/O).
 *
 * Lowe's Pro / account exports vary by account type. We match headers by alias
 * so common variants work:
 *   - Pro: Invoice Number, Item Number, Item Description, Unit Cost, …
 *   - Orders: Order Number, Order Date, Product Name, Quantity, Price, …
 *
 * Groups line rows into one expense per invoice/order (external_ref).
 */

import {
  parseDelimited,
  parseMoneyCents,
  parseQuantity,
  materialCategoryFor,
  expenseCategoryFor,
  type ImportTransaction,
  type ParseResult,
} from "./homedepot";
import { findCol, parseDateISO } from "./csv-shared";

const DATE_ALIASES = [
  "date",
  "purchase date",
  "order date",
  "transaction date",
  "invoice date",
  "sale date",
];
const TXN_ALIASES = [
  "invoice number",
  "transaction number",
  "order number",
  "receipt number",
  "receipt id",
  "sales number",
  "sale number",
  "invoice id",
  "order id",
  "transaction id",
  "receipt",
];
const DESC_ALIASES = [
  "item description",
  "sku description",
  "product description",
  "product name",
  "item name",
  "description",
  "item",
  "product",
];
const SKU_ALIASES = [
  "item number",
  "item number number", // after # → number
  "sku number",
  "sku",
  "model number",
  "item id",
  "product number",
  "item no",
];
const QTY_ALIASES = ["quantity", "qty", "qnty", "ordered qty", "shipped qty"];
const UNIT_ALIASES = [
  "unit price",
  "unit cost",
  "net unit price",
  "price each",
  "each price",
  "unit amount",
  "price",
];
const EXT_ALIASES = [
  "extended price",
  "extended cost",
  "line total",
  "line amount",
  "extended amount",
  "net amount",
  "total amount",
  "amount",
  "total",
];
const JOB_ALIASES = [
  "po number",
  "po number number",
  "purchase order",
  "purchase order number",
  "project name",
  "project",
  "job name",
  "job",
  "job number",
  "cost center",
  "reference",
  "po",
];
const DEPT_ALIASES = ["department name", "department", "dept", "category", "class"];
const STORE_ALIASES = ["store number", "store", "store id", "location"];

/** True when the header row looks like a Lowe's (not Home Depot) export. */
export function looksLikeLowesCsv(header: string[]): boolean {
  const date = findCol(header, DATE_ALIASES);
  const desc = findCol(header, DESC_ALIASES);
  const txn = findCol(header, TXN_ALIASES);
  const unit = findCol(header, UNIT_ALIASES);
  const ext = findCol(header, EXT_ALIASES);
  if (date < 0 || desc < 0) return false;
  if (txn < 0 && unit < 0 && ext < 0) return false;
  // HD has very specific "SKU Description" + "Transaction ID" + "Net Unit Price"
  // If those exact labels exist, prefer HD (handled by caller).
  const exact = header.map((h) => h.trim());
  if (
    exact.includes("Transaction ID") &&
    exact.includes("SKU Description") &&
    exact.includes("Net Unit Price")
  ) {
    return false;
  }
  // Positive Lowe's signal: item number / invoice / order wording
  const sku = findCol(header, SKU_ALIASES);
  const lowesish =
    txn >= 0 ||
    sku >= 0 ||
    exact.some((h) => /lowe/i.test(h)) ||
    findCol(header, ["invoice number", "order number", "item number"]) >= 0;
  return lowesish || (unit >= 0 || ext >= 0);
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (looksLikeLowesCsv(rows[i])) return i;
  }
  return -1;
}

export function parseLowesCsv(text: string): ParseResult {
  const rows = parseDelimited(text);
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    throw new Error(
      "This doesn't look like a Lowe's purchase export (need date, item description, and invoice/order or price columns).",
    );
  }
  const header = rows[headerIdx];
  const ix = {
    date: findCol(header, DATE_ALIASES),
    txn: findCol(header, TXN_ALIASES),
    desc: findCol(header, DESC_ALIASES),
    sku: findCol(header, SKU_ALIASES),
    qty: findCol(header, QTY_ALIASES),
    unit: findCol(header, UNIT_ALIASES),
    ext: findCol(header, EXT_ALIASES),
    job: findCol(header, JOB_ALIASES),
    dept: findCol(header, DEPT_ALIASES),
    store: findCol(header, STORE_ALIASES),
  };

  const byTxn = new Map<string, ImportTransaction>();
  let totalRows = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => !String(c ?? "").trim())) continue;

    const date = parseDateISO(r[ix.date] ?? "");
    if (!date) continue;

    const desc = (ix.desc >= 0 ? r[ix.desc] : "")?.trim() ?? "";
    const qty = parseQuantity(ix.qty >= 0 ? r[ix.qty] : "1");
    let unit = ix.unit >= 0 ? parseMoneyCents(r[ix.unit]) : 0;
    const ext = ix.ext >= 0 ? parseMoneyCents(r[ix.ext]) : 0;
    // Prefer unit; if missing, derive from extended / qty
    if (unit === 0 && ext !== 0 && qty !== 0) {
      unit = Math.round(ext / qty);
    }
    // If still no money and no description, skip footer junk
    if (!desc && unit === 0 && ext === 0) continue;

    let txnId = (ix.txn >= 0 ? r[ix.txn] : "")?.trim() ?? "";
    if (!txnId) {
      // Fall back: one synthetic trip key per day+store+first line (better than dropping)
      const store = ix.store >= 0 ? (r[ix.store] ?? "").trim() : "";
      txnId = `LOWES-${date}${store ? `-${store}` : ""}-${i}`;
    }

    totalRows++;
    const jobName = ix.job >= 0 ? (r[ix.job] ?? "").trim() : "";
    const dept = ix.dept >= 0 ? (r[ix.dept] ?? "").trim() : "";
    const lineTotal = ext !== 0 ? ext : Math.round(unit * qty);

    let txn = byTxn.get(txnId);
    if (!txn) {
      txn = {
        external_ref: txnId,
        date,
        vendor: "Lowe's",
        job_name: jobName || null,
        amount_cents: 0,
        expense_category: "materials",
        line_items: [],
        is_return: false,
      };
      byTxn.set(txnId, txn);
    }
    if (!txn.job_name && jobName) txn.job_name = jobName;

    txn.amount_cents += lineTotal;
    if (desc) {
      txn.line_items.push({
        sku: ix.sku >= 0 ? ((r[ix.sku] ?? "").trim() || null) : null,
        name: desc,
        category: materialCategoryFor(dept, desc),
        unit_cost_cents: unit,
        quantity: qty,
        discounted: false,
      });
    }
  }

  const transactions = Array.from(byTxn.values()).map((t) => {
    const allDesc = t.line_items.map((li) => li.name).join(" ") + " " + (t.job_name ?? "");
    t.expense_category = expenseCategoryFor(allDesc);
    t.is_return = t.amount_cents <= 0;
    return t;
  });
  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (transactions.length === 0) {
    throw new Error("Lowe's CSV parsed but no purchase rows were found. Check the date and amount columns.");
  }

  return { transactions, totalRows };
}
