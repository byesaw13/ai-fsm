/**
 * Parse Home Depot "Purchase Tracking" CSV exports into catalog learn lines.
 */
import type { CatalogLineInput } from "./catalog";

export type HdImportLine = CatalogLineInput & {
  purchasedAt: string | null;
  supplier: string;
  department: string | null;
  rawIndex: number;
};

export type HdParseResult = {
  lines: HdImportLine[];
  skipped: { row: number; reason: string }[];
};

const HD_SUPPLIER = "Home Depot";

/** Map HD department-ish text to materials_price_book categories. */
export function mapHdDepartmentToCategory(dept: string | null | undefined): string {
  const d = (dept ?? "").toUpperCase();
  if (d.includes("PAINT") || d.includes("CAULK")) return "paint";
  if (d.includes("LUMBER") || d.includes("BUILDING MATERIAL")) return "lumber";
  if (d.includes("MILLWORK") || d.includes("MOULD") || d.includes("TRIM")) return "trim";
  if (d.includes("FLOOR") || d.includes("TILE") || d.includes("VINYL")) return "flooring";
  if (d.includes("CONCRETE") || d.includes("MASONRY")) return "concrete";
  if (d.includes("FASTENER") || d.includes("NAIL") || d.includes("SCREW")) return "fasteners";
  if (d.includes("SHEET") || d.includes("DRYWALL") || d.includes("PLYWOOD")) return "sheet_goods";
  if (
    d.includes("HARDWARE") ||
    d.includes("PLUMBING") ||
    d.includes("ELECTRICAL") ||
    d.includes("HVAC")
  ) {
    return "hardware";
  }
  return "other";
}

function parseMoneyToCents(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  // Returns / credits are negative — skip at caller; here return signed cents.
  return Math.round(n * 100);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Parse HD purchase history export. Skips header preamble until the Date,... header row.
 */
export function parseHomeDepotPurchaseCsv(csvText: string): HdParseResult {
  const rows = parseCsvRows(csvText);
  const skipped: HdParseResult["skipped"] = [];
  const lines: HdImportLine[] = [];

  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].map((c) => c.trim().toLowerCase());
    if (joined.includes("date") && joined.includes("sku number") && joined.some((h) => h.includes("sku description"))) {
      headerIdx = i;
      headers = rows[i].map((c) => c.trim().toLowerCase());
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      lines: [],
      skipped: [{ row: 0, reason: "Could not find Home Depot header row (Date, SKU Number, …)" }],
    };
  }

  const col = (name: string) => headers.indexOf(name);

  const iDate = col("date");
  const iSku = col("sku number");
  const iDesc = col("sku description");
  const iNet =
    headers.indexOf("net unit price") >= 0
      ? headers.indexOf("net unit price")
      : headers.indexOf("unit price");
  const iDept = col("department name");
  const iQty = col("quantity");

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (idx: number) => (idx >= 0 && idx < row.length ? row[idx].trim() : "");

    const name = get(iDesc);
    const sku = get(iSku);
    const cents = parseMoneyToCents(get(iNet));
    const dateRaw = get(iDate);
    const dept = get(iDept) || null;
    const qtyRaw = get(iQty);
    const qty = qtyRaw ? Number(qtyRaw) : 1;

    if (!name && !sku) {
      skipped.push({ row: r + 1, reason: "empty row" });
      continue;
    }
    if (cents == null) {
      skipped.push({ row: r + 1, reason: "missing unit price" });
      continue;
    }
    if (cents < 0) {
      skipped.push({ row: r + 1, reason: "return/credit (negative price)" });
      continue;
    }
    if (!name) {
      skipped.push({ row: r + 1, reason: "missing description" });
      continue;
    }

    let purchasedAt: string | null = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
      purchasedAt = dateRaw.slice(0, 10);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateRaw)) {
      const [mm, dd, yy] = dateRaw.split(/[/\s]/)[0].split("/");
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      purchasedAt = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    lines.push({
      name,
      sku: sku || null,
      unit_cost_cents: cents,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: "each",
      purchasedAt,
      supplier: HD_SUPPLIER,
      department: dept,
      rawIndex: r + 1,
    });
  }

  return { lines, skipped };
}
